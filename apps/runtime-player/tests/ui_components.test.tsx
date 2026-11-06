import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JSX } from 'preact';
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
import * as IconsModule from '../src/ui/components/common/Icons';

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

  it('DialogueBox advances dialogue on click when text is complete', () => {
    const actions = createMockActions();
    const { container } = render(
      <PlayerUIProvider state={createMockState()} actions={actions}>
        <DialogueBox rawText="Done typing!" isComplete={true} />
      </PlayerUIProvider>,
    );

    const dialogueBox = container.querySelector('#dialogue-box');
    expect(dialogueBox).not.toBeNull();
    fireEvent.click(dialogueBox!);
    expect(actions.advance).toHaveBeenCalledTimes(1);
  });

  it('GameplayOverlay handles global keyboard shortcuts (Space/Enter, rollback, toggles)', () => {
    const actions = createMockActions();
    const state = createMockState({
      mode: 'GAMEPLAY',
      dialogue: {
        isVisible: true,
        speakerName: undefined,
        rawText: 'Hello world',
        isComplete: true,
        canAdvance: true,
        isSeen: true,
      },
    });

    render(
      <PlayerUIProvider state={state} actions={actions}>
        <GameplayOverlay />
      </PlayerUIProvider>,
    );

    fireEvent.keyDown(window, { key: ' ' });
    expect(actions.advance).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(actions.rollback).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'a' });
    expect(actions.toggleAuto).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 's' });
    expect(actions.toggleSkip).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'l' });
    expect(actions.openModal).toHaveBeenCalledWith('backlog');

    fireEvent.keyDown(window, { key: 'h' });
    expect(actions.toggleCleanArt).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(actions.openModal).toHaveBeenCalledWith('settings');
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

describe('Phase 2: Minimalist ADV Presentation & Viewport Scaling (RED Gate)', () => {
  afterEach(() => {
    cleanup();
  });

  it('TEST-ADV-01 (Dialogue Group ADV Layout): verifies DOM hierarchy with SpeakerNameplate above, DialogueBox in middle, and ControlBar below', () => {
    const state = createMockState({
      dialogue: {
        isVisible: true,
        speakerName: 'Alice',
        speakerColorHex: '#38bdf8',
        rawText: 'Welcome to TaleForge ADV mode!',
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

    const group = container.querySelector('#dialogue-group');
    expect(group).not.toBeNull();

    const speakerNameplate = group?.querySelector('#speaker-nameplate');
    const dialogueBox = group?.querySelector('#dialogue-box');
    const controlBar = group?.querySelector('#control-bar');

    expect(speakerNameplate).not.toBeNull();
    expect(dialogueBox).not.toBeNull();
    expect(controlBar).not.toBeNull();

    // Verify DOM order: SpeakerNameplate is first child, DialogueBox is middle, ControlBar is last child
    const children = Array.from(group!.children);
    expect(children[0]).toBe(speakerNameplate);
    expect(children[1]).toBe(dialogueBox);
    expect(children[2]).toBe(controlBar);

    // Verify document position order
    expect(
      (speakerNameplate!.compareDocumentPosition(dialogueBox!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
    expect(
      (dialogueBox!.compareDocumentPosition(controlBar!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
  });

  it('TEST-ADV-02 (ControlBar ADV & Hide UI): renders full suite of monochrome icon-only buttons with accessible labels and toggles hide UI', () => {
    // 1. Check all 8 required action buttons are present as icon-only monochrome buttons
    const stateVisible = createMockState({ isControlsHidden: false });
    const actions = createMockActions();

    const { container, unmount } = render(
      <PlayerUIProvider state={stateVisible} actions={actions}>
        <ControlBar />
      </PlayerUIProvider>,
    );

    const controlBar = container.querySelector('#control-bar');
    expect(controlBar).not.toBeNull();
    expect(controlBar?.classList.contains('hidden')).toBe(false);
    expect((controlBar as HTMLElement).style.display).not.toBe('none');

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('#control-bar button'));
    expect(buttons.length).toBeGreaterThanOrEqual(8);

    // ADV requirement: buttons must be icon-only (monochrome SVG, no visible text spans)
    for (const btn of buttons) {
      const svg = btn.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      // No text spans inside buttons in minimalist ADV presentation
      expect(btn.querySelector('span')).toBeNull();
      expect(btn.textContent?.trim()).toBe('');
      // Accessible aria-label and title must be present
      expect(btn.getAttribute('aria-label')).toBeTruthy();
      expect(btn.getAttribute('title')).toBeTruthy();
    }

    // Verify all 8 core actions exist by aria-label or title (Back, Auto, Skip, Log, Save, Load, Settings, Hide UI)
    const hasButton = (keyword: string) =>
      buttons.some((btn) => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const title = (btn.getAttribute('title') || '').toLowerCase();
        return label.includes(keyword.toLowerCase()) || title.includes(keyword.toLowerCase());
      });

    expect(hasButton('back')).toBe(true);
    expect(hasButton('auto')).toBe(true);
    expect(hasButton('skip')).toBe(true);
    expect(hasButton('log') || hasButton('backlog')).toBe(true);
    expect(hasButton('save')).toBe(true);
    expect(hasButton('load')).toBe(true);
    expect(hasButton('settings')).toBe(true);
    expect(hasButton('hide')).toBe(true);

    unmount();

    // 2. When isControlsHidden is true, ControlBar automatically hides
    const stateHidden = createMockState({ isControlsHidden: true });
    const { container: hiddenContainer } = render(
      <PlayerUIProvider state={stateHidden} actions={actions}>
        <ControlBar />
      </PlayerUIProvider>,
    );

    const hiddenBar = hiddenContainer.querySelector('#control-bar');
    expect(hiddenBar).not.toBeNull();
    const isHidden =
      hiddenBar?.classList.contains('hidden') ||
      (hiddenBar as HTMLElement).style.display === 'none' ||
      (hiddenBar as HTMLElement).style.opacity === '0';
    expect(isHidden).toBe(true);
  });

  it('TEST-ADV-03 (TitleScreen Asymmetric Layout): renders asymmetric left menu column containing Title, Start Game, Load Game, and Settings', () => {
    const actions = createMockActions();

    const { container } = render(
      <PlayerUIProvider state={createMockState({ mode: 'TITLE' })} actions={actions}>
        <TitleScreen />
      </PlayerUIProvider>,
    );

    // Expect left menu column (.title-menu-column or #title-menu-column)
    const leftColumn = container.querySelector('.title-menu-column, #title-menu-column');
    expect(leftColumn).not.toBeNull();

    // Check game title heading inside left column
    const titleEl = leftColumn?.querySelector('h1, .title-screen-heading, .title-game-name');
    expect(titleEl).not.toBeNull();
    expect(titleEl?.textContent?.trim().length).toBeGreaterThan(0);

    // Check Start Game button
    const startBtn = leftColumn?.querySelector<HTMLButtonElement>(
      '#btn-new-game, #btn-start-game, button[aria-label*="Start"], button[aria-label*="New Game"]',
    );
    expect(startBtn).not.toBeNull();

    // Check Load Game button
    const loadBtn = leftColumn?.querySelector<HTMLButtonElement>(
      '#btn-load-game, button[aria-label*="Load"]',
    );
    expect(loadBtn).not.toBeNull();

    // Check Settings button
    const settingsBtn = leftColumn?.querySelector<HTMLButtonElement>(
      '#btn-settings, button[aria-label*="Settings"]',
    );
    expect(settingsBtn).not.toBeNull();

    // Verify clicks dispatch corresponding actions
    fireEvent.click(startBtn!);
    expect(actions.startNewGame).toHaveBeenCalledTimes(1);

    fireEvent.click(loadBtn!);
    expect(actions.openModal).toHaveBeenCalledWith('load');

    fireEvent.click(settingsBtn!);
    expect(actions.openModal).toHaveBeenCalledWith('settings');
  });

  it('TEST-ICONS-01 (Clean Monochrome Icons): Icons.tsx exports FolderIcon and BookOpenIcon/HistoryIcon conforming to stroke="currentColor"', () => {
    // Dynamically inspect Icons module exports
    const iconsRecord = IconsModule as Record<string, unknown>;

    // FolderIcon must be exported for Load button
    expect(iconsRecord.FolderIcon).toBeDefined();
    expect(typeof iconsRecord.FolderIcon).toBe('function');

    // Either BookOpenIcon or HistoryIcon must be exported for Log button
    const LogIconComp = (iconsRecord.BookOpenIcon || iconsRecord.HistoryIcon) as ((props: { size?: number }) => JSX.Element) | undefined;
    expect(LogIconComp).toBeDefined();
    expect(typeof LogIconComp).toBe('function');

    // Render FolderIcon and verify monochrome vector attributes
    if (typeof iconsRecord.FolderIcon === 'function') {
      const FolderComp = iconsRecord.FolderIcon as (props: { size?: number }) => JSX.Element;
      const { container } = render(<FolderComp size={16} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      cleanup();
    }

    // Render Log icon and verify monochrome vector attributes
    if (typeof LogIconComp === 'function') {
      const { container } = render(<LogIconComp size={16} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      cleanup();
    }
  });
});

describe('Phase 3: Player Ergonomics, Shortcuts, Modals & Navigation (RED Gate)', () => {
  afterEach(() => {
    cleanup();
  });

  describe('TEST-NAV-01: Global Keyboard Shortcuts & Event Handling', () => {
    it('handles Space, Enter, and ArrowRight for dialogue typewriter completion and advance', () => {
      const actions = createMockActions();

      // Case 1: Dialogue text is still typing (isComplete = false)
      const typingState = createMockState({
        dialogue: {
          isVisible: true,
          speakerName: 'Alice',
          rawText: 'Still typing...',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { unmount } = render(
        <PlayerUIProvider state={typingState} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: ' ' });
      expect(actions.completeDialogue).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'Enter' });
      expect(actions.completeDialogue).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(actions.completeDialogue).toHaveBeenCalledTimes(3);

      unmount();

      // Case 2: Dialogue text is fully displayed (isComplete = true)
      const completeState = createMockState({
        dialogue: {
          isVisible: true,
          speakerName: 'Alice',
          rawText: 'Finished sentence.',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      render(
        <PlayerUIProvider state={completeState} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: ' ' });
      expect(actions.advance).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'Enter' });
      expect(actions.advance).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(actions.advance).toHaveBeenCalledTimes(3);
    });

    it('handles ArrowLeft for rollback, A for Auto, S and Tab for Skip', () => {
      const actions = createMockActions();
      const state = createMockState();

      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(actions.rollback).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'a' });
      expect(actions.toggleAuto).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(window, { key: 'A' });
      expect(actions.toggleAuto).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(window, { key: 's' });
      expect(actions.toggleSkip).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(window, { key: 'S' });
      expect(actions.toggleSkip).toHaveBeenCalledTimes(2);
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(actions.toggleSkip).toHaveBeenCalledTimes(3);
    });

    it('toggles Backlog drawer with L / l and Settings modal with Escape', () => {
      const actions = createMockActions();

      const closedState = createMockState({ activeModal: 'none' });
      const { unmount } = render(
        <PlayerUIProvider state={closedState} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: 'l' });
      expect(actions.openModal).toHaveBeenCalledWith('backlog');

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(actions.openModal).toHaveBeenCalledWith('settings');

      unmount();

      const backlogState = createMockState({ activeModal: 'backlog' });
      const { unmount: unmountBacklog } = render(
        <PlayerUIProvider state={backlogState} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: 'l' });
      expect(actions.closeModal).toHaveBeenCalledTimes(1);

      unmountBacklog();

      const settingsState = createMockState({ activeModal: 'settings' });
      render(
        <PlayerUIProvider state={settingsState} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(actions.closeModal).toHaveBeenCalledTimes(2);
    });

    it('toggles Hide Controls on H / h and on right-click contextmenu', () => {
      const actions = createMockActions();
      const state = createMockState();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: 'h' });
      expect(actions.toggleHideControls).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'H' });
      expect(actions.toggleHideControls).toHaveBeenCalledTimes(2);

      const overlay = container.querySelector('#gameplay-overlay')!;
      const contextMenuEvt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      overlay.dispatchEvent(contextMenuEvt);
      expect(contextMenuEvt.defaultPrevented).toBe(true);
      expect(actions.toggleHideControls).toHaveBeenCalledTimes(3);
    });
  });

  describe('TEST-NAV-02: Dialogue Box Suppression during Active Choices', () => {
    it('suppresses #dialogue-group when activeChoices.length > 0', () => {
      const stateWithChoices = createMockState({
        dialogue: {
          isVisible: true,
          speakerName: 'Narrator',
          rawText: 'What will you do?',
          isComplete: true,
          canAdvance: false,
          isSeen: true,
        },
        activeChoices: [
          { text: 'Option A', targetScene: 'scene_a', isSatisfied: true },
          { text: 'Option B', targetScene: 'scene_b', isSatisfied: true },
        ],
      });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={stateWithChoices} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const dialogueGroup = container.querySelector('#dialogue-group');
      const isSuppressed =
        !dialogueGroup ||
        dialogueGroup.classList.contains('hidden') ||
        (dialogueGroup as HTMLElement).style.display === 'none';

      expect(isSuppressed).toBe(true);
    });
  });

  describe('TEST-CHOICE-01: Choice Keyboard Navigation & Number Badges', () => {
    const mockChoices = [
      { text: 'Explore the castle', targetScene: 'castle', isSatisfied: true },
      { text: 'Visit the tavern', targetScene: 'tavern', isSatisfied: true },
      { text: 'Locked dungeon', targetScene: 'dungeon', isSatisfied: false },
    ];

    it('renders numerical badges [1], [2], [3] for choices', () => {
      const state = createMockState({ activeChoices: mockChoices, isControlsHidden: false });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>,
      );

      const badges = container.querySelectorAll('.choice-badge, .choice-index');
      expect(badges.length).toBe(3);
      expect(badges[0]!.textContent).toContain('1');
      expect(badges[1]!.textContent).toContain('2');
      expect(badges[2]!.textContent).toContain('3');
    });

    it('hides numerical badges when isControlsHidden is true', () => {
      const stateHidden = createMockState({ activeChoices: mockChoices, isControlsHidden: true });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={stateHidden} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>,
      );

      const badges = container.querySelectorAll('.choice-badge, .choice-index');
      const areBadgesHidden =
        badges.length === 0 ||
        Array.from(badges).every(
          (b) =>
            b.classList.contains('hidden') ||
            (b as HTMLElement).style.display === 'none' ||
            container.querySelector('.tool-ui-hidden') !== null,
        );
      expect(areBadgesHidden).toBe(true);
    });

    it('supports direct numerical shortcut selection 1-9 for satisfied choices', () => {
      const state = createMockState({ activeChoices: mockChoices });
      const actions = createMockActions();

      render(
        <PlayerUIProvider state={state} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: '1' });
      expect(actions.selectChoice).toHaveBeenCalledWith(0);

      fireEvent.keyDown(window, { key: '2' });
      expect(actions.selectChoice).toHaveBeenCalledWith(1);

      fireEvent.keyDown(window, { key: '3' });
      expect(actions.selectChoice).not.toHaveBeenCalledWith(2);
    });

    it('cycles focus with ArrowUp / ArrowDown and confirms with Enter', () => {
      const state = createMockState({ activeChoices: mockChoices });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <ChoiceOverlay />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      const buttons = container.querySelectorAll('.choice-button');
      expect(buttons[1]!.classList.contains('focused') || buttons[1]!.classList.contains('selected')).toBe(true);

      fireEvent.keyDown(window, { key: 'Enter' });
      expect(actions.selectChoice).toHaveBeenCalledWith(1);
    });
  });

  describe('TEST-MODAL-01: Contextual Save/Load Single-Click Without Tabs', () => {
    const mockSaveSlot: SaveSlotData = {
      slotIndex: 1,
      timestamp: Date.now(),
      thumbnailDataUrl: 'data:image/jpeg;base64,mock',
      currentScene: 'chapter_1',
      previewText: 'Saved game preview',
      speakerName: 'Alice',
      dialogueCounter: 10,
      serializedState: '{}',
    };

    it('operates strictly in "save" mode without tabs and saves immediately on card click', () => {
      const state = createMockState({ saveSlots: [mockSaveSlot, null, null, null, null, null] });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <SaveLoadModal mode="save" />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('h2')?.textContent).toContain('Save');
      expect(container.querySelectorAll('.tab, .modal-tab, .saveload-mode-bar [role="tab"]').length).toBe(0);

      const cards = container.querySelectorAll('.save-slot-card');
      fireEvent.click(cards[0]!);
      expect(actions.saveSlot).toHaveBeenCalledWith(1);

      fireEvent.click(cards[1]!);
      expect(actions.saveSlot).toHaveBeenCalledWith(2);
    });

    it('operates strictly in "load" mode without tabs and loads only occupied slots', () => {
      const state = createMockState({ saveSlots: [mockSaveSlot, null, null, null, null, null] });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <SaveLoadModal mode="load" />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('h2')?.textContent).toContain('Load');
      expect(container.querySelectorAll('.tab, .modal-tab, .saveload-mode-bar [role="tab"]').length).toBe(0);

      const cards = container.querySelectorAll('.save-slot-card');
      fireEvent.click(cards[0]!);
      expect(actions.loadSlot).toHaveBeenCalledWith(1);

      fireEvent.click(cards[1]!);
      expect(actions.loadSlot).toHaveBeenCalledTimes(1);
    });
  });

  describe('TEST-MODAL-02: Backlog Drawer Without Timestamps', () => {
    const mockBacklog: BacklogEntry[] = [
      {
        id: 'entry_1',
        speakerName: 'Alice',
        text: 'The kingdom is in danger.',
        voiceAssetId: 'v_alice_01',
        timestamp: 1700000000000,
      },
      {
        id: 'entry_2',
        speakerName: 'Bob',
        text: 'We must prepare at once.',
        timestamp: 1700000005000,
      },
    ];

    it('renders dialogue entries without timestamps and displays voice replay button for voiced lines', () => {
      const state = createMockState({ backlog: mockBacklog });
      const actions = createMockActions();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      expect(container.querySelectorAll('.backlog-timestamp, .backlog-date, .backlog-time').length).toBe(0);

      const entries = container.querySelectorAll('.backlog-entry');
      expect(entries.length).toBe(2);
      expect(entries[0]!.textContent).not.toMatch(/\d{1,2}:\d{2}/);
      expect(entries[0]!.textContent).toContain('Alice');
      expect(entries[0]!.textContent).toContain('The kingdom is in danger.');

      const voiceBtn = entries[0]!.querySelector('.btn-replay-voice');
      expect(voiceBtn).not.toBeNull();
      fireEvent.click(voiceBtn!);
      expect(actions.replayVoice).toHaveBeenCalledWith('v_alice_01');

      expect(entries[1]!.querySelector('.btn-replay-voice')).toBeNull();
    });
  });

  describe('TEST-MODAL-03: Settings 4 Audio Sliders & Fullscreen, No Resolution Picker', () => {
    it('renders 4 independent audio sliders (Master, Music, SFX, Voice) and dispatches setAudioVolume', () => {
      const actions = createMockActions();
      const state = createMockState();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      const masterSlider = container.querySelector<HTMLInputElement>('#slider-volume-master');
      expect(masterSlider).not.toBeNull();
      fireEvent.change(masterSlider!, { target: { value: '0.6' } });
      expect(actions.setAudioVolume).toHaveBeenCalledWith('master', 0.6);

      const musicSlider = container.querySelector<HTMLInputElement>('#slider-volume-music');
      expect(musicSlider).not.toBeNull();
      fireEvent.change(musicSlider!, { target: { value: '0.75' } });
      expect(actions.setAudioVolume).toHaveBeenCalledWith('music', 0.75);

      const sfxSlider = container.querySelector<HTMLInputElement>('#slider-volume-sfx, #slider-volume-sound');
      expect(sfxSlider).not.toBeNull();
      fireEvent.change(sfxSlider!, { target: { value: '0.5' } });
      expect(actions.setAudioVolume).toHaveBeenCalledWith('sound', 0.5);

      const voiceSlider = container.querySelector<HTMLInputElement>('#slider-volume-voice');
      expect(voiceSlider).not.toBeNull();
      fireEvent.change(voiceSlider!, { target: { value: '0.9' } });
      expect(actions.setAudioVolume).toHaveBeenCalledWith('voice', 0.9);
    });

    it('renders Fullscreen toggle button and contains strictly NO resolution picker', () => {
      const actions = createMockActions();
      const state = createMockState();

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      const fullscreenBtn = container.querySelector(
        '#btn-toggle-fullscreen, button[aria-label*="Fullscreen"], button[title*="Fullscreen"]',
      );
      expect(fullscreenBtn).not.toBeNull();

      expect(container.querySelector('#select-resolution, .resolution-picker, select[name*="resolution"]')).toBeNull();
      expect(container.textContent).not.toMatch(/1920x1080|1280x720|Screen Resolution/i);
    });
  });
});
