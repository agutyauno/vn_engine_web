import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type {
  KernelAdapters,
  PlayerViewState,
  PlayerUIActions,
  SaveSlotData,
} from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { ChoiceOverlay } from '../src/ui/components/ChoiceOverlay';

function createMockState(overrides: Partial<PlayerViewState> = {}): PlayerViewState {
  return {
    mode: 'GAMEPLAY',
    playbackMode: 'NORMAL',
    isControlsHidden: false,
    isCleanArtMode: false,
    dialogue: {
      isVisible: true,
      speakerName: 'Alice',
      speakerColorHex: '#38bdf8',
      rawText: 'Sample text',
      isComplete: false,
      canAdvance: true,
      isSeen: false,
    },
    activeChoices: null,
    activeInspectModal: null,
    activeModal: 'none',
    settings: {
      textSpeed: 24,
      autoDelayMs: 1500,
    },
    activeToast: null,
    audio: {
      masterVolume: 1.0,
      channelVolumes: {
        music: 1.0,
        sound: 1.0,
        voice: 1.0,
        ambience: 1.0,
      },
      isMuted: false,
      currentTracks: {},
    },
    backlog: [],
    saveSlots: [null, null, null, null, null, null],
    quickSaveSlot: null,
    ...overrides,
  };
}

function createMockActions(overrides: Partial<PlayerUIActions> = {}): PlayerUIActions {
  return {
    startNewGame: vi.fn(),
    returnToTitle: vi.fn(),
    advance: vi.fn(),
    completeDialogue: vi.fn(),
    selectChoice: vi.fn(),
    rollback: vi.fn(),
    toggleAuto: vi.fn(),
    toggleSkip: vi.fn(),
    toggleHideControls: vi.fn(),
    toggleCleanArt: vi.fn(),
    toggleMute: vi.fn(),
    openModal: vi.fn(),
    closeModal: vi.fn(),
    closeInspect: vi.fn(),
    setAudioVolume: vi.fn(),
    setTextSpeed: vi.fn(),
    setAutoDelay: vi.fn(),
    showToast: vi.fn(),
    saveSlot: vi.fn(),
    loadSlot: vi.fn(),
    quickSave: vi.fn(),
    quickLoad: vi.fn(),
    replayVoice: vi.fn(),
    resolveDesync: vi.fn(),
    ...overrides,
  };
}

describe('Player Choice Resilience & Safe Re-entrancy (RED Phase)', () => {
  let mockRenderer: NonNullable<KernelAdapters['renderer']>;
  let mockAudio: NonNullable<KernelAdapters['audio']>;
  let mockStorage: NonNullable<KernelAdapters['storage']>;
  let seenStore: Set<string>;
  let slotsStore: Array<SaveSlotData | null>;

  beforeEach(() => {
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
      setAudioVolume: vi.fn(),
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
    cleanup();
    vi.clearAllMocks();
  });

  // Test 1: Multiple concurrent/duplicate selectChoice(0) calls
  it('Test 1: should safely ignore duplicate or concurrent selectChoice calls without throwing unhandled out-of-bounds error', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'choice_scene' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Choice A', targetScene: 'scene_a' },
          { text: 'Choice B', targetScene: 'scene_b' },
        ],
      },
      { type: 'SCENE', name: 'scene_a' },
      { type: 'DIALOGUE', character: 'alice', text: 'You picked Choice A' },
      { type: 'SCENE', name: 'scene_b' },
      { type: 'DIALOGUE', character: 'alice', text: 'You picked Choice B' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().activeChoices).not.toBeNull();
    expect(kernel.getState().activeChoices).toHaveLength(2);

    // Concurrent execution: Promise.all calling selectChoice(0) simultaneously
    await expect(
      Promise.all([kernel.selectChoice(0), kernel.selectChoice(0)])
    ).resolves.not.toThrow();

    const postState = kernel.getState();
    expect(postState.activeChoices).toBeNull();
    expect(postState.dialogue.rawText).toBe('You picked Choice A');

    // Consecutive call after resolution should also safely return without throwing
    await expect(kernel.selectChoice(0)).resolves.not.toThrow();
  });

  // Test 2: Immediate state emission on choice selection
  it('Test 2: should emit state with activeChoices set to null immediately upon choice selection before renderer side effects complete', async () => {
    let sideEffectResolver: (() => void) | null = null;
    const delayedRenderer: NonNullable<KernelAdapters['renderer']> = {
      applySideEffect: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            sideEffectResolver = resolve;
          })
      ),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mockthumb'),
    };

    const program: Instruction[] = [
      { type: 'SCENE', name: 'choice_scene' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Choice A', targetScene: 'scene_a' },
        ],
      },
      { type: 'SCENE', name: 'scene_a' },
      { type: 'BACKGROUND', assetId: 'bg_async_delay' }, // Triggers applySideEffect
      { type: 'DIALOGUE', character: 'alice', text: 'Side effect finished' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: delayedRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().activeChoices).not.toBeNull();

    const emittedChoiceStates: (unknown[] | null)[] = [];
    kernel.subscribe((state) => {
      emittedChoiceStates.push(state.activeChoices);
    });

    // Start choice selection without awaiting completion yet
    const selectionPromise = kernel.selectChoice(0);

    // Verify delayed renderer side-effect is in-flight
    expect(sideEffectResolver).not.toBeNull();

    // The kernel MUST have already emitted state with activeChoices === null immediately
    // so ChoiceOverlay can unmount immediately and not accept further input
    expect(emittedChoiceStates).toContainEqual(null);

    // Now resolve renderer side effect and await completion
    sideEffectResolver!();
    await selectionPromise;

    expect(kernel.getState().dialogue.rawText).toBe('Side effect finished');
  });

  // Test 3: Calling selectChoice(0) when activeChoices is already null
  it('Test 3: should resolve cleanly without throwing an exception when selectChoice is called while activeChoices is null', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello, this is standard dialogue.' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    // 1. In TITLE mode (activeChoices is null)
    expect(kernel.getState().mode).toBe('TITLE');
    expect(kernel.getState().activeChoices).toBeNull();
    await expect(kernel.selectChoice(0)).resolves.not.toThrow();

    // 2. In GAMEPLAY mode during normal dialogue (activeChoices is null)
    await kernel.startNewGame();
    expect(kernel.getState().mode).toBe('GAMEPLAY');
    expect(kernel.getState().activeChoices).toBeNull();
    await expect(kernel.selectChoice(0)).resolves.not.toThrow();
  });

  // Test 4: Genuine out-of-bounds index on active choices
  it('Test 4: should throw an out-of-bounds Error when active choices exist but index is out of bounds', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'choice_scene' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Choice 0', targetScene: 'scene_0' },
          { text: 'Choice 1', targetScene: 'scene_1' },
        ],
      },
      { type: 'SCENE', name: 'scene_0' },
      { type: 'DIALOGUE', character: 'alice', text: 'Scene 0' },
      { type: 'SCENE', name: 'scene_1' },
      { type: 'DIALOGUE', character: 'alice', text: 'Scene 1' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().activeChoices).toHaveLength(2);

    // Calling out-of-bounds index 99 when active choices length is 2
    await expect(kernel.selectChoice(99)).rejects.toThrow(/out of bounds/i);

    // Calling negative index -1
    await expect(kernel.selectChoice(-1)).rejects.toThrow(/out of bounds/i);
  });

  // Test 5: ChoiceOverlay ignores repeating keys (e.repeat = true)
  describe('ChoiceOverlay Keyboard Resilience', () => {
    it('Test 5a: should ignore repeating Enter keys (e.repeat = true) and only dispatch on non-repeating keydown', () => {
      const choices = [
        { text: 'Choice A', targetScene: 'a', isSatisfied: true },
        { text: 'Choice B', targetScene: 'b', isSatisfied: true },
      ];
      const state = createMockState({ activeChoices: choices });
      const actions = createMockActions();

      render(
        <PlayerUIProvider state={state} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>
      );

      // Fire repeating Enter key (user holds down Enter key)
      fireEvent.keyDown(window, { key: 'Enter', repeat: true });
      expect(actions.selectChoice).not.toHaveBeenCalled();

      // Fire single non-repeating Enter key
      fireEvent.keyDown(window, { key: 'Enter', repeat: false });
      expect(actions.selectChoice).toHaveBeenCalledTimes(1);
      expect(actions.selectChoice).toHaveBeenCalledWith(0);
    });

    it('Test 5b: should ignore repeating number shortcut keys (e.repeat = true)', () => {
      const choices = [
        { text: 'Choice 1', targetScene: '1', isSatisfied: true },
        { text: 'Choice 2', targetScene: '2', isSatisfied: true },
      ];
      const state = createMockState({ activeChoices: choices });
      const actions = createMockActions();

      render(
        <PlayerUIProvider state={state} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>
      );

      // Fire repeating '2' key
      fireEvent.keyDown(window, { key: '2', repeat: true });
      expect(actions.selectChoice).not.toHaveBeenCalled();

      // Fire single non-repeating '2' key
      fireEvent.keyDown(window, { key: '2', repeat: false });
      expect(actions.selectChoice).toHaveBeenCalledTimes(1);
      expect(actions.selectChoice).toHaveBeenCalledWith(1);
    });

    it('Test 5c: should reset focusedIndex to 0 when activeChoices change', () => {
      const initialChoices = [
        { text: 'Choice 1', targetScene: '1', isSatisfied: true },
        { text: 'Choice 2', targetScene: '2', isSatisfied: true },
      ];
      const actions = createMockActions();

      const { rerender, container } = render(
        <PlayerUIProvider state={createMockState({ activeChoices: initialChoices })} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>
      );

      // Move focus down to choice index 1
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      const buttons = container.querySelectorAll('.choice-button');
      expect(buttons[1]?.classList.contains('focused')).toBe(true);

      // New choices arrive
      const nextChoices = [
        { text: 'New Choice A', targetScene: 'a', isSatisfied: true },
        { text: 'New Choice B', targetScene: 'b', isSatisfied: true },
      ];

      rerender(
        <PlayerUIProvider state={createMockState({ activeChoices: nextChoices })} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>
      );

      // Pressing enter now must select index 0, not residual index 1
      fireEvent.keyDown(window, { key: 'Enter', repeat: false });
      expect(actions.selectChoice).toHaveBeenCalledWith(0);
    });
  });
});
