// TASK-CHOICE-CTRL: điều khiển (Save/Load/Settings/Backlog) khi đang ở menu lựa chọn.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { GameplayOverlay } from '../src/ui/components/GameplayOverlay';

function createMockState(overrides: Partial<PlayerViewState> = {}): PlayerViewState {
  return {
    mode: 'GAMEPLAY',
    playbackMode: 'NORMAL',
    isControlsHidden: false,
    isCleanArtMode: false,
    isAwaitingPauseAdvance: false,
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
      fontSize: 'medium',
      boxOpacity: 0.85,
    },
    activeToast: null,
    titleConfig: { title: 'Visual Novel' },
    hasSaveData: false,
    pendingConfirm: null,
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
    setFontSize: vi.fn(),
    setBoxOpacity: vi.fn(),
    restoreDefaultSettings: vi.fn(),
    showToast: vi.fn(),
    saveSlot: vi.fn(),
    loadSlot: vi.fn(),
    quickSave: vi.fn(),
    quickLoad: vi.fn(),
    replayVoice: vi.fn(),
    resolveDesync: vi.fn(),
    continueGame: vi.fn(),
    deleteSlot: vi.fn(),
    confirmPending: vi.fn(),
    cancelPending: vi.fn(),
    unlockAudio: vi.fn(),
    ...overrides,
  };
}

const CHOICES: NonNullable<PlayerViewState['activeChoices']> = [
  { text: 'Left', targetScene: 'left', isSatisfied: true },
  { text: 'Right', targetScene: 'right', isSatisfied: true },
];

function renderOverlay(stateOverrides: Partial<PlayerViewState>, actions = createMockActions()) {
  const view = render(
    <PlayerUIProvider state={createMockState(stateOverrides)} actions={actions}>
      <GameplayOverlay />
    </PlayerUIProvider>,
  );
  return { ...view, actions };
}

describe('Choice menu controls (TASK-CHOICE-CTRL)', () => {
  afterEach(() => {
    cleanup();
  });

  describe('control bar while choices are shown', () => {
    it('renders #choice-controls with Back, Save, Q.Save, Q.Load, Log and Menu', () => {
      const { container } = renderOverlay({ activeChoices: CHOICES });
      const bar = container.querySelector('#choice-controls');
      expect(bar).not.toBeNull();
      for (const id of ['btn-back', 'btn-save', 'btn-qsave', 'btn-qload', 'btn-log', 'btn-menu']) {
        expect(bar?.querySelector(`#${id}`)).not.toBeNull();
      }
    });

    it('omits Auto, Skip and Hide UI in the choice menu', () => {
      const { container } = renderOverlay({ activeChoices: CHOICES });
      const bar = container.querySelector('#choice-controls');
      for (const id of ['btn-auto', 'btn-skip', 'btn-hide-ui']) {
        expect(bar?.querySelector(`#${id}`)).toBeNull();
      }
    });

    it('keeps the dialogue group hidden and renders each button id only once', () => {
      const { container } = renderOverlay({ activeChoices: CHOICES });
      const group = container.querySelector('#dialogue-group') as HTMLElement | null;
      expect(group === null || group.style.display === 'none').toBe(true);
      expect(container.querySelectorAll('#btn-save')).toHaveLength(1);
      expect(container.querySelectorAll('#btn-menu')).toHaveLength(1);
    });

    it('opens the save, load-related and settings actions from the choice menu', () => {
      const { container, actions } = renderOverlay({ activeChoices: CHOICES });
      const bar = container.querySelector('#choice-controls');
      fireEvent.click(bar!.querySelector('#btn-save')!);
      fireEvent.click(bar!.querySelector('#btn-menu')!);
      fireEvent.click(bar!.querySelector('#btn-log')!);
      fireEvent.click(bar!.querySelector('#btn-qload')!);
      fireEvent.click(bar!.querySelector('#btn-back')!);
      expect(actions.openModal).toHaveBeenCalledWith('save');
      expect(actions.openModal).toHaveBeenCalledWith('settings');
      expect(actions.openModal).toHaveBeenCalledWith('backlog');
      expect(actions.quickLoad).toHaveBeenCalledTimes(1);
      expect(actions.rollback).toHaveBeenCalledTimes(1);
      expect(actions.selectChoice).not.toHaveBeenCalled();
    });

    it('does not render the choice controls when controls are hidden', () => {
      const { container } = renderOverlay({ activeChoices: CHOICES, isControlsHidden: true });
      expect(container.querySelector('#choice-controls')).toBeNull();
    });

    it('does not render #choice-controls when there are no choices', () => {
      const { container } = renderOverlay({ activeChoices: null });
      expect(container.querySelector('#choice-controls')).toBeNull();
      expect(container.querySelector('#dialogue-group #btn-save')).not.toBeNull();
    });
  });

  describe('keyboard while choices are shown', () => {
    it('opens Settings with Escape', () => {
      const { actions } = renderOverlay({ activeChoices: CHOICES });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(actions.openModal).toHaveBeenCalledWith('settings');
    });

    it('opens the Backlog with L', () => {
      const { actions } = renderOverlay({ activeChoices: CHOICES });
      fireEvent.keyDown(window, { key: 'l' });
      expect(actions.openModal).toHaveBeenCalledWith('backlog');
    });

    it('still ignores advance keys while choices are shown', () => {
      const { actions } = renderOverlay({ activeChoices: CHOICES });
      fireEvent.keyDown(window, { key: ' ' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(actions.advance).not.toHaveBeenCalled();
      expect(actions.completeDialogue).not.toHaveBeenCalled();
    });

    it('does not pick a choice with number keys or Enter while a modal is open', () => {
      const { actions } = renderOverlay({ activeChoices: CHOICES, activeModal: 'load' });
      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(actions.selectChoice).not.toHaveBeenCalled();
    });

    it('does not pick a choice while a confirmation is pending', () => {
      const { actions } = renderOverlay({
        activeChoices: CHOICES,
        pendingConfirm: 'quick_load_overwrite',
      });
      fireEvent.keyDown(window, { key: '2' });
      expect(actions.selectChoice).not.toHaveBeenCalled();
    });

    it('still picks a choice with number keys when no modal is open', () => {
      const { actions } = renderOverlay({ activeChoices: CHOICES });
      fireEvent.keyDown(window, { key: '2' });
      expect(actions.selectChoice).toHaveBeenCalledWith(1);
    });
  });
});
