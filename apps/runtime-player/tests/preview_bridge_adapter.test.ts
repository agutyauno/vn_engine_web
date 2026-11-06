import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreviewBridgeAdapter, isAllowedEditorOrigin } from '../src/adapters/PreviewBridgeAdapter';
import type { Instruction, EngineDiagnostic } from '@vn-engine/shared-types';

describe('PreviewBridgeAdapter', () => {
  let mockTargetWindow: Window;
  let postedMessages: Array<{ message: unknown; targetOrigin: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    postedMessages = [];

    mockTargetWindow = {
      postMessage: vi.fn((message: unknown, targetOrigin: string) => {
        postedMessages.push({ message, targetOrigin });
      }),
    } as unknown as Window;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('SAD §3.6 Origin Validation (isAllowedEditorOrigin)', () => {
    it('should accept standard localhost development origins', () => {
      expect(isAllowedEditorOrigin('http://localhost:3000')).toBe(true);
      expect(isAllowedEditorOrigin('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedEditorOrigin('http://localhost:3001')).toBe(true);
      expect(isAllowedEditorOrigin('http://127.0.0.1:3001')).toBe(true);
    });

    it('should accept wildcard preview origin if explicitly enabled', () => {
      expect(isAllowedEditorOrigin('https://anywhere.com', '*')).toBe(true);
    });

    it('should accept usercontent-platform.com domain and subdomains (SAD §3.3)', () => {
      expect(isAllowedEditorOrigin('https://usercontent-platform.com')).toBe(true);
      expect(isAllowedEditorOrigin('https://sub.usercontent-platform.com')).toBe(true);
      expect(isAllowedEditorOrigin('https://preview-123.tenant.usercontent-platform.com')).toBe(
        true,
      );
      expect(isAllowedEditorOrigin('http://usercontent-platform.com:8080')).toBe(true);
    });

    it('should accept configured editorOrigin and localOrigin', () => {
      expect(
        isAllowedEditorOrigin('https://studio.taleforge.app', 'https://studio.taleforge.app'),
      ).toBe(true);
      expect(
        isAllowedEditorOrigin(
          'https://player.taleforge.app',
          'https://other.com',
          'https://player.taleforge.app',
        ),
      ).toBe(true);
    });

    it('should reject untrusted and phishing origins', () => {
      expect(isAllowedEditorOrigin('https://malicious-site.com')).toBe(false);
      expect(isAllowedEditorOrigin('https://attacker-usercontent-platform.com')).toBe(false);
      expect(isAllowedEditorOrigin('https://usercontent-platform.com.evil.com')).toBe(false);
      expect(isAllowedEditorOrigin('http://localhost:8080')).toBe(false);
    });
  });

  describe('Handshake Lifecycle (PLAYER_READY ↔ PLAYER_READY_ACK)', () => {
    it('should emit PLAYER_READY with capabilities upon mount / probe', () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
      });

      adapter.init();

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PLAYER_READY' }),
        'http://localhost:3000',
      );
    });

    it('should mark connectionStatus as connected when receiving PLAYER_READY_ACK', () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
      });

      adapter.init();
      expect(adapter.isConnected()).toBe(false);

      // Simulate incoming PLAYER_READY_ACK
      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3000',
          data: { type: 'PLAYER_READY_ACK' },
        }),
      );

      expect(adapter.isConnected()).toBe(true);
    });

    it('should respond to QUERY_READY probe with PLAYER_READY message', () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3001',
      });

      adapter.init();
      postedMessages = [];

      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3001',
          data: { type: 'QUERY_READY' },
        }),
      );

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PLAYER_READY',
          capabilities: {
            liveReload: true,
            variableWatch: true,
          },
        }),
        'http://localhost:3001',
      );
    });

    it('should ignore incoming messages from unauthorized origins', () => {
      const onHotReload = vi.fn();
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
        onHotReload,
      });

      adapter.init();

      // Incoming message from untrusted origin
      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'https://evil-attacker.com',
          data: {
            type: 'HOT_RELOAD_PROGRAM',
            payload: { program: [{ type: 'SCENE', name: 'hacked' }] },
          },
        }),
      );

      expect(onHotReload).not.toHaveBeenCalled();
    });
  });

  describe('HOT_RELOAD_PROGRAM Payload Normalization', () => {
    it('should support payload wrapped format: e.data.payload.program', () => {
      const onHotReload = vi.fn();
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
        onHotReload,
      });

      adapter.init();

      const testProgram: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        { type: 'DIALOGUE', character: 'alice', text: 'Reloaded!' },
      ];

      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3000',
          data: {
            type: 'HOT_RELOAD_PROGRAM',
            payload: { program: testProgram, scene: 'main', line: 1 },
          },
        }),
      );

      expect(onHotReload).toHaveBeenCalledWith(testProgram, { scene: 'main', line: 1 });
    });

    it('should parse characters, assets, and projectId from HOT_RELOAD_PROGRAM payload', () => {
      const onHotReload = vi.fn();
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3001',
        onHotReload,
      });

      adapter.init();

      const testProgram: Instruction[] = [{ type: 'SCENE', name: 'main' }];
      const testChars = [{ id: 'hero', name: 'Hero' }];
      const testAssets = [{ id: 'bg1', name: 'Background', storageUrl: 'blob:bg1' }];

      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3001',
          data: {
            type: 'HOT_RELOAD_PROGRAM',
            payload: {
              program: testProgram,
              projectId: 'proj_test',
              characters: testChars,
              assets: testAssets,
            },
          },
        }),
      );

      expect(onHotReload).toHaveBeenCalledWith(testProgram, {
        projectId: 'proj_test',
        characters: testChars,
        assets: testAssets,
      });
    });

    it('should support flat format: e.data.program', () => {
      const onHotReload = vi.fn();
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
        onHotReload,
      });

      adapter.init();

      const testProgram: Instruction[] = [{ type: 'SCENE', name: 'flat_scene' }];

      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3000',
          data: {
            type: 'HOT_RELOAD_PROGRAM',
            program: testProgram,
            scene: 'flat_scene',
          },
        }),
      );

      expect(onHotReload).toHaveBeenCalledWith(testProgram, { scene: 'flat_scene' });
    });
  });

  describe('SET_VM_VARIABLE Handling', () => {
    it('should invoke onSetVariable callback with variable name and value', () => {
      const onSetVariable = vi.fn();
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
        onSetVariable,
      });

      adapter.init();

      adapter.handleMessage(
        new MessageEvent('message', {
          origin: 'http://localhost:3000',
          data: {
            type: 'SET_VM_VARIABLE',
            name: 'playerAffection',
            value: 99,
          },
        }),
      );

      expect(onSetVariable).toHaveBeenCalledWith('playerAffection', 99);
    });
  });

  describe('Throttled PREVIEW_STATE_UPDATE & Diagnostic Emission', () => {
    it('should throttle rapid PREVIEW_STATE_UPDATE emissions to 60ms', () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
      });

      adapter.init();

      // Trigger 5 rapid state updates
      adapter.sendStateUpdate({ counter: 1 });
      adapter.sendStateUpdate({ counter: 2 });
      adapter.sendStateUpdate({ counter: 3 });
      adapter.sendStateUpdate({ counter: 4 });
      adapter.sendStateUpdate({ counter: 5 });

      // Advance timers by 60ms
      vi.advanceTimersByTime(60);

      // Verify that messages were throttled, not sent 5 individual times
      const stateUpdateMessages = postedMessages.filter(
        m => (m.message as { type: string }).type === 'PREVIEW_STATE_UPDATE',
      );
      expect(stateUpdateMessages.length).toBeLessThanOrEqual(2);

      // The latest state data should be delivered
      const latestMsg = stateUpdateMessages[stateUpdateMessages.length - 1];
      expect(latestMsg?.message).toEqual(
        expect.objectContaining({
          type: 'PREVIEW_STATE_UPDATE',
          variables: expect.objectContaining({ counter: 5 }),
        }),
      );
    });

    it('should forward ENGINE_DIAGNOSTIC messages to editor', () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
      });

      adapter.init();

      const diag: EngineDiagnostic = {
        id: 'diag_1',
        category: 'compiler',
        severity: 'warning',
        message: 'Unused label',
        timestamp: Date.now(),
      };

      adapter.sendDiagnostic(diag);

      expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'ENGINE_DIAGNOSTIC',
          diagnostic: diag,
        },
        'http://localhost:3000',
      );
    });

    it('should clean up listeners and timers on dispose()', () => {
      const adapter = new PreviewBridgeAdapter({
        targetWindow: () => mockTargetWindow,
        editorOrigin: 'http://localhost:3000',
      });

      adapter.init();
      expect(() => adapter.dispose()).not.toThrow();
    });
  });
});
