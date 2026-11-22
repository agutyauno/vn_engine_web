import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { ControlBar } from '../src/ui/components/ControlBar';
import { GameplayOverlay } from '../src/ui/components/GameplayOverlay';
import { GameSettingsModal } from '../src/ui/components/modals/GameSettingsModal';

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
      rawText: 'Welcome to TaleForge!',
      isComplete: false,
      canAdvance: true,
      isSeen: false,
    },
    activeChoices: null,
    activeInspectModal: null,
    activeModal: 'none',
    settings: {
      textSpeed: 40,
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
        music: 0.8,
        sound: 0.8,
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
    saveSlot: vi.fn().mockResolvedValue(undefined),
    loadSlot: vi.fn().mockResolvedValue(undefined),
    quickSave: vi.fn().mockResolvedValue(undefined),
    quickLoad: vi.fn().mockResolvedValue(undefined),
    replayVoice: vi.fn(),
    resolveDesync: vi.fn(),
    continueGame: vi.fn().mockResolvedValue(undefined),
    deleteSlot: vi.fn().mockResolvedValue(undefined),
    confirmPending: vi.fn().mockResolvedValue(undefined),
    cancelPending: vi.fn(),
    unlockAudio: vi.fn(),
    ...overrides,
  };
}

function q<T extends Element = HTMLElement>(container: Element, selector: string): T {
  const el = container.querySelector<T>(selector);
  expect(el, `expected "${selector}" to be rendered`).not.toBeNull();
  return el!;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Phase T7: ControlBar, Hotkeys & Settings Footer (RED phase)', () => {
  describe('Contract 1: ControlBar #btn-save button and action contracts', () => {
    it('renders #btn-save with correct aria-label, title, monochrome icon, placed right before #btn-qsave', () => {
      const actions = createMockActions();
      const state = createMockState();
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <ControlBar />
        </PlayerUIProvider>,
      );

      const btnSave = q<HTMLButtonElement>(container, '#btn-save');
      expect(btnSave.getAttribute('aria-label')).toBe('Open Save Menu');
      expect(btnSave.getAttribute('title')).toBe('Save');

      const svg = btnSave.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(btnSave.textContent?.trim()).toBe('');

      const btnQSave = q<HTMLButtonElement>(container, '#btn-qsave');
      expect(btnSave.nextElementSibling).toBe(btnQSave);
    });

    it('clicking #btn-save calls actions.openModal with "save"', () => {
      const actions = createMockActions();
      const state = createMockState();
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <ControlBar />
        </PlayerUIProvider>,
      );

      const btnSave = q<HTMLButtonElement>(container, '#btn-save');
      fireEvent.click(btnSave);
      expect(vi.mocked(actions.openModal)).toHaveBeenCalledWith('save');
    });

    it('preserves existing buttons and their click actions (#btn-qsave, #btn-qload, and core actions)', () => {
      const actions = createMockActions();
      const state = createMockState();
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <ControlBar />
        </PlayerUIProvider>,
      );

      const btnQSave = q<HTMLButtonElement>(container, '#btn-qsave');
      fireEvent.click(btnQSave);
      expect(vi.mocked(actions.quickSave)).toHaveBeenCalledTimes(1);

      const btnQLoad = q<HTMLButtonElement>(container, '#btn-qload');
      fireEvent.click(btnQLoad);
      expect(vi.mocked(actions.quickLoad)).toHaveBeenCalledTimes(1);

      const btnBack = q<HTMLButtonElement>(container, '#btn-back');
      fireEvent.click(btnBack);
      expect(vi.mocked(actions.rollback)).toHaveBeenCalledTimes(1);

      const btnAuto = q<HTMLButtonElement>(container, '#btn-auto');
      fireEvent.click(btnAuto);
      expect(vi.mocked(actions.toggleAuto)).toHaveBeenCalledTimes(1);

      const btnSkip = q<HTMLButtonElement>(container, '#btn-skip');
      fireEvent.click(btnSkip);
      expect(vi.mocked(actions.toggleSkip)).toHaveBeenCalledTimes(1);

      const btnLog = q<HTMLButtonElement>(container, '#btn-log');
      fireEvent.click(btnLog);
      expect(vi.mocked(actions.openModal)).toHaveBeenCalledWith('backlog');

      const btnHide = q<HTMLButtonElement>(container, '#btn-hide-ui');
      fireEvent.click(btnHide);
      expect(vi.mocked(actions.toggleHideControls)).toHaveBeenCalledTimes(1);

      const btnMenu = q<HTMLButtonElement>(container, '#btn-menu');
      fireEvent.click(btnMenu);
      expect(vi.mocked(actions.openModal)).toHaveBeenCalledWith('settings');
    });
  });

  describe('Contract 2: Hotkeys in GameplayOverlay (F5, F9, and Modal / Confirm Guards)', () => {
    it('dispatches quickSave on F5 keydown on window and marks defaultPrevented === true', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'none' });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const ev = new KeyboardEvent('keydown', { key: 'F5', cancelable: true, bubbles: true });
      window.dispatchEvent(ev);

      expect(ev.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickSave)).toHaveBeenCalledTimes(1);
    });

    it('dispatches quickLoad on F9 keydown on window and marks defaultPrevented === true', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'none' });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const ev = new KeyboardEvent('keydown', { key: 'F9', cancelable: true, bubbles: true });
      window.dispatchEvent(ev);

      expect(ev.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickLoad)).toHaveBeenCalledTimes(1);
    });

    it.each(['F5', 'F9'])(
      'prevents default on %s in Clean Art mode so the page never reloads, and only exits Clean Art',
      key => {
        const actions = createMockActions();
        const state = createMockState({
          mode: 'GAMEPLAY',
          activeModal: 'none',
          isCleanArtMode: true,
        });
        render(
          <PlayerUIProvider state={state} actions={actions}>
            <GameplayOverlay />
          </PlayerUIProvider>,
        );

        const ev = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
        window.dispatchEvent(ev);

        expect(ev.defaultPrevented).toBe(true);
        expect(vi.mocked(actions.toggleCleanArt)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(actions.quickSave)).not.toHaveBeenCalled();
        expect(vi.mocked(actions.quickLoad)).not.toHaveBeenCalled();
      },
    );

    it('prevents default on F5/F9 but does NOT call quickSave/quickLoad when activeModal is "settings"', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'settings' });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const evF5 = new KeyboardEvent('keydown', { key: 'F5', cancelable: true, bubbles: true });
      window.dispatchEvent(evF5);
      expect(evF5.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickSave)).not.toHaveBeenCalled();

      const evF9 = new KeyboardEvent('keydown', { key: 'F9', cancelable: true, bubbles: true });
      window.dispatchEvent(evF9);
      expect(evF9.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickLoad)).not.toHaveBeenCalled();
    });

    it('prevents default on F5/F9 but does NOT call quickSave/quickLoad when activeModal is "save"', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'save' });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const evF5 = new KeyboardEvent('keydown', { key: 'F5', cancelable: true, bubbles: true });
      window.dispatchEvent(evF5);
      expect(evF5.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickSave)).not.toHaveBeenCalled();

      const evF9 = new KeyboardEvent('keydown', { key: 'F9', cancelable: true, bubbles: true });
      window.dispatchEvent(evF9);
      expect(evF9.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickLoad)).not.toHaveBeenCalled();
    });

    it('prevents default on F5/F9 but does NOT call quickSave/quickLoad when pendingConfirm is not null', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
      });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const evF5 = new KeyboardEvent('keydown', { key: 'F5', cancelable: true, bubbles: true });
      window.dispatchEvent(evF5);
      expect(evF5.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickSave)).not.toHaveBeenCalled();

      const evF9 = new KeyboardEvent('keydown', { key: 'F9', cancelable: true, bubbles: true });
      window.dispatchEvent(evF9);
      expect(evF9.defaultPrevented).toBe(true);
      expect(vi.mocked(actions.quickLoad)).not.toHaveBeenCalled();
    });

    it('preserves existing hotkeys such as "a" for toggleAuto (regression guard)', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'none' });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const ev = new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true });
      window.dispatchEvent(ev);
      expect(vi.mocked(actions.toggleAuto)).toHaveBeenCalledTimes(1);
    });
  });

  describe('Contract 3: Quick Load Confirmation Dialog (#quickload-confirm)', () => {
    it('renders #quickload-confirm alertdialog with warning message when pendingConfirm is "quick_load_overwrite"', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const confirmDialog = q(container, '#quickload-confirm');
      expect(confirmDialog.getAttribute('role')).toBe('alertdialog');

      const msg = q(container, '#quickload-confirm-message');
      expect(msg.textContent?.toLowerCase()).toContain('unsaved progress');
    });

    it('clicking #btn-quickload-confirm calls actions.confirmPending', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const btnConfirm = q<HTMLButtonElement>(container, '#btn-quickload-confirm');
      fireEvent.click(btnConfirm);
      expect(vi.mocked(actions.confirmPending)).toHaveBeenCalledTimes(1);
    });

    it('clicking #btn-quickload-cancel calls actions.cancelPending', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const btnCancel = q<HTMLButtonElement>(container, '#btn-quickload-cancel');
      fireEvent.click(btnCancel);
      expect(vi.mocked(actions.cancelPending)).toHaveBeenCalledTimes(1);
    });

    it('Escape keydown while dialog is open calls cancelPending once and does NOT open settings modal', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
      });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
      window.dispatchEvent(ev);

      expect(vi.mocked(actions.cancelPending)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(actions.openModal)).not.toHaveBeenCalled();
    });

    it('does not render #quickload-confirm when pendingConfirm is null', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: null,
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('#quickload-confirm')).toBeNull();
    });

    it('suppresses dialogue advance hotkeys (Space, Enter, ArrowRight) while confirmation dialog is open', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
        dialogue: {
          isVisible: true,
          rawText: 'Dialogue line',
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

      for (const key of [' ', 'Enter', 'ArrowRight']) {
        const ev = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
        window.dispatchEvent(ev);
      }

      expect(vi.mocked(actions.advance)).not.toHaveBeenCalled();
      expect(vi.mocked(actions.completeDialogue)).not.toHaveBeenCalled();
    });

    it('clicking inside the confirmation dialog does not propagate to #bottom-click-zone (does not advance dialogue)', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'GAMEPLAY',
        activeModal: 'none',
        pendingConfirm: 'quick_load_overwrite',
        dialogue: {
          isVisible: true,
          rawText: 'Dialogue line',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );

      const confirmDialog = q(container, '#quickload-confirm');
      fireEvent.click(confirmDialog);

      expect(vi.mocked(actions.advance)).not.toHaveBeenCalled();
      expect(vi.mocked(actions.completeDialogue)).not.toHaveBeenCalled();
    });
  });

  describe('Contract 4: Settings Footer (#btn-settings-load)', () => {
    it('renders #btn-settings-load with text "Load Game" in .settings-footer when mode is "GAMEPLAY"', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY' });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      const footer = q(container, '.settings-footer');
      const loadBtn = q<HTMLButtonElement>(footer, '#btn-settings-load');
      expect(loadBtn.textContent?.trim()).toBe('Load Game');
    });

    it('clicking #btn-settings-load in GAMEPLAY mode calls actions.openModal with "load"', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY' });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      const loadBtn = q<HTMLButtonElement>(container, '#btn-settings-load');
      fireEvent.click(loadBtn);
      expect(vi.mocked(actions.openModal)).toHaveBeenCalledWith('load');
    });

    it('does not render #btn-settings-load when mode is "TITLE"', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'TITLE' });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      expect(container.querySelector('#btn-settings-load')).toBeNull();
    });
  });

  describe('Contract 5: Clean Monochrome Iconography and Source Hygiene', () => {
    it('contains no emoji characters in ControlBar, GameplayOverlay with confirm dialog, or GameSettingsModal', () => {
      const actions = createMockActions();
      const stateGameplay = createMockState({
        mode: 'GAMEPLAY',
        pendingConfirm: 'quick_load_overwrite',
      });

      const { container: controlBarContainer } = render(
        <PlayerUIProvider state={stateGameplay} actions={actions}>
          <ControlBar />
        </PlayerUIProvider>,
      );
      expect(controlBarContainer.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);

      const { container: gameplayContainer } = render(
        <PlayerUIProvider state={stateGameplay} actions={actions}>
          <GameplayOverlay />
        </PlayerUIProvider>,
      );
      expect(gameplayContainer.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);

      const { container: settingsContainer } = render(
        <PlayerUIProvider state={stateGameplay} actions={actions}>
          <GameSettingsModal />
        </PlayerUIProvider>,
      );
      expect(settingsContainer.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('every button rendered has either non-empty text content or an aria-label / title attribute', () => {
      const actions = createMockActions();
      const stateGameplay = createMockState({
        mode: 'GAMEPLAY',
        pendingConfirm: 'quick_load_overwrite',
      });

      const { container } = render(
        <PlayerUIProvider state={stateGameplay} actions={actions}>
          <ControlBar />
          <GameplayOverlay />
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.length).toBeGreaterThan(0);

      for (const btn of buttons) {
        const text = (btn.textContent ?? '').trim();
        const hasAccessibleLabel = btn.hasAttribute('aria-label') || btn.hasAttribute('title');
        expect(
          text !== '' || hasAccessibleLabel,
          `button ${btn.outerHTML} lacks text and aria-label/title`,
        ).toBe(true);
      }
    });

    it('ControlBar.tsx and GameplayOverlay.tsx source files do not contain inline <svg> elements', () => {
      const controlBarSrc = readFileSync(
        resolve(__dirname, '../src/ui/components/ControlBar.tsx'),
        'utf-8',
      );
      expect(controlBarSrc).not.toContain('<svg');

      const gameplayOverlaySrc = readFileSync(
        resolve(__dirname, '../src/ui/components/GameplayOverlay.tsx'),
        'utf-8',
      );
      expect(gameplayOverlaySrc).not.toContain('<svg');
    });
  });
});
