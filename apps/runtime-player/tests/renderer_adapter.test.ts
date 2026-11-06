import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RendererAdapter } from '../src/adapters/RendererAdapter';
import type { GameRenderer, CatchUpVisualState } from '@vn-engine/renderer';
import type { Instruction, ShowInstruction, BackgroundInstruction } from '@vn-engine/shared-types';
import type { DiagnosticBus } from '../src/services/diagnosticBus';

describe('RendererAdapter', () => {
  let mockGameRenderer: GameRenderer;

  beforeEach(() => {
    mockGameRenderer = {
      baseWidth: 1920,
      baseHeight: 1080,
      init: vi.fn().mockResolvedValue(undefined),
      resizeToContainer: vi.fn(),
      setBackground: vi.fn().mockResolvedValue(undefined),
      showCharacter: vi.fn().mockResolvedValue(undefined),
      hideCharacter: vi.fn(),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,samplethumbnail'),
      getCurrentBackgroundId: vi.fn(() => 'bg_classroom'),
      hasCharacter: vi.fn((charId: string) => charId === 'alice'),
    } as unknown as GameRenderer;
  });

  describe('Visual Side Effect Application (applySideEffect)', () => {
    it('should dispatch BACKGROUND instruction to GameRenderer.setBackground', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);
      const bgInstr: BackgroundInstruction = {
        type: 'BACKGROUND',
        assetId: 'bg_park',
        transition: 'fade',
        duration: 1.0,
      };

      await adapter.applySideEffect(bgInstr);
      expect(mockGameRenderer.setBackground).toHaveBeenCalledWith(
        bgInstr,
        'fade',
        expect.any(Function),
      );
    });

    it('should dispatch SHOW instruction to GameRenderer.showCharacter', async () => {
      const isPropChecker = vi.fn((id: string) => id === 'prop_key');
      const adapter = new RendererAdapter(mockGameRenderer, { isPropChecker });

      const showInstr: ShowInstruction = {
        type: 'SHOW',
        character: 'alice',
        sprite: 'happy',
        position: 'center',
        transition: 'slide',
        duration: 0.5,
      };

      await adapter.applySideEffect(showInstr);
      expect(mockGameRenderer.showCharacter).toHaveBeenCalledWith(
        showInstr,
        expect.any(Function),
        false, // not a prop
      );

      const propInstr: ShowInstruction = {
        type: 'SHOW',
        character: 'prop_key',
        sprite: 'default',
        position: 'center',
      };

      await adapter.applySideEffect(propInstr);
      expect(mockGameRenderer.showCharacter).toHaveBeenCalledWith(
        propInstr,
        expect.any(Function),
        true, // is a prop
      );
    });

    it('should dispatch HIDE instruction to GameRenderer.hideCharacter', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);
      const hideInstr: Instruction = {
        type: 'HIDE',
        character: 'alice',
      };

      await adapter.applySideEffect(hideInstr);
      expect(mockGameRenderer.hideCharacter).toHaveBeenCalledWith('alice');
    });

    it('should ignore HIDE_DIALOGUE and non-visual instructions without throwing', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);

      await expect(adapter.applySideEffect({ type: 'HIDE_DIALOGUE' })).resolves.not.toThrow();
      await expect(
        adapter.applySideEffect({
          type: 'ASSIGN',
          variable: 'score',
          value: { type: 'Literal', value: 10 },
        }),
      ).resolves.not.toThrow();
      await expect(
        adapter.applySideEffect({
          type: 'PLAY',
          channel: 'music',
          assetId: 'bgm_main',
        }),
      ).resolves.not.toThrow();

      expect(mockGameRenderer.setBackground).not.toHaveBeenCalled();
      expect(mockGameRenderer.showCharacter).not.toHaveBeenCalled();
    });
  });

  describe('Visual Catch-Up Synchronization (syncStateCatchUp)', () => {
    it('should forward CatchUpVisualState to GameRenderer.syncStateCatchUp', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);
      const catchUp: CatchUpVisualState = {
        background: { type: 'BACKGROUND', assetId: 'bg_bedroom' },
        sprites: new Map([
          ['alice', { type: 'SHOW', character: 'alice', sprite: 'smile', position: 'left' }],
        ]),
      };

      await adapter.syncStateCatchUp(catchUp);
      expect(mockGameRenderer.syncStateCatchUp).toHaveBeenCalledWith(
        catchUp,
        expect.any(Function),
        expect.any(Function),
      );
    });
  });

  describe('Thumbnail Capture with Canvas Taint Protection (captureThumbnail)', () => {
    it('should return captured thumbnail data URL on normal execution', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);
      const thumb = await adapter.captureThumbnail();

      expect(mockGameRenderer.captureThumbnail).toHaveBeenCalledWith(320, 180);
      expect(thumb).toBe('data:image/jpeg;base64,samplethumbnail');
    });

    it('should return a blank 16:9 SVG placeholder data URL when SecurityError is thrown (tainted canvas)', async () => {
      const taintedRenderer = {
        ...mockGameRenderer,
        captureThumbnail: vi
          .fn()
          .mockRejectedValue(
            new DOMException(
              'Failed to execute toDataURL on HTMLCanvasElement: Tainted canvases may not be exported.',
              'SecurityError',
            ),
          ),
      } as unknown as GameRenderer;

      const adapter = new RendererAdapter(taintedRenderer);
      const thumb = await adapter.captureThumbnail();

      expect(thumb).toContain('data:image/svg+xml');
      expect(thumb).toMatch(/(<svg|%3Csvg)/i);
      expect(thumb).toMatch(/(320|16).*?(180|9)/);
    });

    it('should return fallback SVG placeholder when generic error occurs during capture', async () => {
      const brokenRenderer = {
        ...mockGameRenderer,
        captureThumbnail: vi.fn().mockRejectedValue(new Error('WebGL context lost')),
      } as unknown as GameRenderer;

      const adapter = new RendererAdapter(brokenRenderer);
      const thumb = await adapter.captureThumbnail();

      expect(thumb).toContain('data:image/svg+xml');
    });
  });

  describe('Phase 1: Diagnostic Telemetry & Asset Error Correlation (TASK-player-ui-and-scaler)', () => {
    it('TEST-DIAG-01: should correlate async asset load failure via pendingAssetLocations and dispatch ERR_ASSET_LOAD_FAILED to DiagnosticBus', async () => {
      const mockDiagnosticBus: DiagnosticBus = {
        report: vi.fn(),
      };
      const adapter = new RendererAdapter(mockGameRenderer, {
        diagnosticBus: mockDiagnosticBus,
      });

      const showInstr: ShowInstruction = {
        type: 'SHOW',
        character: 'alice',
        sprite: 'happy',
        loc: { fileId: 'scenes/act1.vns', line: 120, col: 4 },
      };

      await adapter.applySideEffect(showInstr);

      // Trigger asset load failure callback on adapter
      adapter.handleAssetError('alice_happy', new Error('HTTP 404 Not Found'));

      expect(mockDiagnosticBus.report).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'asset',
          code: 'ERR_ASSET_LOAD_FAILED',
          severity: 'error',
          fileId: 'scenes/act1.vns',
          line: 120,
          col: 4,
          message: expect.stringContaining('alice_happy'),
        }),
      );
    });

    it('TEST-DIAG-02: should report ERR_MISSING_GRAPHIC to DiagnosticBus when asset key does not exist in registry', () => {
      const mockDiagnosticBus: DiagnosticBus = {
        report: vi.fn(),
      };
      const adapter = new RendererAdapter(mockGameRenderer, {
        diagnosticBus: mockDiagnosticBus,
      });

      adapter.handleMissingGraphic('missing_bg_garden', {
        fileId: 'scenes/prologue.vns',
        line: 15,
        col: 1,
      });

      expect(mockDiagnosticBus.report).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'asset',
          code: 'ERR_MISSING_GRAPHIC',
          severity: 'error',
          fileId: 'scenes/prologue.vns',
          line: 15,
          col: 1,
        }),
      );
    });
  });
});
