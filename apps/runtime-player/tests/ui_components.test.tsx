import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type {
  PlayerViewState,
  PlayerUIActions,
  SaveSlotData,
  BacklogEntry,
} from '../src/core/contracts';

import {
  PlayerUIProvider,
  usePlayerState,
  usePlayerActions,
} from '../src/ui/context/PlayerUIContext';

import { PlayerApp } from '../src/ui/components/PlayerApp';
import { PreviewStandbyScreen } from '../src/ui/components/PreviewStandbyScreen';
import { TitleScreen } from '../src/ui/components/TitleScreen';
import { GameplayOverlay } from '../src/ui/components/GameplayOverlay';
import { ControlBar } from '../src/ui/components/ControlBar';
import { DialogueGroup } from '../src/ui/components/DialogueGroup';
import { DialogueBox } from '../src/ui/components/DialogueBox';
import { SpeakerNameplate } from '../src/ui/components/SpeakerNameplate';
import { ChoiceOverlay } from '../src/ui/components/ChoiceOverlay';
import { InspectModal } from '../src/ui/components/InspectModal';
import { SaveLoadModal } from '../src/ui/components/modals/SaveLoadModal';
import { BacklogDrawer } from '../src/ui/components/modals/BacklogDrawer';
import { GameSettingsModal } from '../src/ui/components/modals/GameSettingsModal';
import { DesyncModal } from '../src/ui/components/modals/DesyncModal';
import {
  BackIcon,
  AutoIcon,
  SkipIcon,
  SaveIcon,
  SettingsIcon,
  CloseIcon,
  VolumeIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
} from '../src/ui/components/common/Icons';

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
      rawText: 'Welcome to TaleForge!',
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

describe('PlayerUIContext', () => {
  afterEach(() => {
    cleanup();
  });

  it('throws an error when usePlayerState is consumed outside of PlayerUIProvider', () => {
    const TestConsumer = () => {
      usePlayerState();
      return null;
    };
    expect(() => render(<TestConsumer />)).toThrow(
      'usePlayerState must be used within PlayerUIProvider',
    );
  });

  it('throws an error when usePlayerActions is consumed outside of PlayerUIProvider', () => {
    const TestConsumer = () => {
      usePlayerActions();
      return null;
    };
    expect(() => render(<TestConsumer />)).toThrow(
      'usePlayerActions must be used within PlayerUIProvider',
    );
  });

  it('provides player state and actions to consumers within PlayerUIProvider', () => {
    const mockState = createMockState({ mode: 'STANDBY' });
    const mockActions = createMockActions();

    const TestConsumer = () => {
      const state = usePlayerState();
      const actions = usePlayerActions();
      return (
        <div>
          <span data-testid="mode-display">{state.mode}</span>
          <button data-testid="action-btn" onClick={() => actions.startNewGame()}>
            Start
          </button>
        </div>
      );
    };

    const { getByTestId } = render(
      <PlayerUIProvider state={mockState} actions={mockActions}>
        <TestConsumer />
      </PlayerUIProvider>,
    );

    expect(getByTestId('mode-display').textContent).toBe('STANDBY');
    fireEvent.click(getByTestId('action-btn'));
    expect(mockActions.startNewGame).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders PreviewStandbyScreen when state.mode is STANDBY', () => {
    const state = createMockState({ mode: 'STANDBY' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#preview-standby-screen')).not.toBeNull();
    expect(container.querySelector('#title-screen')).toBeNull();
    expect(container.querySelector('#gameplay-overlay')).toBeNull();
  });

  it('renders TitleScreen when state.mode is TITLE', () => {
    const state = createMockState({ mode: 'TITLE' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#title-screen')).not.toBeNull();
    expect(container.querySelector('#preview-standby-screen')).toBeNull();
    expect(container.querySelector('#gameplay-overlay')).toBeNull();
  });

  it('renders GameplayOverlay when state.mode is GAMEPLAY', () => {
    const state = createMockState({ mode: 'GAMEPLAY' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#gameplay-overlay')).not.toBeNull();
    expect(container.querySelector('#pixi-canvas-container')).not.toBeNull();
    expect(container.querySelector('#dialogue-group')).not.toBeNull();
    expect(container.querySelector('#title-screen')).toBeNull();
  });

  it('renders SaveLoadModal when activeModal is "save"', () => {
    const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'save' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#modal-saveload')).not.toBeNull();
  });

  it('renders SaveLoadModal when activeModal is "load"', () => {
    const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'load' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#modal-saveload')).not.toBeNull();
  });

  it('renders BacklogDrawer when activeModal is "backlog"', () => {
    const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'backlog' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#modal-backlog')).not.toBeNull();
  });

  it('renders GameSettingsModal when activeModal is "settings"', () => {
    const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'settings' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#modal-game-settings')).not.toBeNull();
  });

  it('renders InspectModal when activeModal is "inspect"', () => {
    const state = createMockState({
      mode: 'GAMEPLAY',
      activeModal: 'inspect',
      activeInspectModal: {
        assetUrl: 'https://cdn.example.com/item.png',
        title: 'Ancient Relic',
      },
    });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#inspect-overlay')).not.toBeNull();
  });

  it('renders DesyncModal when activeModal is "desync"', () => {
    const state = createMockState({
      mode: 'GAMEPLAY',
      activeModal: 'desync',
      desyncData: {
        slotIndex: 1,
        currentHash: 'hash-curr-123',
        saveHash: 'hash-saved-456',
        sceneName: 'scene_act1',
      },
    });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#modal-desync')).not.toBeNull();
  });

  it('does not render modal overlays when activeModal is "none"', () => {
    const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'none' });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <PlayerApp />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#modal-saveload')).toBeNull();
    expect(container.querySelector('#modal-backlog')).toBeNull();
    expect(container.querySelector('#modal-game-settings')).toBeNull();
    expect(container.querySelector('#inspect-overlay')).toBeNull();
    expect(container.querySelector('#modal-desync')).toBeNull();
  });
});

describe('PreviewStandbyScreen', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders standby screen with preview container', () => {
    const { container } = render(<PreviewStandbyScreen />);
    expect(container.querySelector('#preview-standby-screen')).not.toBeNull();
  });
});

describe('TitleScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders TitleScreen with New Game, Load Game, and Settings buttons', () => {
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={createMockState({ mode: 'TITLE' })} actions={actions}>
        <TitleScreen />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#title-screen')).not.toBeNull();
    const newGameBtn = container.querySelector('#btn-new-game');
    const loadGameBtn = container.querySelector('#btn-load-game');
    const settingsBtn = container.querySelector('#btn-settings');

    expect(newGameBtn).not.toBeNull();
    expect(loadGameBtn).not.toBeNull();
    expect(settingsBtn).not.toBeNull();

    fireEvent.click(newGameBtn!);
    expect(actions.startNewGame).toHaveBeenCalledTimes(1);

    fireEvent.click(loadGameBtn!);
    expect(actions.openModal).toHaveBeenCalledWith('load');

    fireEvent.click(settingsBtn!);
    expect(actions.openModal).toHaveBeenCalledWith('settings');
  });
});

describe('ControlBar (Tier 1 Collapse & Actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('hides or collapses #control-bar when isControlsHidden is true', () => {
    const state = createMockState({ isControlsHidden: true });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <ControlBar />
      </PlayerUIProvider>,
    );

    const controlBar = container.querySelector('#control-bar');
    expect(controlBar).not.toBeNull();
    const isHidden =
      controlBar?.classList.contains('hidden') ||
      controlBar?.classList.contains('collapsed') ||
      (controlBar as HTMLElement).style.display === 'none';
    expect(isHidden).toBe(true);
  });

  it('renders visible control bar when isControlsHidden is false', () => {
    const state = createMockState({ isControlsHidden: false });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <ControlBar />
      </PlayerUIProvider>,
    );

    const controlBar = container.querySelector('#control-bar');
    expect(controlBar).not.toBeNull();
    expect(controlBar?.classList.contains('hidden')).toBe(false);
    expect((controlBar as HTMLElement).style.display).not.toBe('none');
  });

  it('dispatches actions on button clicks', () => {
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={createMockState()} actions={actions}>
        <ControlBar />
      </PlayerUIProvider>,
    );

    fireEvent.click(container.querySelector('#btn-back')!);
    expect(actions.rollback).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('#btn-auto')!);
    expect(actions.toggleAuto).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('#btn-skip')!);
    expect(actions.toggleSkip).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('#btn-qsave')!);
    expect(actions.quickSave).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('#btn-qload')!);
    expect(actions.quickLoad).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('#btn-log')!);
    expect(actions.openModal).toHaveBeenCalledWith('backlog');

    fireEvent.click(container.querySelector('#btn-hide-ui')!);
    expect(actions.toggleHideControls).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('#btn-menu')!);
    expect(actions.openModal).toHaveBeenCalledWith('settings');
  });

  it('highlights active playbackMode on Auto and Skip buttons', () => {
    const autoState = createMockState({ playbackMode: 'AUTO' });
    const { container: autoContainer } = render(
      <PlayerUIProvider state={autoState} actions={createMockActions()}>
        <ControlBar />
      </PlayerUIProvider>,
    );
    expect(
      autoContainer.querySelector('#btn-auto')?.classList.contains('active') ||
        autoContainer.querySelector('#btn-auto')?.getAttribute('aria-pressed') === 'true',
    ).toBe(true);

    cleanup();

    const skipState = createMockState({ playbackMode: 'SKIP' });
    const { container: skipContainer } = render(
      <PlayerUIProvider state={skipState} actions={createMockActions()}>
        <ControlBar />
      </PlayerUIProvider>,
    );
    expect(
      skipContainer.querySelector('#btn-skip')?.classList.contains('active') ||
        skipContainer.querySelector('#btn-skip')?.getAttribute('aria-pressed') === 'true',
    ).toBe(true);
  });
});

describe('GameplayOverlay & Clean Art Mode (Tier 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('adds .clean-art-mode class when isCleanArtMode is true', () => {
    const state = createMockState({ isCleanArtMode: true });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>,
    );

    const overlay = container.querySelector('#gameplay-overlay');
    expect(overlay?.classList.contains('clean-art-mode')).toBe(true);
  });

  it('does not have .clean-art-mode class when isCleanArtMode is false', () => {
    const state = createMockState({ isCleanArtMode: false });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>,
    );

    const overlay = container.querySelector('#gameplay-overlay');
    expect(overlay?.classList.contains('clean-art-mode')).toBe(false);
  });

  it('dismisses Clean Art Mode via toggleCleanArt on user pointerdown or keydown', () => {
    const state = createMockState({ isCleanArtMode: true });
    const actions = createMockActions();

    render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>,
    );

    window.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(actions.toggleCleanArt).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(actions.toggleCleanArt).toHaveBeenCalledTimes(2);
  });
});

describe('DialogueGroup, DialogueBox, and SpeakerNameplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('SpeakerNameplate renders speaker name and color when speakerName is provided', () => {
    const { container } = render(
      <SpeakerNameplate speakerName="Alice" speakerColorHex="#38bdf8" />,
    );

    const nameplate = container.querySelector('#speaker-nameplate');
    expect(nameplate).not.toBeNull();
    expect(nameplate?.textContent).toContain('Alice');
    const styleAttr = nameplate?.getAttribute('style') ?? '';
    expect(
      styleAttr.includes('#38bdf8') ||
        (nameplate as HTMLElement).style.color.includes('56, 189, 248') ||
        (nameplate as HTMLElement).style.borderColor.includes('56, 189, 248'),
    ).toBe(true);
  });

  it('SpeakerNameplate is omitted or hidden when speakerName is not provided', () => {
    const { container } = render(
      <SpeakerNameplate speakerName={undefined} />,
    );

    const nameplate = container.querySelector('#speaker-nameplate');
    const isHidden = !nameplate || nameplate.classList.contains('hidden') || (nameplate as HTMLElement).style.display === 'none';
    expect(isHidden).toBe(true);
  });

  it('DialogueBox displays rawText and dispatches completeDialogue on click', () => {
    const actions = createMockActions();
    const { container } = render(
      <PlayerUIProvider state={createMockState()} actions={actions}>
        <DialogueBox rawText="Welcome to the magic academy!" isComplete={false} />
      </PlayerUIProvider>,
    );

    const dialogueBox = container.querySelector('#dialogue-box');
    expect(dialogueBox).not.toBeNull();
    expect(dialogueBox?.textContent).toContain('Welcome to the magic academy!');

    fireEvent.click(dialogueBox!);
    expect(actions.completeDialogue).toHaveBeenCalledTimes(1);
  });

  it('DialogueGroup integrates SpeakerNameplate, DialogueBox, and ControlBar in #dialogue-group', () => {
    const state = createMockState({
      dialogue: {
        isVisible: true,
        speakerName: 'Bob',
        speakerColorHex: '#f43f5e',
        rawText: 'Watch out!',
        isComplete: true,
        canAdvance: true,
        isSeen: true,
      },
    });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <DialogueGroup />
      </PlayerUIProvider>,
    );

    expect(container.querySelector('#dialogue-group')).not.toBeNull();
    expect(container.querySelector('#speaker-nameplate')?.textContent).toContain('Bob');
    expect(container.querySelector('#dialogue-box')?.textContent).toContain('Watch out!');
    expect(container.querySelector('#control-bar')).not.toBeNull();
  });
});

describe('ChoiceOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all active choices and dispatches selectChoice(index) when clicked', () => {
    const choices = [
      { text: 'Enter the front door', targetScene: 'front_door', isSatisfied: true },
      { text: 'Sneak through window', targetScene: 'window', isSatisfied: true },
    ];
    const state = createMockState({ activeChoices: choices });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <ChoiceOverlay />
      </PlayerUIProvider>,
    );

    const choiceButtons = container.querySelectorAll('.choice-button');
    expect(choiceButtons.length).toBe(2);
    expect(choiceButtons[0]?.textContent).toContain('Enter the front door');
    expect(choiceButtons[1]?.textContent).toContain('Sneak through window');

    fireEvent.click(choiceButtons[1]!);
    expect(actions.selectChoice).toHaveBeenCalledWith(1);
  });

  it('renders unsatisfied choices with .disabled class and prevents selection', () => {
    const choices = [
      { text: 'Free choice', targetScene: 'free', isSatisfied: true },
      { text: 'Locked choice', targetScene: 'locked', isSatisfied: false },
    ];
    const state = createMockState({ activeChoices: choices });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <ChoiceOverlay />
      </PlayerUIProvider>,
    );

    const choiceButtons = container.querySelectorAll('.choice-button');
    expect(choiceButtons[1]?.classList.contains('disabled')).toBe(true);

    fireEvent.click(choiceButtons[1]!);
    expect(actions.selectChoice).not.toHaveBeenCalled();
  });

  it('renders emergency rollback option when 100% of choices are unsatisfied', () => {
    const choices = [
      { text: 'Impossible A', targetScene: 'a', isSatisfied: false },
      { text: 'Impossible B', targetScene: 'b', isSatisfied: false },
    ];
    const state = createMockState({ activeChoices: choices });
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={state} actions={actions}>
        <ChoiceOverlay />
      </PlayerUIProvider>,
    );

    const emergencyBtn = container.querySelector('#btn-emergency-rollback');
    expect(emergencyBtn).not.toBeNull();

    fireEvent.click(emergencyBtn!);
    expect(actions.rollback).toHaveBeenCalledTimes(1);
  });
});

describe('InspectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders item image assetUrl and title', () => {
    const actions = createMockActions();
    const { container } = render(
      <PlayerUIProvider state={createMockState()} actions={actions}>
        <InspectModal assetUrl="https://cdn.example.com/ancient_key.png" title="Ancient Key" />
      </PlayerUIProvider>,
    );

    const overlay = container.querySelector('#inspect-overlay');
    expect(overlay).not.toBeNull();

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/ancient_key.png');

    const titleEl = container.querySelector('.inspect-title');
    expect(titleEl?.textContent).toContain('Ancient Key');
  });

  it('dispatches closeInspect when close button is clicked', () => {
    const actions = createMockActions();
    const { container } = render(
      <PlayerUIProvider state={createMockState()} actions={actions}>
        <InspectModal assetUrl="https://cdn.example.com/key.png" />
      </PlayerUIProvider>,
    );

    const closeBtn = container.querySelector('#btn-close-inspect');
    expect(closeBtn).not.toBeNull();

    fireEvent.click(closeBtn!);
    expect(actions.closeInspect).toHaveBeenCalledTimes(1);
  });
});

describe('Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('SaveLoadModal', () => {
    const mockSaveSlot: SaveSlotData = {
      slotIndex: 1,
      timestamp: Date.now(),
      thumbnailDataUrl: 'data:image/jpeg;base64,mockthumb',
      currentScene: 'chapter_1',
      previewText: 'This is a saved game.',
      speakerName: 'Alice',
      dialogueCounter: 42,
      serializedState: '{"vm":{}}',
    };

    it('renders 6 save slots and dispatches saveSlot in "save" mode', () => {
      const state = createMockState({
        saveSlots: [mockSaveSlot, null, null, null, null, null],
      });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <SaveLoadModal mode="save" />
        </PlayerUIProvider>,
      );

      const slotCards = container.querySelectorAll('.save-slot-card');
      expect(slotCards.length).toBe(6);

      fireEvent.click(slotCards[0]!);
      expect(actions.saveSlot).toHaveBeenCalledWith(1);

      fireEvent.click(container.querySelector('#btn-close-modal')!);
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });

    it('dispatches loadSlot in "load" mode for populated slot and ignores empty slots', () => {
      const state = createMockState({
        saveSlots: [mockSaveSlot, null, null, null, null, null],
      });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <SaveLoadModal mode="load" />
        </PlayerUIProvider>,
      );

      const slotCards = container.querySelectorAll('.save-slot-card');

      fireEvent.click(slotCards[0]!);
      expect(actions.loadSlot).toHaveBeenCalledWith(1);

      fireEvent.click(slotCards[1]!);
      expect(actions.loadSlot).toHaveBeenCalledTimes(1);
    });
  });

  describe('BacklogDrawer', () => {
    const mockBacklog: BacklogEntry[] = [
      {
        id: 'entry_1',
        speakerName: 'Alice',
        speakerColorHex: '#38bdf8',
        text: 'Hello adventurer!',
        voiceAssetId: 'v_alice_01',
        timestamp: 1000,
      },
      {
        id: 'entry_2',
        speakerName: 'Bob',
        speakerColorHex: '#f43f5e',
        text: 'Be careful ahead.',
        timestamp: 2000,
      },
    ];

    it('renders historical dialogue entries and replays voice', () => {
      const state = createMockState({ backlog: mockBacklog });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('#modal-backlog')).not.toBeNull();
      const entries = container.querySelectorAll('.backlog-entry');
      expect(entries.length).toBe(2);

      expect(entries[0]?.textContent).toContain('Alice');
      expect(entries[0]?.textContent).toContain('Hello adventurer!');

      const voiceBtn = entries[0]?.querySelector('.btn-replay-voice');
      expect(voiceBtn).not.toBeNull();

      fireEvent.click(voiceBtn!);
      expect(actions.replayVoice).toHaveBeenCalledWith('v_alice_01');

      expect(entries[1]?.querySelector('.btn-replay-voice')).toBeNull();

      fireEvent.click(container.querySelector('#btn-close-backlog')!);
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });
  });

  describe('GameSettingsModal', () => {
    it('dispatches audio volume, text speed, and auto delay adjustments', () => {
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={createMockState()} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('#modal-game-settings')).not.toBeNull();

      const musicSlider = container.querySelector('#slider-volume-music');
      if (musicSlider) {
        fireEvent.change(musicSlider, { target: { value: '0.75' } });
        expect(actions.setAudioVolume).toHaveBeenCalledWith('music', 0.75);
      }

      const textSpeedSlider = container.querySelector('#slider-text-speed');
      if (textSpeedSlider) {
        fireEvent.change(textSpeedSlider, { target: { value: '30' } });
        expect(actions.setTextSpeed).toHaveBeenCalledWith(30);
      }

      const autoDelaySlider = container.querySelector('#slider-auto-delay');
      if (autoDelaySlider) {
        fireEvent.change(autoDelaySlider, { target: { value: '2000' } });
        expect(actions.setAutoDelay).toHaveBeenCalledWith(2000);
      }

      fireEvent.click(container.querySelector('#btn-close-settings')!);
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });
  });

  describe('DesyncModal', () => {
    it('renders desync details and handles Continue, Restart, and Cancel resolutions', () => {
      const desyncData = {
        slotIndex: 2,
        currentHash: 'current-script-hash',
        saveHash: 'saved-script-hash',
        sceneName: 'prologue_battle',
      };
      const state = createMockState({ desyncData });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DesyncModal data={desyncData} />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('#modal-desync')).not.toBeNull();
      expect(container.textContent).toContain('prologue_battle');
      expect(container.textContent).toContain('current-script-hash');
      expect(container.textContent).toContain('saved-script-hash');

      fireEvent.click(container.querySelector('#btn-desync-continue')!);
      expect(actions.resolveDesync).toHaveBeenCalledWith('continue');

      fireEvent.click(container.querySelector('#btn-desync-restart')!);
      expect(actions.resolveDesync).toHaveBeenCalledWith('restart');

      fireEvent.click(container.querySelector('#btn-desync-cancel')!);
      expect(actions.resolveDesync).toHaveBeenCalledWith('cancel');
    });
  });
});

describe('Icons (Clean Monochrome Iconography)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders monochrome SVG vector icons with stroke="currentColor"', () => {
    const iconComponents = [
      { name: 'BackIcon', Comp: BackIcon },
      { name: 'AutoIcon', Comp: AutoIcon },
      { name: 'SkipIcon', Comp: SkipIcon },
      { name: 'SaveIcon', Comp: SaveIcon },
      { name: 'SettingsIcon', Comp: SettingsIcon },
      { name: 'CloseIcon', Comp: CloseIcon },
      { name: 'VolumeIcon', Comp: VolumeIcon },
      { name: 'EyeIcon', Comp: EyeIcon },
      { name: 'EyeOffIcon', Comp: EyeOffIcon },
      { name: 'HistoryIcon', Comp: HistoryIcon },
    ];

    for (const { Comp } of iconComponents) {
      const { container } = render(<Comp size={20} className="custom-icon" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(svg?.getAttribute('width')).toBe('20');
      expect(svg?.getAttribute('height')).toBe('20');
      cleanup();
    }
  });
});
