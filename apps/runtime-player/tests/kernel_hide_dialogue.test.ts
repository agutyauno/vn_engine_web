import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters, SaveSlotData } from '../src/core/contracts';

function createMockAdapters() {
  let seenStore = new Set<string>();
  let slotsStore: Array<SaveSlotData | null> = [null, null, null, null, null, null];

  const mockRenderer: NonNullable<KernelAdapters['renderer']> = {
    applySideEffect: vi.fn().mockResolvedValue(undefined),
    syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
    captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mockthumb'),
  };

  const mockAudio: NonNullable<KernelAdapters['audio']> = {
    applySideEffect: vi.fn(),
    syncStateCatchUp: vi.fn(),
    stopVoice: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
    playVoice: vi.fn(),
  };

  const mockStorage: NonNullable<KernelAdapters['storage']> = {
    getSeenDialogues: vi.fn(() => new Set(seenStore)),
    saveSeenDialogue: vi.fn((key: string) => {
      seenStore.add(key);
    }),
    saveSeenDialogues: vi.fn((seen: Set<string>) => {
      seenStore = new Set(seen);
    }),
    getSlots: vi.fn(() => [...slotsStore]),
    getQuickSave: vi.fn(() => null),
    saveSlot: vi.fn(async (data: SaveSlotData) => {
      slotsStore[data.slotIndex - 1] = data;
    }),
    loadSlot: vi.fn(async (slotIndex: number) => slotsStore[slotIndex - 1] ?? null),
  };

  return { mockRenderer, mockAudio, mockStorage };
}

describe('VNRuntimeKernel: Hide Dialogue Execution (TASK-player-core-bugs)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('TC-HD-01: should set dialogue.isVisible to false during wait when hide dialogue executes', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'First dialogue' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'WAIT', duration: 1.0 },
      { type: 'DIALOGUE', character: 'alice', text: 'Second dialogue' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.isVisible).toBe(true);

    await kernel.advance();
    const stateDuringWait = kernel.getState();
    expect(stateDuringWait.mode).toBe('GAMEPLAY');
    expect(stateDuringWait.dialogue.isVisible).toBe(false);
  });

  it('TC-HD-02: should immediately notify subscribers with isVisible=false when HIDE_DIALOGUE is processed', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'First dialogue' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'WAIT', duration: 2.0 },
      { type: 'DIALOGUE', character: 'alice', text: 'Second dialogue' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();

    const listener = vi.fn();
    kernel.subscribe(listener);

    await kernel.advance();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        dialogue: expect.objectContaining({
          isVisible: false,
        }),
      })
    );
  });

  it('TC-HD-03: should automatically restore dialogue.isVisible to true on subsequent dialogue line', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'Before hide' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'WAIT', duration: 1.0 },
      { type: 'DIALOGUE', character: 'bob', text: 'Tôi đã quay lại' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    await kernel.advance();
    expect(kernel.getState().dialogue.isVisible).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);

    const stateAfterWait = kernel.getState();
    expect(stateAfterWait.dialogue.isVisible).toBe(true);
    expect(stateAfterWait.dialogue.rawText).toBe('Tôi đã quay lại');
    expect(stateAfterWait.dialogue.speakerName).toBe('bob');
  });

  it('TC-HD-04: should restore dialogue.isVisible to true when rolling back after hide dialogue', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'First dialogue' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'WAIT', duration: 1.0 },
      { type: 'DIALOGUE', character: 'bob', text: 'Tôi đã quay lại' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    await kernel.advance();
    await vi.advanceTimersByTimeAsync(1000);

    expect(kernel.getState().dialogue.rawText).toBe('Tôi đã quay lại');
    expect(kernel.getState().dialogue.isVisible).toBe(true);

    const rolled = kernel.rollback();
    expect(rolled).toBe(true);

    const stateAfterRollback = kernel.getState();
    expect(stateAfterRollback.dialogue.isVisible).toBe(true);
    expect(stateAfterRollback.dialogue.rawText).toBe('First dialogue');
    expect(stateAfterRollback.dialogue.speakerName).toBe('alice');
  });
});
