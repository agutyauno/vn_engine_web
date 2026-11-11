import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RendererAdapter } from '../src/adapters/RendererAdapter';
import type { GameRenderer, CatchUpVisualState } from '@vn-engine/renderer';
import type { ShowInstruction, HideInstruction, BackgroundInstruction } from '@vn-engine/shared-types';
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
      showSprite: vi.fn().mockResolvedValue(undefined),
      hideSprite: vi.fn(),
      hasSprite: vi.fn((targetId: string) => targetId === 'alice'),
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

    it('[TC-SPRITE-REND-ADAPT-01] should dispatch SHOW instruction directly to GameRenderer.showSprite without isPropChecker', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);

      const showInstr: ShowInstruction = {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'happy',
        character: 'alice',
        position: 'center',
        transition: 'slide',
        duration: 0.5,
      };

      await adapter.applySideEffect(showInstr);
      expect(mockGameRenderer.showSprite).toHaveBeenCalledWith(
        showInstr,
        expect.any(Function),
      );

      const propInstr: ShowInstruction = {
        type: 'SHOW',
        targetId: 'prop_key',
        variant: 'default',
        character: 'prop_key',
        position: 'center',
      };

      await adapter.applySideEffect(propInstr);
      expect(mockGameRenderer.showSprite).toHaveBeenCalledWith(
        propInstr,
        expect.any(Function),
      );
    });

    it('[TC-SPRITE-REND-ADAPT-02] should dispatch HIDE instruction directly to GameRenderer.hideSprite by targetId', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);
      const hideInstr: HideInstruction = {
        type: 'HIDE',
        targetId: 'sword_legendary',
        character: 'sword',
      };

      await adapter.applySideEffect(hideInstr);
      expect(mockGameRenderer.hideSprite).toHaveBeenCalledWith('sword_legendary');
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
      expect(mockGameRenderer.showSprite).not.toHaveBeenCalled();
    });
  });

  describe('Visual Catch-Up Synchronization (syncStateCatchUp)', () => {
    it('[CLEANUP-PROP-CHECKER] should forward CatchUpVisualState to GameRenderer.syncStateCatchUp without propChecker', async () => {
      const adapter = new RendererAdapter(mockGameRenderer);
      const catchUp: CatchUpVisualState = {
        background: { type: 'BACKGROUND', assetId: 'bg_bedroom' },
        sprites: new Map([
          ['alice', { type: 'SHOW', targetId: 'alice', variant: 'smile', character: 'alice', position: 'left' }],
        ]),
      };

      await adapter.syncStateCatchUp(catchUp);
      expect(mockGameRenderer.syncStateCatchUp).toHaveBeenCalledWith(
        catchUp,
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

  describe('Diagnostic Telemetry & Asset Error Correlation', () => {
    it('should correlate async asset load failure via pendingAssetLocations and dispatch ERR_ASSET_LOAD_FAILED to DiagnosticBus', async () => {
      const mockDiagnosticBus: DiagnosticBus = {
        report: vi.fn(),
      };
      const adapter = new RendererAdapter(mockGameRenderer, {
        diagnosticBus: mockDiagnosticBus,
      });

      const showInstr: ShowInstruction = {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'happy',
        character: 'alice',
        sprite: 'happy',
        loc: { fileId: 'scenes/act1.vns', line: 120, col: 4 },
      };

      await adapter.applySideEffect(showInstr);

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

    it('should report ERR_MISSING_GRAPHIC to DiagnosticBus when asset key does not exist in registry', () => {
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
