import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters, SaveSlotData } from '../src/core/contracts';

describe('Pause Interaction & Runtime Player Integration (TASK-pause-statement)', () => {
  let mockRenderer: NonNullable<KernelAdapters['renderer']>;
  let mockAudio: NonNullable<KernelAdapters['audio']>;
  let mockStorage: NonNullable<KernelAdapters['storage']>;
  let seenStore: Set<string>;
  let slotsStore: Array<SaveSlotData | null>;

  beforeEach(() => {
    vi.useFakeTimers();
    seenStore = new Set<string>();
    slotsStore = [null, null, null, null, null, null];

    mockRenderer = {
      applySideEffect: vi.fn().mockResolvedValue(undefined),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mockthumb'),
    };

    mockAudio = {
      applySideEffect: vi.fn(),
      syncStateCatchUp: vi.fn(),
      stopVoice: vi.fn(),
      setVolume: vi.fn(),
      setMute: vi.fn(),
      playVoice: vi.fn(),
    };

    mockStorage = {
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // TC-PAUSE-RUN-01: Player Normal Advance & Input Parity
  it('TC-PAUSE-RUN-01: should suspend on PAUSE, set isAwaitingPauseAdvance & dialogue flags, and advance on click/key', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'scene_intro' },
      { type: 'BACKGROUND', assetId: 'bg_cg1' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'After pause line' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();

    const pauseState = kernel.getState();
    expect(pauseState.mode).toBe('GAMEPLAY');
    expect(pauseState.isAwaitingPauseAdvance).toBe(true);
    expect(pauseState.dialogue.isComplete).toBe(true);
    expect(pauseState.dialogue.canAdvance).toBe(true);
    expect(pauseState.dialogue.isVisible).toBe(false);

    // Player triggers advance (mouse click or Space/Enter)
    await kernel.advance();

    const postState = kernel.getState();
    expect(postState.isAwaitingPauseAdvance).toBe(false);
    expect(postState.dialogue.isVisible).toBe(true);
    expect(postState.dialogue.rawText).toBe('After pause line');

    // Input Parity: preceding dialogue before pause
    const parityProgram: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'alice', text: 'Preceding line' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Succeeding line' },
    ];

    const parityKernel = new VNRuntimeKernel(parityProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await parityKernel.startNewGame();
    expect(parityKernel.getState().dialogue.rawText).toBe('Preceding line');

    await parityKernel.advance();
    const midState = parityKernel.getState();
    expect(midState.isAwaitingPauseAdvance).toBe(true);
    expect(midState.dialogue.isComplete).toBe(true);
    expect(midState.dialogue.canAdvance).toBe(true);

    await parityKernel.advance();
    const finalState = parityKernel.getState();
    expect(finalState.isAwaitingPauseAdvance).toBe(false);
    expect(finalState.dialogue.rawText).toBe('Succeeding line');
  });

  // TC-PAUSE-RUN-02: Auto Mode & Mode Toggle
  it('TC-PAUSE-RUN-02: should automatically advance after autoDelayMs in AUTO mode, and schedule auto-advance on toggleAuto()', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'auto_scene' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Auto resumed line' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    // Sub-case A: Running with AUTO mode from the beginning
    kernel.toggleAuto();
    expect(kernel.getState().playbackMode).toBe('AUTO');

    await kernel.startNewGame();
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(true);

    // Fast-forward by autoDelayMs - 1ms -> should still be paused
    const delay = kernel.getState().settings.autoDelayMs; // default 1500ms
    vi.advanceTimersByTime(delay - 1);
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(true);
    expect(kernel.getState().dialogue.rawText).toBe('');

    // Advance remainder -> auto-advance triggers
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();

    expect(kernel.getState().isAwaitingPauseAdvance).toBe(false);
    expect(kernel.getState().dialogue.rawText).toBe('Auto resumed line');

    // Sub-case B: Stopped at PAUSE in NORMAL mode, then toggleAuto()
    const toggleProgram: Instruction[] = [
      { type: 'SCENE', name: 'toggle_scene' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Toggled auto resumed' },
    ];

    const kernelB = new VNRuntimeKernel(toggleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernelB.startNewGame();
    expect(kernelB.getState().isAwaitingPauseAdvance).toBe(true);
    expect(kernelB.getState().playbackMode).toBe('NORMAL');

    // Toggle AUTO mode ON while paused
    kernelB.toggleAuto();
    expect(kernelB.getState().playbackMode).toBe('AUTO');

    // Advance timer by autoDelayMs
    vi.advanceTimersByTime(delay);
    await vi.runAllTimersAsync();

    expect(kernelB.getState().isAwaitingPauseAdvance).toBe(false);
    expect(kernelB.getState().dialogue.rawText).toBe('Toggled auto resumed');

    // Sub-case C: Toggle AUTO mode OFF before timer expires cancels auto-advance
    const cancelProgram: Instruction[] = [
      { type: 'SCENE', name: 'cancel_scene' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Should not resume automatically' },
    ];

    const kernelC = new VNRuntimeKernel(cancelProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    kernelC.toggleAuto();
    await kernelC.startNewGame();
    expect(kernelC.getState().isAwaitingPauseAdvance).toBe(true);

    // Before timer expires, toggle AUTO off
    vi.advanceTimersByTime(500);
    kernelC.toggleAuto();
    expect(kernelC.getState().playbackMode).toBe('NORMAL');

    // Advance beyond delay -> should remain awaiting pause advance
    vi.advanceTimersByTime(2000);
    expect(kernelC.getState().isAwaitingPauseAdvance).toBe(true);
    expect(kernelC.getState().dialogue.rawText).toBe('');
  });

  // TC-PAUSE-RUN-03: Skip Mode & Concurrency
  it('TC-PAUSE-RUN-03: should skip through pause in SKIP mode, cancel skipTimer on toggleSkip(), and prevent double advance on manual click', async () => {
    // Sub-case A: Skip mode through sequential pauses
    const skipProgram: Instruction[] = [
      { type: 'SCENE', name: 'skip_seq' },
      { type: 'DIALOGUE', character: 'alice', text: 'Known Line 1' },
      { type: 'PAUSE' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Known Line 2' },
    ];

    seenStore.add('skip_seq#0:alice:Known Line 1');
    seenStore.add('skip_seq#3:alice:Known Line 2');

    const kernelA = new VNRuntimeKernel(skipProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernelA.startNewGame();
    kernelA.toggleSkip();
    expect(kernelA.getState().playbackMode).toBe('SKIP');

    // Advance triggers skip through PAUSE -> PAUSE -> Known Line 2
    await kernelA.advance();
    await vi.runAllTimersAsync();

    expect(kernelA.getState().dialogue.rawText).toBe('Known Line 2');
    expect(kernelA.getState().isAwaitingPauseAdvance).toBe(false);

    // Sub-case B: Cancel skipTimer when toggling from SKIP to NORMAL during pause
    const toggleProgram: Instruction[] = [
      { type: 'SCENE', name: 'skip_cancel' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Unreachable until clicked' },
    ];

    const kernelB = new VNRuntimeKernel(toggleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    kernelB.toggleSkip();
    await kernelB.startNewGame();
    expect(kernelB.getState().playbackMode).toBe('SKIP');

    // Toggle SKIP off immediately while skipTimer is pending
    kernelB.toggleSkip();
    expect(kernelB.getState().playbackMode).toBe('NORMAL');

    // Timers should be cleared, advance should NOT happen
    await vi.runAllTimersAsync();
    expect(kernelB.getState().isAwaitingPauseAdvance).toBe(true);
    expect(kernelB.getState().dialogue.rawText).toBe('');

    // Sub-case C: Concurrency - manual advance() click clears timer and avoids double-advance
    const raceProgram: Instruction[] = [
      { type: 'SCENE', name: 'race' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Line A' },
      { type: 'DIALOGUE', character: 'alice', text: 'Line B' },
    ];

    const kernelC = new VNRuntimeKernel(raceProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    kernelC.toggleAuto();
    await kernelC.startNewGame();
    expect(kernelC.getState().isAwaitingPauseAdvance).toBe(true);

    // While auto timer is running (at 500ms), user clicks advance manually
    vi.advanceTimersByTime(500);
    await kernelC.advance();

    expect(kernelC.getState().dialogue.rawText).toBe('Line A');

    // Advancing past original 1500ms mark should not cause double-advance to Line B
    vi.advanceTimersByTime(2000);
    expect(kernelC.getState().dialogue.rawText).toBe('Line A');
  });

  // TC-PAUSE-RUN-04: Rollback Backlog Integrity & No Double-Pause
  it('TC-PAUSE-RUN-04: should maintain backlog integrity across rollback, restore pause state, and prevent Double-Pause bug', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'rb_test' },
      { type: 'DIALOGUE', character: 'alice', text: 'Dialogue 1' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Dialogue 2' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Dialogue 1');
    expect(kernel.getState().backlog).toHaveLength(1);
    expect(kernel.getState().backlog[0]?.text).toBe('Dialogue 1');

    // Advance to PAUSE
    await kernel.advance();
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(true);
    // Backlog still has Dialogue 1
    expect(kernel.getState().backlog).toHaveLength(1);

    // Advance to Dialogue 2
    await kernel.advance();
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(false);
    expect(kernel.getState().dialogue.rawText).toBe('Dialogue 2');
    expect(kernel.getState().backlog).toHaveLength(2);
    expect(kernel.getState().backlog[1]?.text).toBe('Dialogue 2');

    // 1. Rollback 1 step: from Dialogue 2 to PAUSE
    const rb1 = kernel.rollback();
    expect(rb1).toBe(true);

    const rb1State = kernel.getState();
    // Popped was DIALOGUE (Dialogue 2) -> backlog popped Dialogue 2
    expect(rb1State.backlog).toHaveLength(1);
    expect(rb1State.backlog[0]?.text).toBe('Dialogue 1');
    // Restored was PAUSE -> pause advance restored!
    expect(rb1State.isAwaitingPauseAdvance).toBe(true);
    expect(rb1State.dialogue.isComplete).toBe(true);
    expect(rb1State.dialogue.canAdvance).toBe(true);

    // 2. Single Advance Test (No Double-Pause Bug!):
    // Advancing once must move directly to Dialogue 2, not get stuck at the same pause
    await kernel.advance();
    const advState = kernel.getState();
    expect(advState.isAwaitingPauseAdvance).toBe(false);
    expect(advState.dialogue.rawText).toBe('Dialogue 2');
    expect(advState.backlog).toHaveLength(2);

    // 3. Rollback 2 steps consecutively: from Dialogue 2 -> PAUSE -> Dialogue 1
    // Rollback to PAUSE
    const rbToPause = kernel.rollback();
    expect(rbToPause).toBe(true);
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(true);
    expect(kernel.getState().backlog).toHaveLength(1);

    // Rollback from PAUSE to Dialogue 1
    // Since popped was PAUSE, backlog must NOT pop Dialogue 1!
    const rbToD1 = kernel.rollback();
    expect(rbToD1).toBe(true);

    const d1State = kernel.getState();
    expect(d1State.isAwaitingPauseAdvance).toBe(false);
    expect(d1State.dialogue.rawText).toBe('Dialogue 1');
    expect(d1State.backlog).toHaveLength(1);
    expect(d1State.backlog[0]?.text).toBe('Dialogue 1');
  });

  // TC-PAUSE-RUN-05: Save/Load Persistence at Pause Point
  it('TC-PAUSE-RUN-05: should persist pause point across save/load and advance normally upon user interaction', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'save_scene' },
      { type: 'BACKGROUND', assetId: 'bg_sunset' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'PAUSE' },
      { type: 'DIALOGUE', character: 'alice', text: 'Resumed after load' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(true);
    expect(kernel.getState().dialogue.isVisible).toBe(false);

    // Save to slot 1 at pause point
    await kernel.saveSlot(1);
    expect(mockStorage.saveSlot).toHaveBeenCalledWith(
      expect.objectContaining({ slotIndex: 1, currentScene: 'save_scene' }),
    );

    // Advance past pause
    await kernel.advance();
    expect(kernel.getState().isAwaitingPauseAdvance).toBe(false);
    expect(kernel.getState().dialogue.rawText).toBe('Resumed after load');

    // Now reload slot 1
    await kernel.loadSlot(1);

    const loadedState = kernel.getState();
    expect(loadedState.mode).toBe('GAMEPLAY');
    expect(loadedState.isAwaitingPauseAdvance).toBe(true);
    expect(loadedState.dialogue.isComplete).toBe(true);
    expect(loadedState.dialogue.canAdvance).toBe(true);
    expect(loadedState.dialogue.isVisible).toBe(false);

    // User interacts to advance from the loaded pause point
    await kernel.advance();

    const postLoadState = kernel.getState();
    expect(postLoadState.isAwaitingPauseAdvance).toBe(false);
    expect(postLoadState.dialogue.isVisible).toBe(true);
    expect(postLoadState.dialogue.rawText).toBe('Resumed after load');
  });
});

