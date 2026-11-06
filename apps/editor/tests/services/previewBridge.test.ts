// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PreviewBridge,
  isAllowedPreviewOrigin,
  buildPreviewUrl,
  type PreviewBridgeOptions,
} from '../../src/core/services/previewBridge';
import { usePreviewStore, type HotReloadPayload } from '../../src/core/stores/livePreviewStore';
import { useDiagnosticsStore } from '../../src/core/stores/diagnosticsStore';
import { setupTestStore } from '../testStoreHelpers';
import type { ProjectRepository } from '../../src/core/contracts/repository';
import type { EngineDiagnostic, Instruction } from '@vn-engine/shared-types';

describe('PreviewBridge (Phase 3 Two-Way Live Preview Bus)', () => {
  let mockTargetWindow: { postMessage: ReturnType<typeof vi.fn> };
  let mockRepository: Partial<ProjectRepository>;
  let bridge: PreviewBridge | null = null;

  const TEST_PREVIEW_ORIGIN = 'https://runtime.usercontent-platform.com';
  const TEST_LOCAL_ORIGIN = 'http://localhost:5173';

  const samplePayload1: HotReloadPayload = {
    program: [{ opcode: 'PUSH', args: [1] } as unknown as Instruction],
    projectId: 'proj-preview-1',
    characters: [],
    assets: [],
  };

  const samplePayload2: HotReloadPayload = {
    program: [{ opcode: 'PUSH', args: [2] } as unknown as Instruction],
    projectId: 'proj-preview-1',
    characters: [{ id: 'hero', name: 'Hero', defaultExpression: 'normal', sprites: {} }],
    assets: [],
  };

  beforeEach(() => {
    setupTestStore();
    vi.useFakeTimers();

    mockTargetWindow = {
      postMessage: vi.fn(),
    };

    mockRepository = {
      getAssetBlob: vi.fn(),
    };
  });

  afterEach(() => {
    if (bridge) {
      bridge.dispose();
      bridge = null;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createBridge(options?: Partial<PreviewBridgeOptions>): PreviewBridge {
    bridge = new PreviewBridge({
      targetWindow: () => mockTargetWindow as unknown as Window,
      previewOrigin: TEST_PREVIEW_ORIGIN,
      localOrigin: TEST_LOCAL_ORIGIN,
      repository: mockRepository as ProjectRepository,
      watchdogTimeoutMs: 3000,
      ...options,
    });
    return bridge;
  }

  // ==========================================
  // 1. SECURITY & ORIGIN VALIDATION
  // ==========================================
  describe('1. Security & Origin Validation', () => {
    it('TC-SEC-01: accepts messages from valid allowed preview origins', () => {
      expect(isAllowedPreviewOrigin('http://localhost:3000', TEST_PREVIEW_ORIGIN)).toBe(true);
      expect(isAllowedPreviewOrigin('http://127.0.0.1:3000', TEST_PREVIEW_ORIGIN)).toBe(true);
      expect(
        isAllowedPreviewOrigin(
          'https://tenant-1.usercontent-platform.com',
          TEST_PREVIEW_ORIGIN
        )
      ).toBe(true);
      expect(isAllowedPreviewOrigin(TEST_PREVIEW_ORIGIN, TEST_PREVIEW_ORIGIN)).toBe(true);
      expect(isAllowedPreviewOrigin(TEST_LOCAL_ORIGIN, TEST_PREVIEW_ORIGIN, TEST_LOCAL_ORIGIN)).toBe(
        true
      );
    });

    it('TC-SEC-02: rejects and ignores messages from unauthorized or malicious origins', async () => {
      const activeBridge = createBridge();

      const maliciousEvent = new MessageEvent('message', {
        origin: 'https://malicious-attacker.com',
        data: {
          type: 'PREVIEW_STATE_UPDATE',
          variables: { hacked: true },
        },
      });

      await activeBridge.handleMessage(maliciousEvent);

      expect(usePreviewStore.getState().watchedVariables).toEqual({});
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });

    it('TC-SEC-03: ensures all postMessage calls explicitly specify target previewOrigin (no wildcard *)', () => {
      const activeBridge = createBridge();

      activeBridge.probeReady();

      expect(mockTargetWindow.postMessage).toHaveBeenCalled();
      for (const call of mockTargetWindow.postMessage.mock.calls) {
        const targetOrigin = call[1];
        expect(targetOrigin).toBe(TEST_PREVIEW_ORIGIN);
        expect(targetOrigin).not.toBe('*');
      }
    });
  });

  // ==========================================
  // 2. HANDSHAKE PROTOCOL & LIFECYCLE
  // ==========================================
  describe('2. Handshake Protocol & Lifecycle', () => {
    it('TC-HSH-01: sends QUERY_READY probe to targetWindow when probeReady is invoked', () => {
      const activeBridge = createBridge();

      activeBridge.probeReady();

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        { type: 'QUERY_READY' },
        TEST_PREVIEW_ORIGIN
      );
    });

    it('TC-HSH-02: replies with PLAYER_READY_ACK and transitions connectionStatus to connected when PLAYER_READY is received', async () => {
      const activeBridge = createBridge();
      expect(usePreviewStore.getState().connectionStatus).toBe('standby');

      const readyEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: { type: 'PLAYER_READY' },
      });

      await activeBridge.handleMessage(readyEvent);

      expect(usePreviewStore.getState().connectionStatus).toBe('connected');
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        { type: 'PLAYER_READY_ACK' },
        TEST_PREVIEW_ORIGIN
      );
    });

    it('TC-HSH-03: enters disconnected status if handshake times out and supports re-probing', () => {
      const activeBridge = createBridge({ watchdogTimeoutMs: 3000 });

      activeBridge.probeReady();
      expect(usePreviewStore.getState().connectionStatus).toBe('standby');

      // Advance timers past watchdog threshold
      vi.advanceTimersByTime(3500);

      expect(usePreviewStore.getState().connectionStatus).toBe('disconnected');

      // Re-probe should send QUERY_READY again
      activeBridge.probeReady();
      expect(mockTargetWindow.postMessage).toHaveBeenLastCalledWith(
        { type: 'QUERY_READY' },
        TEST_PREVIEW_ORIGIN
      );
    });
  });

  // ==========================================
  // 3. DECLARATIVE PENDING STATE FLUSH
  // ==========================================
  describe('3. Declarative Pending State Flush (No FIFO Queue)', () => {
    it('TC-SYN-01: buffers hotReload into livePreviewStore.pendingProgram with last-write-wins when disconnected', () => {
      const activeBridge = createBridge();
      expect(usePreviewStore.getState().connectionStatus).toBe('standby');

      activeBridge.hotReload(samplePayload1);
      expect(usePreviewStore.getState().pendingProgram).toEqual(samplePayload1);
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();

      // Second compilation overwrites previous pending payload
      activeBridge.hotReload(samplePayload2);
      expect(usePreviewStore.getState().pendingProgram).toEqual(samplePayload2);
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });

    it('TC-SYN-02: accumulates sendVariable into pendingVariableOverrides when disconnected', () => {
      const activeBridge = createBridge();

      activeBridge.sendVariable('gold', 100);
      activeBridge.sendVariable('affinity', 5);

      expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({
        gold: 100,
        affinity: 5,
      });
      expect(mockTargetWindow.postMessage).not.toHaveBeenCalled();
    });

    it('TC-SYN-03: flushes pendingProgram and variable overrides upon receiving PLAYER_READY then clears pending state', async () => {
      const activeBridge = createBridge();

      // Stage pending data before connection
      activeBridge.hotReload(samplePayload1);
      activeBridge.sendVariable('gold', 250);
      activeBridge.sendVariable('heroName', 'Alice');

      expect(usePreviewStore.getState().pendingProgram).toEqual(samplePayload1);
      expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({
        gold: 250,
        heroName: 'Alice',
      });

      // Player establishes connection
      const readyEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: { type: 'PLAYER_READY' },
      });

      await activeBridge.handleMessage(readyEvent);

      // Verify handshake ACK
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        { type: 'PLAYER_READY_ACK' },
        TEST_PREVIEW_ORIGIN
      );

      // Verify hot reload program flush
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'HOT_RELOAD_PROGRAM',
          payload: samplePayload1,
        },
        TEST_PREVIEW_ORIGIN
      );

      // Verify variable override flushes
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'SET_VM_VARIABLE',
          name: 'gold',
          value: 250,
        },
        TEST_PREVIEW_ORIGIN
      );
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'SET_VM_VARIABLE',
          name: 'heroName',
          value: 'Alice',
        },
        TEST_PREVIEW_ORIGIN
      );

      // State stores must be cleanly cleared
      expect(usePreviewStore.getState().pendingProgram).toBeNull();
      expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({});
      expect(usePreviewStore.getState().connectionStatus).toBe('connected');
    });

    it('TC-SYN-04: sends directly to targetWindow immediately without buffering when already connected', () => {
      const activeBridge = createBridge();
      usePreviewStore.getState().setConnectionStatus('connected');

      activeBridge.hotReload(samplePayload1);

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'HOT_RELOAD_PROGRAM',
          payload: samplePayload1,
        },
        TEST_PREVIEW_ORIGIN
      );
      expect(usePreviewStore.getState().pendingProgram).toBeNull();

      activeBridge.sendVariable('stamina', 80);

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'SET_VM_VARIABLE',
          name: 'stamina',
          value: 80,
        },
        TEST_PREVIEW_ORIGIN
      );
      expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({});
    });

    it('TC-SYN-05: flushes to event.source directly upon PLAYER_READY even if targetWindow() returns null', async () => {
      const activeBridge = createBridge({
        targetWindow: () => null,
      });

      activeBridge.hotReload(samplePayload1);
      expect(usePreviewStore.getState().pendingProgram).toEqual(samplePayload1);

      const mockSourceWindow = { postMessage: vi.fn() };
      const readyEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: { type: 'PLAYER_READY' },
        source: mockSourceWindow as unknown as MessageEventSource,
      });

      await activeBridge.handleMessage(readyEvent);

      expect(mockSourceWindow.postMessage).toHaveBeenCalledWith(
        { type: 'PLAYER_READY_ACK' },
        TEST_PREVIEW_ORIGIN
      );
      expect(mockSourceWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'HOT_RELOAD_PROGRAM',
          payload: samplePayload1,
        },
        TEST_PREVIEW_ORIGIN
      );
      expect(usePreviewStore.getState().pendingProgram).toBeNull();
    });

    it('TC-SYN-06: falls back to getProgramPayload() when pendingProgram is null upon PLAYER_READY', async () => {
      const getProgramPayload = vi.fn().mockReturnValue(samplePayload2);
      const activeBridge = createBridge({
        getProgramPayload,
      });

      expect(usePreviewStore.getState().pendingProgram).toBeNull();

      const mockSourceWindow = { postMessage: vi.fn() };
      const readyEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: { type: 'PLAYER_READY' },
        source: mockSourceWindow as unknown as MessageEventSource,
      });

      await activeBridge.handleMessage(readyEvent);

      expect(getProgramPayload).toHaveBeenCalled();
      expect(mockSourceWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'HOT_RELOAD_PROGRAM',
          payload: samplePayload2,
        },
        TEST_PREVIEW_ORIGIN
      );
    });
  });

  // ==========================================
  // 4. LOCAL ASSET BLOB BRIDGE
  // ==========================================
  describe('4. Local Asset Blob Bridge', () => {
    it('TC-AST-01: reads blob from repository, converts to ArrayBuffer, and responds with ASSET_BLOB_RESPONSE and transfer buffer', async () => {
      const activeBridge = createBridge();

      const arrayBuffer = new Uint8Array([10, 20, 30, 40]).buffer;
      const fakeBlob = {
        type: 'image/png',
        arrayBuffer: vi.fn().mockResolvedValue(arrayBuffer),
      } as unknown as Blob;

      (mockRepository.getAssetBlob as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlob);

      const requestEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: {
          type: 'GET_ASSET_BLOB',
          assetId: 'asset-bg-classroom',
          requestId: 'req-001',
        },
      });

      await activeBridge.handleMessage(requestEvent);

      expect(mockRepository.getAssetBlob).toHaveBeenCalledWith('asset-bg-classroom');
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'ASSET_BLOB_RESPONSE',
          assetId: 'asset-bg-classroom',
          requestId: 'req-001',
          mimeType: 'image/png',
          buffer: arrayBuffer,
        },
        TEST_PREVIEW_ORIGIN,
        [arrayBuffer]
      );
    });

    it('TC-AST-02: returns ASSET_BLOB_RESPONSE with error NOT_FOUND when repository does not have the asset', async () => {
      const activeBridge = createBridge();

      (mockRepository.getAssetBlob as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const requestEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: {
          type: 'GET_ASSET_BLOB',
          assetId: 'missing-asset',
          requestId: 'req-404',
        },
      });

      await activeBridge.handleMessage(requestEvent);

      expect(mockRepository.getAssetBlob).toHaveBeenCalledWith('missing-asset');
      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'ASSET_BLOB_RESPONSE',
          assetId: 'missing-asset',
          requestId: 'req-404',
          error: 'NOT_FOUND',
        },
        TEST_PREVIEW_ORIGIN
      );
    });
  });

  // ==========================================
  // 5. RUNTIME INSPECTION & DIAGNOSTICS
  // ==========================================
  describe('5. Runtime Inspection & Diagnostics', () => {
    it('TC-RT-01: syncs runtime variables into livePreviewStore when PREVIEW_STATE_UPDATE is received', async () => {
      const activeBridge = createBridge();

      const stateUpdateEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: {
          type: 'PREVIEW_STATE_UPDATE',
          variables: {
            playerHp: 100,
            gold: 500,
            chapter: 'prologue',
          },
        },
      });

      await activeBridge.handleMessage(stateUpdateEvent);

      expect(usePreviewStore.getState().watchedVariables).toEqual({
        playerHp: 100,
        gold: 500,
        chapter: 'prologue',
      });
    });

    it('TC-RT-02: forwards runtime engine diagnostics into diagnosticsStore when ENGINE_DIAGNOSTIC is received', async () => {
      const activeBridge = createBridge();

      const diagnostic: EngineDiagnostic = {
        id: 'diag-rt-1',
        timestamp: 1600000000000,
        category: 'runtime',
        severity: 'error',
        message: 'Undefined variable accessed in line 42',
        line: 42,
      };

      const diagEvent = new MessageEvent('message', {
        origin: TEST_PREVIEW_ORIGIN,
        data: {
          type: 'ENGINE_DIAGNOSTIC',
          diagnostic,
        },
      });

      await activeBridge.handleMessage(diagEvent);

      const diagState = useDiagnosticsStore.getState();
      expect(diagState.runtimeDiagnostics).toHaveLength(1);
      expect(diagState.runtimeDiagnostics[0]).toEqual(diagnostic);
      expect(diagState.errorCount).toBe(1);
    });

    it('cleans up event listeners and timers upon dispose', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const activeBridge = createBridge();

      activeBridge.dispose();

      expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('PreviewBridge URL Building and Project Isolation', () => {
    it('builds preview url with mode=preview, embedded=true, and projectId', () => {
      const url = buildPreviewUrl('http://localhost:3000', 'proj_alpha');
      expect(url).toContain('mode=preview');
      expect(url).toContain('embedded=true');
      expect(url).toContain('projectId=proj_alpha');
    });

    it('builds popout preview url with popout=true and projectId', () => {
      const url = buildPreviewUrl('http://localhost:3000', 'proj_beta', { isPopout: true });
      expect(url).toContain('mode=preview');
      expect(url).toContain('popout=true');
      expect(url).toContain('projectId=proj_beta');
      expect(url).not.toContain('embedded=true');
    });
  });
});

