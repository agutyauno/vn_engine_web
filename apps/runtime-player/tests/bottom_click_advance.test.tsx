import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { GameplayOverlay } from '../src/ui/components/GameplayOverlay';
import { DialogueGroup } from '../src/ui/components/DialogueGroup';

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
      rawText: 'Sample dialogue text',
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
    saveSlot: vi.fn().mockResolvedValue(undefined),
    loadSlot: vi.fn().mockResolvedValue(undefined),
    quickSave: vi.fn().mockResolvedValue(undefined),
    quickLoad: vi.fn().mockResolvedValue(undefined),
    replayVoice: vi.fn(),
    resolveDesync: vi.fn(),
    ...overrides,
  };
}

describe('Bottom Click Zone & DialogueGroup Visibility (TASK-player-core-bugs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('TC-BCA-01: should call actions.completeDialogue() and not advance() when clicking bottom zone during typewriter', () => {
    const actions = createMockActions();
    const state = createMockState({
      dialogue: {
        isVisible: true,
        speakerName: 'Alice',
        speakerColorHex: undefined,
        rawText: 'Typing in progress...',
        isComplete: false,
        canAdvance: true,
        isSeen: false,
      },
    });

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZone = container.querySelector('#bottom-click-zone');
    expect(bottomZone).not.toBeNull();
    fireEvent.click(bottomZone!);

    expect(actions.completeDialogue).toHaveBeenCalledTimes(1);
    expect(actions.advance).not.toHaveBeenCalled();
  });

  it('TC-BCA-02: should call actions.advance() when clicking bottom zone after dialogue is complete', () => {
    const actions = createMockActions();
    const state = createMockState({
      dialogue: {
        isVisible: true,
        speakerName: 'Alice',
        speakerColorHex: undefined,
        rawText: 'Completed dialogue line.',
        isComplete: true,
        canAdvance: true,
        isSeen: false,
      },
    });

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZone = container.querySelector('#bottom-click-zone');
    expect(bottomZone).not.toBeNull();
    fireEvent.click(bottomZone!);

    expect(actions.advance).toHaveBeenCalledTimes(1);
    expect(actions.completeDialogue).not.toHaveBeenCalled();
  });

  it('TC-BCA-03: should call actions.advance() when clicking bottom zone while dialogue is hidden', () => {
    const actions = createMockActions();
    const state = createMockState({
      dialogue: {
        isVisible: false,
        speakerName: undefined,
        speakerColorHex: undefined,
        rawText: '',
        isComplete: false,
        canAdvance: true,
        isSeen: false,
      },
    });

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZone = container.querySelector('#bottom-click-zone');
    expect(bottomZone).not.toBeNull();
    fireEvent.click(bottomZone!);

    expect(actions.advance).toHaveBeenCalledTimes(1);
    expect(actions.completeDialogue).not.toHaveBeenCalled();
  });

  it('TC-BCA-04: should ignore clicks when choices are active or modal is open, and handle null activeChoices safely', () => {
    const actions = createMockActions();

    // Subcase A: activeChoices has options
    const stateWithChoices = createMockState({
      activeChoices: [
        { text: 'Choice A', targetScene: 'scene_a', isSatisfied: true },
        { text: 'Choice B', targetScene: 'scene_b', isSatisfied: true },
      ],
    });

    const { container: containerChoices, unmount: unmountChoices } = render(
      <PlayerUIProvider state={stateWithChoices} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZoneA = containerChoices.querySelector('#bottom-click-zone');
    expect(bottomZoneA).not.toBeNull();
    fireEvent.click(bottomZoneA!);

    expect(actions.advance).not.toHaveBeenCalled();
    expect(actions.completeDialogue).not.toHaveBeenCalled();
    unmountChoices();

    // Subcase B: activeModal is open (e.g. 'save')
    const stateWithModal = createMockState({
      activeModal: 'save',
    });

    const { container: containerModal, unmount: unmountModal } = render(
      <PlayerUIProvider state={stateWithModal} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZoneB = containerModal.querySelector('#bottom-click-zone');
    expect(bottomZoneB).not.toBeNull();
    fireEvent.click(bottomZoneB!);

    expect(actions.advance).not.toHaveBeenCalled();
    expect(actions.completeDialogue).not.toHaveBeenCalled();
    unmountModal();

    // Subcase C: activeChoices is null (Safe null check)
    const stateNullChoices = createMockState({
      activeChoices: null,
      dialogue: {
        isVisible: true,
        speakerName: 'Alice',
        speakerColorHex: undefined,
        rawText: 'Line with null choices',
        isComplete: true,
        canAdvance: true,
        isSeen: false,
      },
    });

    const { container: containerNull } = render(
      <PlayerUIProvider state={stateNullChoices} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZoneC = containerNull.querySelector('#bottom-click-zone');
    expect(bottomZoneC).not.toBeNull();
    expect(() => fireEvent.click(bottomZoneC!)).not.toThrow();
    expect(actions.advance).toHaveBeenCalledTimes(1);
  });

  it('TC-BCA-05: should ignore bottom zone clicks when isCleanArtMode is true', () => {
    const actions = createMockActions();
    const state = createMockState({
      isCleanArtMode: true,
      dialogue: {
        isVisible: true,
        speakerName: 'Alice',
        speakerColorHex: undefined,
        rawText: 'Clean art text',
        isComplete: true,
        canAdvance: true,
        isSeen: false,
      },
    });

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>
    );

    const bottomZone = container.querySelector('#bottom-click-zone');
    expect(bottomZone).not.toBeNull();
    fireEvent.click(bottomZone!);

    expect(actions.advance).not.toHaveBeenCalled();
    expect(actions.completeDialogue).not.toHaveBeenCalled();
  });

  it('TC-BCA-06: should apply hidden class and display:none to DialogueGroup when dialogue.isVisible is false', () => {
    const actions = createMockActions();

    // Case A: dialogue.isVisible = false -> DialogueGroup must be hidden
    const stateHidden = createMockState({
      dialogue: {
        isVisible: false,
        speakerName: undefined,
        speakerColorHex: undefined,
        rawText: '',
        isComplete: false,
        canAdvance: false,
        isSeen: false,
      },
      activeChoices: null,
    });

    const { container: containerHidden, unmount: unmountHidden } = render(
      <PlayerUIProvider state={stateHidden} actions={actions}>
        <DialogueGroup />
      </PlayerUIProvider>
    );

    const dialogueGroupHidden = containerHidden.querySelector('#dialogue-group');
    expect(dialogueGroupHidden).not.toBeNull();
    expect(dialogueGroupHidden?.classList.contains('hidden')).toBe(true);
    expect((dialogueGroupHidden as HTMLElement).style.display).toBe('none');
    unmountHidden();

    // Case B: dialogue.isVisible = true -> DialogueGroup must NOT be hidden
    const stateVisible = createMockState({
      dialogue: {
        isVisible: true,
        speakerName: 'Alice',
        speakerColorHex: undefined,
        rawText: 'Visible text',
        isComplete: true,
        canAdvance: true,
        isSeen: false,
      },
      activeChoices: null,
    });

    const { container: containerVisible } = render(
      <PlayerUIProvider state={stateVisible} actions={actions}>
        <DialogueGroup />
      </PlayerUIProvider>
    );

    const dialogueGroupVisible = containerVisible.querySelector('#dialogue-group');
    expect(dialogueGroupVisible).not.toBeNull();
    expect(dialogueGroupVisible?.classList.contains('hidden')).toBe(false);
    expect((dialogueGroupVisible as HTMLElement).style.display).not.toBe('none');
  });
});

