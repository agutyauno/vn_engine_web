import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import { parseTypewriterSegments, stripControlTags } from '../src/core/typewriter';
import type {
  KernelAdapters,
  SaveSlotData,
} from '../src/core/contracts';

describe('Typewriter & Tag Sanitization', () => {
  it('should strip all control tags for backlog display', () => {
    const raw = 'Hello {pause: 0.5s}world! {color: #38bdf8}Cyan text{speed: fast} fast!';
    const stripped = stripControlTags(raw);
    expect(stripped).toBe('Hello world! Cyan text fast!');
  });

  it('should return plain text unchanged when no control tags are present', () => {
    const raw = 'This is a normal dialogue line without tags.';
    expect(stripControlTags(raw)).toBe(raw);
  });

  it('should parse pause, speed, and color control tags into TypewriterSegment array', () => {
    const raw = 'Start {pause: 0.5s}mid {speed: slow}slow {color: #ff0000}red{speed: normal} normal';
    const segments = parseTypewriterSegments(raw);

    expect(segments.length).toBeGreaterThanOrEqual(4);
    // Segment 1: "Start " with pauseAfterMs = 500
    expect(segments[0]?.text).toBe('Start ');
    expect(segments[0]?.pauseAfterMs).toBe(500);

    // Segment 2: "mid " with default speed (1.0)
    expect(segments[1]?.text).toBe('mid ');

    // Segment 3: "slow " with speedMultiplier = 0.5
    expect(segments[2]?.text).toBe('slow ');
    expect(segments[2]?.speedMultiplier).toBe(0.5);

    // Segment 4: "red" with color = '#ff0000' and speedMultiplier = 0.5
    expect(segments[3]?.text).toBe('red');
    expect(segments[3]?.color).toBe('#ff0000');
    expect(segments[3]?.speedMultiplier).toBe(0.5);

    // Segment 5: " normal" with color = '#ff0000' and speedMultiplier = 1.0
    expect(segments[4]?.text).toBe(' normal');
    expect(segments[4]?.speedMultiplier).toBe(1.0);
  });
});

describe('VNRuntimeKernel Core', () => {
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

  it('should initialize with default state and subscribe to state changes', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello!' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    const state = kernel.getState();
    expect(state.mode).toBe('TITLE');
    expect(state.playbackMode).toBe('NORMAL');
    expect(state.isControlsHidden).toBe(false);
    expect(state.isCleanArtMode).toBe(false);
    expect(state.dialogue.isVisible).toBe(false);
    expect(state.dialogue.isComplete).toBe(false);
    expect(state.activeModal).toBe('none');
    expect(state.saveSlots).toHaveLength(6);
    expect(mockStorage.getSeenDialogues).toHaveBeenCalled();

    // Verify subscriber pattern
    const listener = vi.fn();
    const unsubscribe = kernel.subscribe(listener);

    kernel.toggleHideControls();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isControlsHidden: true }));

    unsubscribe();
    kernel.toggleHideControls();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should advance dialogue, dispatch side-effects, and mark read text tracking', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'BACKGROUND', assetId: 'bg_room' },
      { type: 'SHOW', character: 'alice', sprite: 'happy', position: 'center' },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Welcome to TaleForge!',
        displayNameOverride: 'Alice',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Second line.' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    // Start game moves mode to GAMEPLAY and advances to first interactive step
    await kernel.startNewGame();

    const state1 = kernel.getState();
    expect(state1.mode).toBe('GAMEPLAY');
    expect(state1.dialogue.isVisible).toBe(true);
    expect(state1.dialogue.rawText).toBe('Welcome to TaleForge!');
    expect(state1.dialogue.speakerName).toBe('Alice');
    expect(state1.dialogue.isSeen).toBe(false); // First time seen
    expect(mockStorage.saveSeenDialogue).toHaveBeenCalledTimes(1);

    // Verify renderer received accumulated side-effects (BACKGROUND, SHOW)
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BACKGROUND', assetId: 'bg_room' }),
    );
    expect(mockRenderer.applySideEffect).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SHOW', character: 'alice' }),
    );

    // Advance to line 2
    await kernel.advance();
    const state2 = kernel.getState();
    expect(state2.dialogue.rawText).toBe('Second line.');
    expect(mockStorage.saveSeenDialogue).toHaveBeenCalledTimes(2);
  });

  it('should suspend on CHOICE, evaluate conditions, and pause AUTO mode', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'choice_demo' },
      { type: 'ASSIGN', variable: 'hasKey', value: { type: 'Literal', value: true } },
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 10 } },
      {
        type: 'CHOICE',
        choices: [
          {
            text: 'Open locked chest',
            targetScene: 'chest_opened',
            condition: { type: 'Identifier', name: 'hasKey' },
          },
          {
            text: 'Bribe guard (100 gold)',
            targetScene: 'guard_bribed',
            condition: {
              type: 'BinaryExpression',
              operator: '>=',
              left: { type: 'Identifier', name: 'gold' },
              right: { type: 'Literal', value: 100 },
            },
          },
        ],
      },
      { type: 'SCENE', name: 'chest_opened' },
      { type: 'DIALOGUE', character: 'alice', text: 'You found ancient treasure!' },
      { type: 'SCENE', name: 'guard_bribed' },
      { type: 'DIALOGUE', character: 'alice', text: 'Guard lets you pass.' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();

    // Turn AUTO mode on before choice
    kernel.toggleAuto();
    expect(kernel.getState().playbackMode).toBe('AUTO');

    // Advance into CHOICE
    await kernel.advance();

    const state = kernel.getState();
    expect(state.activeChoices).not.toBeNull();
    expect(state.activeChoices).toHaveLength(2);

    // Choice 0: condition satisfied
    expect(state.activeChoices![0]?.text).toBe('Open locked chest');
    expect(state.activeChoices![0]?.isSatisfied).toBe(true);

    // Choice 1: condition NOT satisfied (gold: 10 < 100)
    expect(state.activeChoices![1]?.text).toBe('Bribe guard (100 gold)');
    expect(state.activeChoices![1]?.isSatisfied).toBe(false);

    // Attempting to select unsatisfied choice should throw or reject
    await expect(kernel.selectChoice(1)).rejects.toThrow();

    // Selecting satisfied choice (0) should advance and auto-resume AUTO mode
    await kernel.selectChoice(0);

    const postChoiceState = kernel.getState();
    expect(postChoiceState.activeChoices).toBeNull();
    expect(postChoiceState.dialogue.rawText).toBe('You found ancient treasure!');
    expect(postChoiceState.playbackMode).toBe('AUTO'); // Resumed AUTO
  });

  it('should drop SKIP mode to NORMAL when encountering an unread dialogue line', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'skip_demo' },
      { type: 'DIALOGUE', character: 'alice', text: 'Known line 1' },
      { type: 'DIALOGUE', character: 'alice', text: 'Known line 2' },
      { type: 'DIALOGUE', character: 'alice', text: 'Brand new unread line!' },
    ];

    // Seed storage with read keys for lines 1 and 2
    seenStore.add('skip_demo#0:alice:Known line 1');
    seenStore.add('skip_demo#1:alice:Known line 2');

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.isSeen).toBe(true);

    // Turn SKIP mode on
    kernel.toggleSkip();
    expect(kernel.getState().playbackMode).toBe('SKIP');

    // Advance to line 2 (already seen) -> SKIP should remain active
    await kernel.advance();
    expect(kernel.getState().dialogue.rawText).toBe('Known line 2');
    expect(kernel.getState().playbackMode).toBe('SKIP');

    // Advance to line 3 (unread) -> SKIP should halt unconditionally, dropping to NORMAL
    await kernel.advance();
    expect(kernel.getState().dialogue.rawText).toBe('Brand new unread line!');
    expect(kernel.getState().dialogue.isSeen).toBe(false);
    expect(kernel.getState().playbackMode).toBe('NORMAL');
  });

  it('should capture voiceAssetId in BacklogEntry and perform Voice Auto-Cut on advance and rollback', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'voice_demo' },
      {
        type: 'PLAY',
        channel: 'voice',
        assetId: 'v_alice_hello',
        volume: 1.0,
      },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Hello doctor! {pause: 0.5s}Good morning!',
      },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Next line without voice.',
      },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();

    // Verify backlog contains voiceAssetId and stripped text
    const backlog = kernel.getState().backlog;
    expect(backlog).toHaveLength(1);
    expect(backlog[0]?.speakerName).toBe('alice');
    expect(backlog[0]?.text).toBe('Hello doctor! Good morning!'); // control tag stripped
    expect(backlog[0]?.voiceAssetId).toBe('v_alice_hello');

    // Advancing to the next line should trigger Voice Auto-Cut (stopVoice)
    await kernel.advance();
    expect(mockAudio.stopVoice).toHaveBeenCalledTimes(1);
    expect(kernel.getState().dialogue.rawText).toBe('Next line without voice.');

    // Rolling back to previous line should also stop voice and invoke state catch-up
    const rolled = kernel.rollback();
    expect(rolled).toBe(true);
    expect(mockAudio.stopVoice).toHaveBeenCalledTimes(2);
    expect(mockRenderer.syncStateCatchUp).toHaveBeenCalled();
    expect(mockAudio.syncStateCatchUp).toHaveBeenCalled();
    expect(kernel.getState().dialogue.rawText).toBe('Hello doctor! {pause: 0.5s}Good morning!');
  });

  it('should handle save desync resolution with pre-restore snapshotting (TAD §4.4)', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'story' },
      { type: 'ASSIGN', variable: 'chapter', value: { type: 'Literal', value: 1 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Live current story line.' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Live current story line.');

    // Construct a simulated save slot with mismatched scriptHash
    const desyncedSaveSlot: SaveSlotData = {
      slotIndex: 1,
      timestamp: Date.now() - 100000,
      thumbnailDataUrl: 'data:image/jpeg;base64,thumb',
      currentScene: 'story',
      previewText: 'Saved older dialogue',
      speakerName: 'alice',
      dialogueCounter: 5,
      scriptHash: 'mismatched_deadbeef',
      serializedState: JSON.stringify({
        version: 1,
        scriptHash: 'mismatched_deadbeef',
        sceneOffset: 0,
        dslVersion: '1.0.0',
        timestamp: Date.now(),
        dialogueCounter: 5,
        state: {
          currentScene: 'story',
          instructionPointer: 2,
          callStack: [],
          variables: { chapter: 99 },
          localVariables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
          activeInspect: null,
          activeSprites: {},
          activeAudio: {},
          currentDialogue: {
            type: 'DIALOGUE',
            character: 'alice',
            text: 'Saved older dialogue',
          },
          activeExecutingPc: 2,
        },
      }),
    };

    slotsStore[0] = desyncedSaveSlot;

    // Load slot 1 -> should trigger desync warning and open DesyncModal
    await kernel.loadSlot(1);

    const desyncState = kernel.getState();
    expect(desyncState.activeModal).toBe('desync');
    expect(desyncState.desyncData).toBeDefined();
    expect(desyncState.desyncData?.slotIndex).toBe(1);
    expect(desyncState.desyncData?.saveHash).toBe('mismatched_deadbeef');

    // Case A: User chooses "cancel" -> reverts safely to pre-restore snapshot
    kernel.resolveDesync('cancel');
    const cancelledState = kernel.getState();
    expect(cancelledState.activeModal).toBe('none');
    expect(cancelledState.dialogue.rawText).toBe('Live current story line.');
    expect(mockRenderer.syncStateCatchUp).toHaveBeenCalled();

    // Case B: Trigger desync again and choose "continue" -> overrides mismatch and applies catch-up
    await kernel.loadSlot(1);
    expect(kernel.getState().activeModal).toBe('desync');

    kernel.resolveDesync('continue');
    const continuedState = kernel.getState();
    expect(continuedState.activeModal).toBe('none');
    expect(continuedState.dialogue.rawText).toBe('Saved older dialogue');
  });

  it('should toggle UI navigation modes and update audio/settings', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hi' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    // Tier 1 Hide Controls
    expect(kernel.getState().isControlsHidden).toBe(false);
    kernel.toggleHideControls();
    expect(kernel.getState().isControlsHidden).toBe(true);

    // Tier 2 Clean Art Mode
    expect(kernel.getState().isCleanArtMode).toBe(false);
    kernel.toggleCleanArt();
    expect(kernel.getState().isCleanArtMode).toBe(true);

    // Modal navigation
    kernel.openModal('settings');
    expect(kernel.getState().activeModal).toBe('settings');
    kernel.closeModal();
    expect(kernel.getState().activeModal).toBe('none');

    // Settings
    kernel.setTextSpeed(50);
    expect(kernel.getState().settings.textSpeed).toBe(50);
    kernel.setAutoDelay(2000);
    expect(kernel.getState().settings.autoDelayMs).toBe(2000);

    // Audio volume & mute
    kernel.setAudioVolume('music', 0.6);
    expect(mockAudio.setVolume).toHaveBeenCalledWith('music', 0.6);
    expect(kernel.getState().audio.channelVolumes['music']).toBe(0.6);

    kernel.toggleMute();
    expect(mockAudio.setMute).toHaveBeenCalledWith(true);
    expect(kernel.getState().audio.isMuted).toBe(true);

    // Toast
    kernel.showToast('Game Saved!');
    expect(kernel.getState().activeToast?.message).toBe('Game Saved!');
  });
});
