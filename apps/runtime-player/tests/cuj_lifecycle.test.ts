import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import type { CatchUpVisualState } from '@vn-engine/renderer';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters, SaveSlotData } from '../src/core/contracts';
import { PreviewBridgeAdapter } from '../src/adapters/PreviewBridgeAdapter';

describe('End-to-End CUJ Lifecycle Flow (TASK-PLAYER-REBUILD-SPEC §1.3)', () => {
  let mockRenderer: {
    applySideEffect: ReturnType<typeof vi.fn>;
    syncStateCatchUp: ReturnType<typeof vi.fn>;
    captureThumbnail: ReturnType<typeof vi.fn>;
  };
  let mockAudio: {
    applySideEffect: ReturnType<typeof vi.fn>;
    syncStateCatchUp: ReturnType<typeof vi.fn>;
    stopVoice: ReturnType<typeof vi.fn>;
    setVolume: ReturnType<typeof vi.fn>;
    setMute: ReturnType<typeof vi.fn>;
    playVoice: ReturnType<typeof vi.fn>;
  };
  let mockStorage: NonNullable<KernelAdapters['storage']>;
  let seenStore: Set<string>;
  let slotsStore: Array<SaveSlotData | null>;

  const sampleProgram: Instruction[] = [
    { type: 'SCENE', name: 'intro' },
    { type: 'BACKGROUND', assetId: 'bg_room' },
    { type: 'SHOW', character: 'alice', sprite: 'neutral', position: 'center' },
    { type: 'PLAY', channel: 'voice', assetId: 'alice_v01' },
    { type: 'DIALOGUE', character: 'Alice', text: 'Hello, welcome to TaleForge!' },
    { type: 'SHOW', character: 'alice', sprite: 'happy', position: 'center' },
    { type: 'PLAY', channel: 'voice', assetId: 'alice_v02' },
    { type: 'DIALOGUE', character: 'Alice', text: 'How are you feeling today?' },
    {
      type: 'CHOICE',
      choices: [
        { text: 'Great!', targetScene: 'happy_path' },
        { text: 'Tired...', targetScene: 'rest_path' },
      ],
    },
    { type: 'SCENE', name: 'happy_path' },
    { type: 'SHOW', character: 'alice', sprite: 'ecstatic', position: 'center' },
    { type: 'DIALOGUE', character: 'Alice', text: 'Glad to hear that!' },
    { type: 'SCENE', name: 'rest_path' },
    { type: 'SHOW', character: 'alice', sprite: 'worried', position: 'center' },
    { type: 'DIALOGUE', character: 'Alice', text: 'Please take some rest.' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    seenStore = new Set<string>();
    slotsStore = [null, null, null, null, null, null];

    mockRenderer = {
      applySideEffect: vi.fn().mockResolvedValue(undefined),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue('data:image/svg+xml;base64,mockthumb'),
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

  it('Kịch bản 1: Launch & Start New Game', async () => {
    const kernel = new VNRuntimeKernel(sampleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    // 1. Initial State: Must start in TITLE mode
    expect(kernel.getState().mode).toBe('TITLE');
    expect(kernel.getState().dialogue.isVisible).toBe(false);

    // 2. User clicks [New Game]
    await kernel.startNewGame();

    // 3. State transitions to GAMEPLAY
    const state = kernel.getState();
    expect(state.mode).toBe('GAMEPLAY');
    expect(state.dialogue.isVisible).toBe(true);
    expect(state.dialogue.speakerName).toBe('Alice');
    expect(state.dialogue.rawText).toBe('Hello, welcome to TaleForge!');
    expect(state.dialogue.canAdvance).toBe(true);

    // 4. Side effects of line 1 dispatched to adapters
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BACKGROUND', assetId: 'bg_room' }),
    );
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SHOW',
        character: 'alice',
        sprite: 'neutral',
        position: 'center',
      }),
    );
    expect(mockAudio.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PLAY', channel: 'voice', assetId: 'alice_v01' }),
    );
    expect(state.audio.currentTracks.voice).toBe('alice_v01');

    // 5. Backlog stores entry 1 with voiceAssetId
    expect(state.backlog).toHaveLength(1);
    expect(state.backlog[0]).toMatchObject({
      text: 'Hello, welcome to TaleForge!',
      voiceAssetId: 'alice_v01',
      speakerName: 'Alice',
    });
  });

  it('Kịch bản 2: Forward Dialogue Progression & Voice Auto-Cut', async () => {
    const kernel = new VNRuntimeKernel(sampleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    mockAudio.stopVoice.mockClear();

    // User advances to line 2
    await kernel.advance();

    // Deterministic Voice Auto-Cut: stopVoice called before next line
    expect(mockAudio.stopVoice).toHaveBeenCalledTimes(1);

    const state = kernel.getState();
    expect(state.dialogue.rawText).toBe('How are you feeling today?');
    expect(state.dialogue.speakerName).toBe('Alice');

    // Side effects dispatched for line 2
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SHOW',
        character: 'alice',
        sprite: 'happy',
        position: 'center',
      }),
    );
    expect(mockAudio.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PLAY', channel: 'voice', assetId: 'alice_v02' }),
    );
    expect(state.audio.currentTracks.voice).toBe('alice_v02');

    // Backlog stores both entries with respective voiceAssetIds
    expect(state.backlog).toHaveLength(2);
    expect(state.backlog[0]?.text).toBe('Hello, welcome to TaleForge!');
    expect(state.backlog[0]?.voiceAssetId).toBe('alice_v01');
    expect(state.backlog[1]?.text).toBe('How are you feeling today?');
    expect(state.backlog[1]?.voiceAssetId).toBe('alice_v02');
  });

  it('Kịch bản 3: Choice Selection & Auto-Pause', async () => {
    const kernel = new VNRuntimeKernel(sampleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    await kernel.advance(); // at second dialogue

    // Turn on AUTO mode
    kernel.toggleAuto();
    expect(kernel.getState().playbackMode).toBe('AUTO');

    // Advance to CHOICE block
    await kernel.advance();

    const choiceState = kernel.getState();
    expect(choiceState.activeChoices).not.toBeNull();
    expect(choiceState.activeChoices).toHaveLength(2);
    expect(choiceState.activeChoices![0]).toMatchObject({
      text: 'Great!',
      targetScene: 'happy_path',
      isSatisfied: true,
    });
    expect(choiceState.activeChoices![1]).toMatchObject({
      text: 'Tired...',
      targetScene: 'rest_path',
      isSatisfied: true,
    });

    // Selecting choice must halt voice, restore auto mode, and transition to chosen scene
    mockAudio.stopVoice.mockClear();
    await kernel.selectChoice(0);

    expect(mockAudio.stopVoice).toHaveBeenCalledTimes(1);

    const targetState = kernel.getState();
    expect(targetState.activeChoices).toBeNull();
    expect(targetState.playbackMode).toBe('AUTO'); // Resumed auto mode
    expect(targetState.dialogue.speakerName).toBe('Alice');
    expect(targetState.dialogue.rawText).toBe('Glad to hear that!');
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SHOW', character: 'alice', sprite: 'ecstatic' }),
    );
  });

  it('Kịch bản 4: Rollback Catch-Up & Voice Halt', async () => {
    const kernel = new VNRuntimeKernel(sampleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame(); // line 1: neutral, "Hello, welcome to TaleForge!"
    await kernel.advance(); // line 2: happy, "How are you feeling today?"

    expect(kernel.getState().dialogue.rawText).toBe('How are you feeling today?');

    mockAudio.stopVoice.mockClear();
    mockRenderer.syncStateCatchUp.mockClear();

    // Trigger rollback
    const rolledBack = kernel.rollback();
    expect(rolledBack).toBe(true);

    // Voice Auto-Cut called synchronously
    expect(mockAudio.stopVoice).toHaveBeenCalledTimes(1);

    // Visual state catch-up called to restore character expression and background
    expect(mockRenderer.syncStateCatchUp).toHaveBeenCalledTimes(1);
    const catchUp = mockRenderer.syncStateCatchUp.mock.calls[0]?.[0] as CatchUpVisualState;
    expect(catchUp).toBeDefined();
    expect(catchUp.sprites.get('alice')?.sprite).toBe('neutral');

    // Dialogue state reverted without desync
    const state = kernel.getState();
    expect(state.dialogue.rawText).toBe('Hello, welcome to TaleForge!');
    expect(state.dialogue.speakerName).toBe('Alice');
    expect(state.backlog).toHaveLength(1);
  });

  it('Kịch bản 5: Live Preview Standby Handshake & Hot Reload', async () => {
    // Initialize kernel in STANDBY mode
    const standbyKernel = new VNRuntimeKernel(
      [],
      {
        renderer: mockRenderer,
        audio: mockAudio,
        storage: mockStorage,
      },
      { initialMode: 'STANDBY' },
    );

    // Initial state must be STANDBY
    expect(standbyKernel.getState().mode).toBe('STANDBY');
    expect(standbyKernel.getState().dialogue.isVisible).toBe(false);

    const newProgram: Instruction[] = [
      { type: 'SCENE', name: 'preview_start' },
      { type: 'BACKGROUND', assetId: 'bg_garden' },
      { type: 'SHOW', character: 'bob', sprite: 'smile', position: 'right' },
      { type: 'DIALOGUE', character: 'Bob', text: 'Live reload successful!' },
    ];

    const bridge = new PreviewBridgeAdapter({
      editorOrigin: 'http://localhost:3000',
      onHotReload: async (program, opts) => {
        await standbyKernel.loadProgram(program, opts);
        if (standbyKernel.getState().mode === 'STANDBY') {
          await standbyKernel.startNewGame();
        }
      },
    });

    bridge.init();

    // Simulate postMessage event from editor with HOT_RELOAD_PROGRAM
    bridge.handleMessage({
      origin: 'http://localhost:3000',
      data: {
        type: 'HOT_RELOAD_PROGRAM',
        payload: {
          program: newProgram,
          scene: 'preview_start',
        },
      },
    } as MessageEvent);

    (await vi.runAllTimersAsync?.()) ?? new Promise(r => setTimeout(r, 10));

    const state = standbyKernel.getState();
    expect(state.mode).toBe('GAMEPLAY');
    expect(state.dialogue.speakerName).toBe('Bob');
    expect(state.dialogue.rawText).toBe('Live reload successful!');
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BACKGROUND', assetId: 'bg_garden' }),
    );
  });

  it('Full Unbroken Journey: Launch ➔ Advance ➔ Auto-Pause Choice ➔ Branch ➔ Rollback', async () => {
    const kernel = new VNRuntimeKernel(sampleProgram, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    // 1. Launch Title
    expect(kernel.getState().mode).toBe('TITLE');

    // 2. Start Game
    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Hello, welcome to TaleForge!');
    expect(kernel.getState().audio.currentTracks.voice).toBe('alice_v01');

    // 3. Advance to line 2
    await kernel.advance();
    expect(mockAudio.stopVoice).toHaveBeenCalled();
    expect(kernel.getState().dialogue.rawText).toBe('How are you feeling today?');
    expect(kernel.getState().audio.currentTracks.voice).toBe('alice_v02');

    // 4. Advance to Choice with AUTO mode
    kernel.toggleAuto();
    await kernel.advance();
    expect(kernel.getState().activeChoices).toHaveLength(2);

    // 5. Select Choice 1 (rest_path)
    mockAudio.stopVoice.mockClear();
    await kernel.selectChoice(1);
    expect(mockAudio.stopVoice).toHaveBeenCalled();
    expect(kernel.getState().dialogue.rawText).toBe('Please take some rest.');
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SHOW', character: 'alice', sprite: 'worried' }),
    );

    // 6. Rollback to Choice
    mockAudio.stopVoice.mockClear();
    mockRenderer.syncStateCatchUp.mockClear();
    const rollbackSuccess = kernel.rollback();
    expect(rollbackSuccess).toBe(true);
    expect(mockAudio.stopVoice).toHaveBeenCalled();
    expect(mockRenderer.syncStateCatchUp).toHaveBeenCalled();
  });
});
