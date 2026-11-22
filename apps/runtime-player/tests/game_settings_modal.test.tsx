/**
 * TASK-player-settings-modal, phase S3 (RED): GameSettingsModal split-view UI.
 *
 * Traces to spec sections 2.2.1 (goals 1-3), 2.4 (risks 3-4), 4.1 (DOM ids),
 * 4.2 (icons), 5 (SET-01..05, SET-08, SET-09 UI, SET-10, SET-11, SET-13) and
 * 7 items 6-7 (shortcuts legend drift, no double Escape handling).
 *
 * Phase S4 (RED) appends the 'S4: DialogueBox font size & opacity' block at the
 * end of this file: spec 4.3 part 1 (.dialogue-box / .dialogue-text.font-* CSS),
 * 4.3 part 2 (DialogueBox binding) and scenarios SET-06 / SET-07.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JSX } from 'preact';
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { GameSettingsModal } from '../src/ui/components/modals/GameSettingsModal';
import { GameplayOverlay } from '../src/ui/components/GameplayOverlay';
import * as Icons from '../src/ui/components/common/Icons';
import { DialogueBox } from '../src/ui/components/DialogueBox';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters } from '../src/core/contracts';
import type { Instruction } from '@vn-engine/shared-types';

const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog.';
const CONFIRM_TEXT =
  'Are you sure you want to return to the Title Screen? Any unsaved progress will be lost.';

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
    activeModal: 'settings',
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
    continueGame: vi.fn(),
    deleteSlot: vi.fn(),
    confirmPending: vi.fn(),
    cancelPending: vi.fn(),
    unlockAudio: vi.fn(),
    ...overrides,
  };
}

function renderModal(
  stateOverrides: Partial<PlayerViewState> = {},
  actions: PlayerUIActions = createMockActions(),
) {
  const state = createMockState(stateOverrides);
  const utils = render(
    <PlayerUIProvider state={state} actions={actions}>
      <GameSettingsModal />
    </PlayerUIProvider>,
  );
  return { ...utils, actions, state };
}

function q<T extends Element = HTMLElement>(container: Element, selector: string): T {
  const el = container.querySelector<T>(selector);
  expect(el, `expected ${selector} to be rendered`).not.toBeNull();
  return el!;
}

function openTab(container: Element, tab: 'audio' | 'text' | 'display' | 'shortcuts') {
  fireEvent.click(q(container, `#tab-btn-${tab}`));
}

/** Text of the typewriter preview box with any cursor element stripped. */
function previewText(container: Element): string {
  const box = q(container, '#preview-typewriter-box').cloneNode(true) as HTMLElement;
  box.querySelectorAll('.typewriter-cursor').forEach(c => c.remove());
  return box.textContent ?? '';
}

const TABS = ['audio', 'text', 'display', 'shortcuts'] as const;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GameSettingsModal (S3 split-view)', () => {
  describe('SET-01: split-view sidebar tabs', () => {
    it('renders 4 tab buttons with Audio active by default and only the audio pane shown', () => {
      const { container } = renderModal();

      for (const tab of TABS) {
        q(container, `#tab-btn-${tab}`);
      }
      expect(q(container, '#tab-btn-audio').classList.contains('active')).toBe(true);
      expect(q(container, '#tab-btn-text').classList.contains('active')).toBe(false);
      expect(q(container, '#tab-btn-display').classList.contains('active')).toBe(false);
      expect(q(container, '#tab-btn-shortcuts').classList.contains('active')).toBe(false);

      expect(container.querySelector('#pane-audio')).not.toBeNull();
      expect(container.querySelector('#pane-text')).toBeNull();
      expect(container.querySelector('#pane-display')).toBeNull();
      expect(container.querySelector('#pane-shortcuts')).toBeNull();
    });

    it.each(TABS)('clicking #tab-btn-%s activates it and shows only its pane', tab => {
      const { container } = renderModal();
      openTab(container, tab);

      for (const other of TABS) {
        const btn = q(container, `#tab-btn-${other}`);
        const pane = container.querySelector(`#pane-${other}`);
        if (other === tab) {
          expect(btn.classList.contains('active')).toBe(true);
          expect(pane).not.toBeNull();
        } else {
          expect(btn.classList.contains('active')).toBe(false);
          expect(pane).toBeNull();
        }
      }
    });
  });

  describe('SET-02: audio volume sliders', () => {
    it.each([
      ['#slider-volume-master', 'master', '0.6'],
      ['#slider-volume-music', 'music', '0.75'],
      ['#slider-volume-sound', 'sound', '0.5'],
      ['#slider-volume-voice', 'voice', '0.9'],
    ] as const)('%s dispatches setAudioVolume(%s, float)', (selector, channel, value) => {
      const { container, actions } = renderModal();
      fireEvent.change(q(container, `#pane-audio ${selector}`), { target: { value } });
      expect(actions.setAudioVolume).toHaveBeenCalledWith(channel, parseFloat(value));
    });

    it('renders percentage labels from state for every channel', () => {
      const { container } = renderModal({
        audio: {
          masterVolume: 0.8,
          channelVolumes: { music: 0.45, sound: 0.3, voice: 1.0, ambience: 1.0 },
          isMuted: false,
          currentTracks: {},
        },
      });
      const pane = q(container, '#pane-audio');
      const text = pane.textContent ?? '';
      expect(text).toContain('80%');
      expect(text).toContain('45%');
      expect(text).toContain('30%');
      expect(text).toContain('100%');
    });
  });

  describe('SET-03: mute toggle', () => {
    it('#btn-toggle-mute calls toggleMute and shows "Unmuted" when not muted', () => {
      const { container, actions } = renderModal();
      const btn = q(container, '#pane-audio #btn-toggle-mute');
      expect(btn.textContent).toContain('Unmuted');
      fireEvent.click(btn);
      expect(actions.toggleMute).toHaveBeenCalledTimes(1);
    });

    it('shows "Muted" label when audio.isMuted is true', () => {
      const { container } = renderModal({
        audio: {
          masterVolume: 1.0,
          channelVolumes: { music: 0.8, sound: 0.8, voice: 1.0, ambience: 1.0 },
          isMuted: true,
          currentTracks: {},
        },
      });
      const btn = q(container, '#btn-toggle-mute');
      expect(btn.textContent).toContain('Muted');
      expect(btn.textContent).not.toContain('Unmuted');
    });
  });

  describe('SET-04: text speed and live typewriter preview', () => {
    it('#slider-text-speed dispatches setTextSpeed(int) and renders "N chars/s"', () => {
      const { container, actions } = renderModal({
        settings: { textSpeed: 55, autoDelayMs: 1500, fontSize: 'medium', boxOpacity: 0.85 },
      });
      openTab(container, 'text');
      expect(q(container, '#pane-text').textContent).toContain('55 chars/s');

      fireEvent.change(q(container, '#pane-text #slider-text-speed'), {
        target: { value: '30' },
      });
      expect(actions.setTextSpeed).toHaveBeenCalledWith(30);
      const arg = vi.mocked(actions.setTextSpeed).mock.calls[0]![0];
      expect(Number.isInteger(arg)).toBe(true);
    });

    it('animates the sample text at 1000/speed ms per char and loops after a 1500ms dwell', () => {
      vi.useFakeTimers();
      const speed = 20; // 50ms per char
      const interval = 1000 / speed;
      const { container } = renderModal({
        settings: { textSpeed: speed, autoDelayMs: 1500, fontSize: 'medium', boxOpacity: 0.85 },
      });
      openTab(container, 'text');

      expect(previewText(container)).toBe('');

      act(() => {
        vi.advanceTimersByTime(interval);
      });
      expect(previewText(container)).toBe(SAMPLE_TEXT.slice(0, 1));

      act(() => {
        vi.advanceTimersByTime(4 * interval);
      });
      expect(previewText(container)).toBe(SAMPLE_TEXT.slice(0, 5));

      act(() => {
        vi.advanceTimersByTime((SAMPLE_TEXT.length - 5) * interval);
      });
      expect(previewText(container)).toBe(SAMPLE_TEXT);

      // One more tick reaches the end-of-text step, then the 1.5s dwell elapses.
      act(() => {
        vi.advanceTimersByTime(interval + 1500);
      });
      expect(previewText(container)).toBe('');

      act(() => {
        vi.advanceTimersByTime(interval);
      });
      expect(previewText(container)).toBe(SAMPLE_TEXT.slice(0, 1));
    });

    it('clears preview timers when switching away from the text tab', () => {
      vi.useFakeTimers();
      const { container } = renderModal();
      openTab(container, 'text');
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      openTab(container, 'audio');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears preview timers on unmount', () => {
      vi.useFakeTimers();
      const { container, unmount } = renderModal();
      openTab(container, 'text');
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('SET-05: auto forward delay', () => {
    it('#slider-auto-delay dispatches setAutoDelay(int) and formats seconds', () => {
      const { container, actions } = renderModal({
        settings: { textSpeed: 40, autoDelayMs: 2000, fontSize: 'medium', boxOpacity: 0.85 },
      });
      openTab(container, 'text');
      expect(q(container, '#pane-text').textContent).toContain('2.0s');

      fireEvent.change(q(container, '#pane-text #slider-auto-delay'), {
        target: { value: '3500' },
      });
      expect(actions.setAutoDelay).toHaveBeenCalledWith(3500);
    });
  });

  describe('Display tab: font size and box opacity dispatch (S4 applies them)', () => {
    it.each([
      ['#btn-font-small', 'small'],
      ['#btn-font-medium', 'medium'],
      ['#btn-font-large', 'large'],
    ] as const)('%s dispatches setFontSize(%s)', (selector, size) => {
      const { container, actions } = renderModal();
      openTab(container, 'display');
      fireEvent.click(q(container, `#pane-display ${selector}`));
      expect(actions.setFontSize).toHaveBeenCalledWith(size);
    });

    it('marks only the current font size button as .active', () => {
      const { container } = renderModal({
        settings: { textSpeed: 40, autoDelayMs: 1500, fontSize: 'large', boxOpacity: 0.85 },
      });
      openTab(container, 'display');
      expect(q(container, '#btn-font-large').classList.contains('active')).toBe(true);
      expect(q(container, '#btn-font-medium').classList.contains('active')).toBe(false);
      expect(q(container, '#btn-font-small').classList.contains('active')).toBe(false);
    });

    it('#slider-box-opacity dispatches setBoxOpacity(float) and renders % label', () => {
      const { container, actions } = renderModal({
        settings: { textSpeed: 40, autoDelayMs: 1500, fontSize: 'medium', boxOpacity: 0.7 },
      });
      openTab(container, 'display');
      expect(q(container, '#pane-display').textContent).toContain('70%');

      fireEvent.change(q(container, '#pane-display #slider-box-opacity'), {
        target: { value: '0.95' },
      });
      expect(actions.setBoxOpacity).toHaveBeenCalledWith(0.95);
    });
  });

  describe('SET-08: fullscreen toggle', () => {
    const docEl = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };
    let requestFullscreen: ReturnType<typeof vi.fn>;
    let exitFullscreen: ReturnType<typeof vi.fn>;

    function stubFullscreen(enabled: boolean, element: Element | null) {
      Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        get: () => enabled,
      });
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => element,
      });
    }

    beforeEach(() => {
      requestFullscreen = vi.fn().mockResolvedValue(undefined);
      exitFullscreen = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(docEl, 'requestFullscreen', {
        configurable: true,
        writable: true,
        value: requestFullscreen,
      });
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        writable: true,
        value: exitFullscreen,
      });
    });

    afterEach(() => {
      delete (docEl as { requestFullscreen?: unknown }).requestFullscreen;
      delete (document as { exitFullscreen?: unknown }).exitFullscreen;
      delete (document as { fullscreenEnabled?: unknown }).fullscreenEnabled;
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
    });

    it('requests fullscreen on documentElement when enabled and nothing is fullscreen', () => {
      stubFullscreen(true, null);
      const { container } = renderModal();
      openTab(container, 'display');
      fireEvent.click(q(container, '#pane-display #btn-toggle-fullscreen'));
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it('exits fullscreen when an element is already fullscreen', () => {
      stubFullscreen(true, document.body);
      const { container } = renderModal();
      openTab(container, 'display');
      fireEvent.click(q(container, '#btn-toggle-fullscreen'));
      expect(exitFullscreen).toHaveBeenCalledTimes(1);
      expect(requestFullscreen).not.toHaveBeenCalled();
    });

    it('does nothing and does not throw when fullscreenEnabled is false', () => {
      stubFullscreen(false, null);
      const { container } = renderModal();
      openTab(container, 'display');
      expect(() => fireEvent.click(q(container, '#btn-toggle-fullscreen'))).not.toThrow();
      expect(requestFullscreen).not.toHaveBeenCalled();
      expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it('swallows a rejected requestFullscreen promise (no unhandled rejection)', async () => {
      stubFullscreen(true, null);
      requestFullscreen.mockImplementation(() => Promise.reject(new Error('denied')));
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const { container } = renderModal();
        openTab(container, 'display');
        fireEvent.click(q(container, '#btn-toggle-fullscreen'));
        expect(requestFullscreen).toHaveBeenCalledTimes(1);
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });

  describe('Shortcuts tab legend (spec 7.6: only keys that exist in GameplayOverlay and ChoiceOverlay)', () => {
    function kbdTexts(container: Element): string[] {
      return Array.from(q(container, '#pane-shortcuts').querySelectorAll('kbd')).map(k =>
        (k.textContent ?? '').trim(),
      );
    }

    it('lists the existing shortcut keys in <kbd> elements', () => {
      const { container } = renderModal();
      openTab(container, 'shortcuts');
      const keys = kbdTexts(container);
      for (const key of [
        'Space',
        'Enter',
        '→',
        '←',
        'PageUp',
        'A',
        'S',
        'Tab',
        'L',
        'H',
        'Right Click',
        'Esc',
      ]) {
        expect(keys, `missing <kbd>${key}</kbd>`).toContain(key);
      }
    });

    it('lists the choice keys handled by ChoiceOverlay (1–9 and ↑/↓)', () => {
      const { container } = renderModal();
      openTab(container, 'shortcuts');
      const keys = kbdTexts(container);
      for (const key of ['1', '9', '↑', '↓']) {
        expect(keys, `missing <kbd>${key}</kbd>`).toContain(key);
      }
    });

    it('does not mention the Clean Art button or other non-existent controls', () => {
      const { container } = renderModal();
      openTab(container, 'shortcuts');
      const pane = q(container, '#pane-shortcuts');
      expect(pane.textContent ?? '').not.toMatch(/clean art button/i);
      expect(pane.innerHTML).not.toContain('btn-clean-art');
      expect(pane.innerHTML).not.toContain('btn-restore-controls');
    });
  });

  describe('SET-09 (UI part): restore defaults', () => {
    it('#btn-restore-defaults calls restoreDefaultSettings', () => {
      const { container, actions } = renderModal();
      fireEvent.click(q(container, '#btn-restore-defaults'));
      expect(actions.restoreDefaultSettings).toHaveBeenCalledTimes(1);
      expect(actions.closeModal).not.toHaveBeenCalled();
    });
  });

  describe('SET-10 / SET-11: return to title', () => {
    it('SET-10: in GAMEPLAY, Return to Title opens the confirm overlay; Cancel dismisses it', () => {
      const { container, actions } = renderModal({ mode: 'GAMEPLAY' });
      expect(container.textContent).not.toContain(CONFIRM_TEXT);

      fireEvent.click(q(container, '#btn-return-title'));
      expect(container.textContent).toContain(CONFIRM_TEXT);
      expect(actions.returnToTitle).not.toHaveBeenCalled();

      fireEvent.click(q(container, '#btn-cancel-return'));
      expect(container.textContent).not.toContain(CONFIRM_TEXT);
      expect(container.querySelector('#btn-confirm-return')).toBeNull();
      expect(actions.returnToTitle).not.toHaveBeenCalled();
      expect(actions.closeModal).not.toHaveBeenCalled();
    });

    it('SET-10: Confirm calls closeModal and returnToTitle', () => {
      const { container, actions } = renderModal({ mode: 'GAMEPLAY' });
      fireEvent.click(q(container, '#btn-return-title'));
      fireEvent.click(q(container, '#btn-confirm-return'));
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
      expect(actions.returnToTitle).toHaveBeenCalledTimes(1);
    });

    it('SET-11: in TITLE mode, #btn-return-title is not rendered', () => {
      const { container } = renderModal({ mode: 'TITLE' });
      q(container, '#modal-game-settings');
      expect(container.querySelector('#btn-return-title')).toBeNull();
    });
  });

  describe('SET-13: modal dismissal', () => {
    it('closes via #btn-close-settings', () => {
      const { container, actions } = renderModal();
      fireEvent.click(q(container, '#btn-close-settings'));
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });

    it('closes via #btn-done-settings', () => {
      const { container, actions } = renderModal();
      fireEvent.click(q(container, '#btn-done-settings'));
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });

    it('closes on backdrop click but not on clicks inside the window', () => {
      const { container, actions } = renderModal();
      fireEvent.click(q(container, '.modal-settings-window'));
      fireEvent.click(q(container, '#tab-btn-display'));
      expect(actions.closeModal).not.toHaveBeenCalled();

      fireEvent.click(q(container, '#modal-game-settings'));
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape keydown when rendered alone (TitleScreen, no GameplayOverlay)', () => {
      const { actions } = renderModal({ mode: 'TITLE' });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });

    it('Escape while the return-confirm overlay is open only dismisses the overlay', () => {
      const { container, actions } = renderModal({ mode: 'GAMEPLAY' });
      fireEvent.click(q(container, '#btn-return-title'));
      expect(container.textContent).toContain(CONFIRM_TEXT);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(container.textContent).not.toContain(CONFIRM_TEXT);
      expect(actions.closeModal).not.toHaveBeenCalled();
      expect(actions.returnToTitle).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
    });

    it('spec 7.7: with GameplayOverlay also mounted, one Escape closes exactly once', () => {
      const actions = createMockActions();
      const state = createMockState({ mode: 'GAMEPLAY', activeModal: 'settings' });
      render(
        <PlayerUIProvider state={state} actions={actions}>
          <GameplayOverlay />
          <GameSettingsModal />
        </PlayerUIProvider>,
      );

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(actions.closeModal).toHaveBeenCalledTimes(1);
      expect(actions.openModal).not.toHaveBeenCalled();
    });
  });

  describe('Icons and markup hygiene (spec 4.2, code standards)', () => {
    it.each(['VolumeMuteIcon', 'KeyboardIcon'] as const)(
      '%s is exported and renders a monochrome stroke svg',
      name => {
        const Icon = (Icons as Record<string, unknown>)[name];
        expect(typeof Icon, `${name} must be exported from Icons.tsx`).toBe('function');
        const Comp = Icon as (props: { size?: number }) => JSX.Element;
        const { container } = render(<Comp size={16} />);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg!.getAttribute('stroke')).toBe('currentColor');
        expect(svg!.getAttribute('width')).toBe('16');
      },
    );

    it('contains no emoji characters in any tab', () => {
      const { container } = renderModal({ mode: 'GAMEPLAY' });
      for (const tab of TABS) {
        openTab(container, tab);
        expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
      }
      fireEvent.click(q(container, '#btn-return-title'));
      expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it('every icon-only button has an aria-label or title in every tab', () => {
      const { container } = renderModal({ mode: 'GAMEPLAY' });
      for (const tab of TABS) {
        openTab(container, tab);
        const buttons = Array.from(container.querySelectorAll('button'));
        for (const btn of buttons) {
          if ((btn.textContent ?? '').trim() === '') {
            const labelled = btn.hasAttribute('aria-label') || btn.hasAttribute('title');
            expect(labelled, `icon-only button ${btn.outerHTML} lacks aria-label/title`).toBe(true);
          }
        }
      }
    });
  });
});

// ============================================================================
// Phase S4: DialogueBox applies settings.fontSize / settings.boxOpacity.
// Spec 4.3 part 1 (CSS) and part 2 (DialogueBox binding); SET-06, SET-07.
// ============================================================================
describe('S4: DialogueBox font size & opacity', () => {
  const FONT_SIZES = ['small', 'medium', 'large'] as const;
  type FontSize = (typeof FONT_SIZES)[number];

  function settingsWith(fontSize: FontSize, boxOpacity: number): PlayerViewState['settings'] {
    return { textSpeed: 40, autoDelayMs: 1500, fontSize, boxOpacity };
  }

  function dialogueTree(state: PlayerViewState, actions: PlayerUIActions): JSX.Element {
    return (
      <PlayerUIProvider state={state} actions={actions}>
        <DialogueBox />
      </PlayerUIProvider>
    );
  }

  function renderDialogue(settings: PlayerViewState['settings']) {
    const actions = createMockActions();
    const state = createMockState({ activeModal: 'none', settings });
    const utils = render(dialogueTree(state, actions));
    return { ...utils, actions, state };
  }

  function fontClasses(el: Element): string[] {
    return Array.from(el.classList).filter(c => c.startsWith('font-'));
  }

  function opacityVar(container: Element): string {
    return q(container, '#dialogue-box').style.getPropertyValue('--vn-dialogue-opacity').trim();
  }

  describe('SET-06: #dialogue-text font-size class', () => {
    it.each(FONT_SIZES)('settings.fontSize "%s" adds the matching font-* class', size => {
      const { container } = renderDialogue(settingsWith(size, 0.85));
      const text = q(container, '#dialogue-text');
      expect(text.classList.contains('dialogue-text')).toBe(true);
      expect(text.classList.contains(`font-${size}`)).toBe(true);
      expect(fontClasses(text)).toEqual([`font-${size}`]);
    });

    it('re-rendering with a new fontSize swaps the class (exactly one font-* class)', () => {
      const { container, rerender, actions } = renderDialogue(settingsWith('small', 0.85));
      expect(fontClasses(q(container, '#dialogue-text'))).toEqual(['font-small']);

      rerender(
        dialogueTree(
          createMockState({ activeModal: 'none', settings: settingsWith('large', 0.85) }),
          actions,
        ),
      );
      expect(fontClasses(q(container, '#dialogue-text'))).toEqual(['font-large']);
    });
  });

  describe('SET-07: #dialogue-box --vn-dialogue-opacity custom property', () => {
    it.each([
      [0.6, '0.6'],
      [0.85, '0.85'],
      [1, '1'],
    ] as const)('boxOpacity %s sets --vn-dialogue-opacity to "%s"', (opacity, expected) => {
      const { container } = renderDialogue(settingsWith('medium', opacity));
      expect(opacityVar(container)).toBe(expected);
    });

    it('re-rendering with a new boxOpacity updates the custom property', () => {
      const { container, rerender, actions } = renderDialogue(settingsWith('medium', 0.6));
      expect(opacityVar(container)).toBe('0.6');

      rerender(
        dialogueTree(
          createMockState({ activeModal: 'none', settings: settingsWith('medium', 0.95) }),
          actions,
        ),
      );
      expect(opacityVar(container)).toBe('0.95');
    });
  });

  describe('Integration: GameSettingsModal + DialogueBox under a real VNRuntimeKernel', () => {
    const PROGRAM: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: null, speaker: null, text: 'Hello from the kernel.' },
    ];

    function newKernel(): VNRuntimeKernel {
      const adapters: KernelAdapters = {
        renderer: {
          applySideEffect: vi.fn().mockResolvedValue(undefined),
          syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
        },
        audio: {
          applySideEffect: vi.fn(),
          syncStateCatchUp: vi.fn(),
          stopVoice: vi.fn(),
          stopAll: vi.fn(),
          setVolume: vi.fn(),
          setMute: vi.fn(),
          playVoice: vi.fn(),
        },
      };
      return new VNRuntimeKernel(PROGRAM, adapters);
    }

    async function renderWithKernel() {
      const kernel = newKernel();
      const utils = render(
        <PlayerUIProvider kernel={kernel}>
          <DialogueBox />
          <GameSettingsModal />
        </PlayerUIProvider>,
      );
      await act(async () => {
        await kernel.startNewGame();
      });
      expect(kernel.getState().mode).toBe('GAMEPLAY');
      expect(kernel.getState().dialogue.rawText).toContain('Hello from the kernel.');
      return { ...utils, kernel };
    }

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('clicking #btn-font-large on the Display tab gives #dialogue-text font-large', async () => {
      const { container, kernel } = await renderWithKernel();
      expect(fontClasses(q(container, '#dialogue-text'))).toEqual(['font-medium']);

      act(() => {
        openTab(container, 'display');
      });
      act(() => {
        fireEvent.click(q(container, '#pane-display #btn-font-large'));
      });

      expect(kernel.getState().settings.fontSize).toBe('large');
      expect(fontClasses(q(container, '#dialogue-text'))).toEqual(['font-large']);
    });

    it('changing #slider-box-opacity to 0.7 updates --vn-dialogue-opacity to "0.7"', async () => {
      const { container, kernel } = await renderWithKernel();
      expect(opacityVar(container)).toBe('0.85');

      act(() => {
        openTab(container, 'display');
      });
      act(() => {
        fireEvent.change(q(container, '#pane-display #slider-box-opacity'), {
          target: { value: '0.7' },
        });
      });

      expect(kernel.getState().settings.boxOpacity).toBe(0.7);
      expect(opacityVar(container)).toBe('0.7');
    });
  });

  describe('CSS contract in src/wireframe.css (spec 4.3 part 1, text check)', () => {
    const css = readFileSync(resolve(__dirname, '../src/wireframe.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    /** Bodies of every rule whose whole selector is exactly `selector`. */
    function ruleBodies(selector: string): string[] {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
      return Array.from(css.matchAll(re), m => m[1] ?? '');
    }

    it('.dialogue-box background uses var(--vn-dialogue-opacity', () => {
      const bodies = ruleBodies('.dialogue-box');
      expect(bodies.length).toBeGreaterThan(0);
      expect(
        bodies.some(b => /background(?:-color)?\s*:[^;]*var\(\s*--vn-dialogue-opacity/.test(b)),
      ).toBe(true);
    });

    it.each(FONT_SIZES)('defines a .dialogue-text.font-%s rule with a font-size', size => {
      const bodies = ruleBodies(`.dialogue-text.font-${size}`);
      expect(bodies.length).toBeGreaterThan(0);
      expect(bodies.some(b => /font-size\s*:/.test(b))).toBe(true);
    });
  });
});
