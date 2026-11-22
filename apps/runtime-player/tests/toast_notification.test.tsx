import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { JSX } from 'preact';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions, ToastTone } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { PlayerApp } from '../src/ui/components/PlayerApp';
import * as Icons from '../src/ui/components/common/Icons';
import { ToastNotification } from '../src/ui/components/ToastNotification';

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
    continueGame: vi.fn(),
    deleteSlot: vi.fn(),
    confirmPending: vi.fn(),
    cancelPending: vi.fn(),
    unlockAudio: vi.fn(),
    ...overrides,
  };
}

function q<T extends Element = HTMLElement>(container: Element, selector: string): T {
  const el = container.querySelector<T>(selector);
  expect(el, `expected ${selector} to be rendered`).not.toBeNull();
  return el!;
}

async function renderToast(
  stateOverrides: Partial<PlayerViewState> = {},
  actions: PlayerUIActions = createMockActions(),
) {
  const state = createMockState(stateOverrides);
  const utils = render(
    <PlayerUIProvider state={state} actions={actions}>
      <ToastNotification />
    </PlayerUIProvider>,
  );
  return { ...utils, actions, state, utils, ToastNotification };
}

afterEach(() => {
  cleanup();
});

describe('ToastNotification component (Phase T4 RED)', () => {
  describe('Scenario 1: activeToast === null', () => {
    it('does not render #toast-notification when activeToast is null', async () => {
      const { container } = await renderToast({ activeToast: null });
      expect(container.querySelector('#toast-notification')).toBeNull();
    });
  });

  describe('Scenario 2: Toast notification structure and accessibility per tone', () => {
    const TONES: ToastTone[] = ['success', 'info', 'error'];

    it.each(TONES)(
      'tone "%s" renders #toast-notification with message, class toast-%s, role="status", and aria-live="polite"',
      async tone => {
        const message = `Notification test message for ${tone}`;
        const { container } = await renderToast({
          activeToast: { message, id: 100, tone },
        });
        const toast = q(container, '#toast-notification');
        expect(toast.textContent).toContain(message);
        expect(toast.classList.contains(`toast-${tone}`)).toBe(true);
        expect(toast.getAttribute('role')).toBe('status');
        expect(toast.getAttribute('aria-live')).toBe('polite');
      },
    );
  });

  describe('Scenario 3: Icon per tone', () => {
    // Contract for Phase GREEN:
    // ToastNotification must render an icon wrapper element with `data-tone-icon="<tone>"`
    // wrapping the corresponding icon component (CheckCircleIcon, AlertCircleIcon, or InfoIcon):
    // - tone 'success' -> [data-tone-icon="success"] containing CheckCircleIcon
    // - tone 'info'    -> [data-tone-icon="info"] containing InfoIcon
    // - tone 'error'   -> [data-tone-icon="error"] containing AlertCircleIcon
    const TONE_ICON_CASES = [
      ['success', 'success'],
      ['info', 'info'],
      ['error', 'error'],
    ] as const;

    it.each(TONE_ICON_CASES)(
      'tone "%s" renders wrapper with data-tone-icon="%s" containing <svg>',
      async (tone, expectedDataTone) => {
        const { container } = await renderToast({
          activeToast: { message: `${tone} notification message`, id: 200, tone },
        });
        const toast = q(container, '#toast-notification');
        const iconWrapper = toast.querySelector(`[data-tone-icon="${expectedDataTone}"]`);
        expect(
          iconWrapper,
          `expected [data-tone-icon="${expectedDataTone}"] inside #toast-notification`,
        ).not.toBeNull();
        const svg = iconWrapper!.querySelector('svg');
        expect(svg, `expected <svg> inside [data-tone-icon="${expectedDataTone}"]`).not.toBeNull();
      },
    );
  });

  describe('Scenario 4: Local dismissal by id on click and rerender behavior', () => {
    it('clicking toast hides it, stays hidden on same id rerender, and reappears on new id', async () => {
      const { container, actions, utils, ToastNotification } = await renderToast({
        activeToast: { message: 'Initial toast message', id: 10, tone: 'info' },
      });

      expect(container.querySelector('#toast-notification')).not.toBeNull();

      fireEvent.click(q(container, '#toast-notification'));
      expect(container.querySelector('#toast-notification')).toBeNull();

      utils.rerender(
        <PlayerUIProvider
          state={createMockState({
            activeToast: { message: 'Initial toast message again', id: 10, tone: 'info' },
          })}
          actions={actions}
        >
          <ToastNotification />
        </PlayerUIProvider>,
      );
      expect(container.querySelector('#toast-notification')).toBeNull();

      utils.rerender(
        <PlayerUIProvider
          state={createMockState({
            activeToast: { message: 'Brand new toast message', id: 11, tone: 'success' },
          })}
          actions={actions}
        >
          <ToastNotification />
        </PlayerUIProvider>,
      );
      const newToast = container.querySelector('#toast-notification');
      expect(newToast).not.toBeNull();
      expect(newToast!.textContent).toContain('Brand new toast message');
    });
  });

  describe('Scenario 5: Keyboard accessibility & dismissal via Enter / Space', () => {
    it('has tabIndex={0} and title or aria-label hinting "Dismiss"', async () => {
      const { container } = await renderToast({
        activeToast: { message: 'Accessible toast', id: 20, tone: 'info' },
      });
      const toast = q(container, '#toast-notification');
      expect(toast.getAttribute('tabindex')).toBe('0');
      const label = toast.getAttribute('aria-label') || toast.getAttribute('title') || '';
      expect(label).toMatch(/dismiss/i);
    });

    it('pressing Enter closes the focused toast', async () => {
      const { container } = await renderToast({
        activeToast: { message: 'Press Enter to dismiss', id: 21, tone: 'info' },
      });
      const toast = q(container, '#toast-notification');
      fireEvent.keyDown(toast, { key: 'Enter', code: 'Enter' });
      expect(container.querySelector('#toast-notification')).toBeNull();
    });

    it('pressing Space closes the focused toast', async () => {
      const { container } = await renderToast({
        activeToast: { message: 'Press Space to dismiss', id: 22, tone: 'info' },
      });
      const toast = q(container, '#toast-notification');
      fireEvent.keyDown(toast, { key: ' ', code: 'Space' });
      expect(container.querySelector('#toast-notification')).toBeNull();
    });
  });

  describe('Scenario 6: Icon and markup hygiene (no inline svg, no emoji)', () => {
    it('source file contains no inline <svg tags (all icons imported from Icons.tsx)', () => {
      const filePath = resolve(__dirname, '../src/ui/components/ToastNotification.tsx');
      const source = readFileSync(filePath, 'utf8');
      expect(source).not.toContain('<svg');
    });

    it('rendered toast contains no emoji characters', async () => {
      const { container } = await renderToast({
        activeToast: { message: 'Clean toast without emoji', id: 30, tone: 'info' },
      });
      const toast = q(container, '#toast-notification');
      expect(toast.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  describe('Scenario 7: PlayerApp integration', () => {
    it('renders #toast-notification when activeToast is non-null in TITLE mode', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'TITLE',
        activeToast: { message: 'Integrated toast', id: 40, tone: 'success' },
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <PlayerApp />
        </PlayerUIProvider>,
      );
      expect(container.querySelector('#toast-notification')).not.toBeNull();
    });

    it('does not render #toast-notification when activeToast is null in TITLE mode', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'TITLE',
        activeToast: null,
      });
      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <PlayerApp />
        </PlayerUIProvider>,
      );
      expect(container.querySelector('#toast-notification')).toBeNull();
    });
  });

  describe('Scenario 8: New monochrome icons in Icons.tsx', () => {
    const NEW_ICONS = [
      'CheckCircleIcon',
      'AlertCircleIcon',
      'InfoIcon',
      'TrashIcon',
      'PlayIcon',
    ] as const;

    it.each(NEW_ICONS)(
      '%s is exported as a function and renders an svg with stroke="currentColor" and width matching size',
      iconName => {
        const Icon = (Icons as Record<string, unknown>)[iconName];
        expect(typeof Icon, `${iconName} must be exported from Icons.tsx`).toBe('function');
        const Comp = Icon as (props: { size?: number }) => JSX.Element;
        const { container } = render(<Comp size={16} />);
        const svg = container.querySelector('svg');
        expect(svg, `expected <svg> element for ${iconName}`).not.toBeNull();
        expect(svg!.getAttribute('stroke')).toBe('currentColor');
        expect(svg!.getAttribute('width')).toBe('16');
      },
    );
  });
});
