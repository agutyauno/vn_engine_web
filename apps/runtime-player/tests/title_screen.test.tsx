import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { TitleScreen } from '../src/ui/components/TitleScreen';

function createMockState(overrides: Partial<PlayerViewState> = {}): PlayerViewState {
  return {
    mode: 'TITLE',
    playbackMode: 'NORMAL',
    isControlsHidden: false,
    isCleanArtMode: false,
    isAwaitingPauseAdvance: false,
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

function renderTitleScreen(
  stateOverrides: Partial<PlayerViewState> = {},
  actions: PlayerUIActions = createMockActions(),
) {
  const state = createMockState(stateOverrides);
  const utils = render(
    <PlayerUIProvider state={state} actions={actions}>
      <TitleScreen />
    </PlayerUIProvider>,
  );
  return { ...utils, actions, state };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TitleScreen component (Phase T5 RED)', () => {
  describe('Requirement 1 & 10: Heading and Logo rendering', () => {
    it('renders fallback title "Visual Novel" in h1.title-screen-heading inside #title-menu-column', () => {
      const { container } = renderTitleScreen({
        titleConfig: { title: 'Visual Novel' },
      });
      const column = container.querySelector('#title-menu-column');
      expect(column).not.toBeNull();
      const heading = column!.querySelector('h1.title-screen-heading');
      expect(heading).not.toBeNull();
      expect(heading!.textContent?.trim()).toBe('Visual Novel');
      expect(heading!.querySelector('#title-logo')).toBeNull();
    });

    it('renders custom title text in h1.title-screen-heading when logoUrl is not provided', () => {
      const { container } = renderTitleScreen({
        titleConfig: { title: 'Starfall Memories' },
      });
      const column = container.querySelector('#title-menu-column');
      expect(column).not.toBeNull();
      const heading = column!.querySelector('h1.title-screen-heading');
      expect(heading).not.toBeNull();
      expect(heading!.textContent?.trim()).toBe('Starfall Memories');
      expect(heading!.querySelector('#title-logo')).toBeNull();
    });

    it('renders h1 containing img#title-logo when logoUrl is provided, without separate title text', () => {
      const { container } = renderTitleScreen({
        titleConfig: {
          title: 'Starfall Memories',
          logoUrl: 'https://cdn.example.com/assets/logo.png',
        },
      });
      const heading = container.querySelector('#title-menu-column h1.title-screen-heading');
      expect(heading).not.toBeNull();
      const logo = heading!.querySelector<HTMLImageElement>('img#title-logo');
      expect(logo).not.toBeNull();
      expect(logo!.getAttribute('src')).toBe('https://cdn.example.com/assets/logo.png');
      expect(logo!.getAttribute('alt')).toBe('Starfall Memories');
      expect(heading!.textContent?.trim()).toBe('');
    });
  });

  describe('Requirement 2: Logo load error handling', () => {
    it('replaces broken img#title-logo with title text when image error event fires', () => {
      const { container } = renderTitleScreen({
        titleConfig: {
          title: 'Starfall Memories',
          logoUrl: 'https://cdn.example.com/assets/corrupted-logo.png',
        },
      });
      const heading = container.querySelector('#title-menu-column h1.title-screen-heading');
      expect(heading).not.toBeNull();
      const logo = heading!.querySelector('img#title-logo');
      expect(logo).not.toBeNull();

      fireEvent.error(logo!);

      expect(heading!.querySelector('img#title-logo')).toBeNull();
      expect(heading!.textContent?.trim()).toBe('Starfall Memories');
    });
  });

  describe('Requirement 3: Background styling', () => {
    it('adds has-background class and background-image style when backgroundUrl is set', () => {
      const bgUrl = 'https://cdn.example.com/assets/title-bg.jpg';
      const { container } = renderTitleScreen({
        titleConfig: {
          title: 'Starfall Memories',
          backgroundUrl: bgUrl,
        },
      });
      const root = container.querySelector<HTMLElement>('#title-screen');
      expect(root).not.toBeNull();
      expect(root!.classList.contains('has-background')).toBe(true);
      const bgStyle = root!.style.backgroundImage || root!.getAttribute('style') || '';
      expect(bgStyle).toContain(bgUrl);
    });

    it('does not have has-background class or background-image inline style when backgroundUrl is absent', () => {
      const { container } = renderTitleScreen({
        titleConfig: {
          title: 'Starfall Memories',
        },
      });
      const root = container.querySelector<HTMLElement>('#title-screen');
      expect(root).not.toBeNull();
      expect(root!.classList.contains('has-background')).toBe(false);
      const bgStyle = root!.style.backgroundImage || '';
      expect(bgStyle).toBe('');
    });
  });

  describe('Requirement 4: Menu button order inside .title-screen-menu', () => {
    it('renders buttons strictly in order: #btn-continue, #btn-new-game, #btn-load-game, #btn-settings', () => {
      const { container } = renderTitleScreen();
      const menu = container.querySelector('.title-screen-menu');
      expect(menu).not.toBeNull();
      const buttonIds = Array.from(menu!.querySelectorAll('button')).map(btn => btn.id);
      expect(buttonIds).toEqual(['btn-continue', 'btn-new-game', 'btn-load-game', 'btn-settings']);
    });
  });

  describe('Requirement 5: Continue Game button states and action', () => {
    it('disables #btn-continue and prevents action dispatch when hasSaveData is false', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({ hasSaveData: false }, actions);
      const continueBtn = container.querySelector<HTMLButtonElement>('#btn-continue');
      expect(continueBtn).not.toBeNull();
      expect(continueBtn!.disabled).toBe(true);

      fireEvent.click(continueBtn!);
      expect(actions.continueGame).not.toHaveBeenCalled();
    });

    it('enables #btn-continue and dispatches actions.continueGame once when hasSaveData is true', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({ hasSaveData: true }, actions);
      const continueBtn = container.querySelector<HTMLButtonElement>('#btn-continue');
      expect(continueBtn).not.toBeNull();
      expect(continueBtn!.disabled).toBe(false);

      fireEvent.click(continueBtn!);
      expect(actions.continueGame).toHaveBeenCalledTimes(1);
    });
  });

  describe('Requirement 6: Menu navigation button click actions', () => {
    it('dispatches startNewGame on #btn-new-game click', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({}, actions);
      const newGameBtn = container.querySelector<HTMLButtonElement>('#btn-new-game');
      expect(newGameBtn).not.toBeNull();

      fireEvent.click(newGameBtn!);
      expect(actions.startNewGame).toHaveBeenCalledTimes(1);
    });

    it('dispatches openModal("load") on #btn-load-game click', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({}, actions);
      const loadGameBtn = container.querySelector<HTMLButtonElement>('#btn-load-game');
      expect(loadGameBtn).not.toBeNull();

      fireEvent.click(loadGameBtn!);
      expect(actions.openModal).toHaveBeenCalledWith('load');
    });

    it('dispatches openModal("settings") on #btn-settings click', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({}, actions);
      const settingsBtn = container.querySelector<HTMLButtonElement>('#btn-settings');
      expect(settingsBtn).not.toBeNull();

      fireEvent.click(settingsBtn!);
      expect(actions.openModal).toHaveBeenCalledWith('settings');
    });
  });

  describe('Requirement 7: Footer version display', () => {
    it('renders #title-version with version text when titleConfig.version is defined', () => {
      const { container } = renderTitleScreen({
        titleConfig: { title: 'Starfall', version: '1.2.0' },
      });
      const versionEl = container.querySelector('#title-version');
      expect(versionEl).not.toBeNull();
      expect(versionEl!.textContent).toContain('1.2.0');
    });

    it('does not render #title-version when titleConfig.version is omitted', () => {
      const { container } = renderTitleScreen({
        titleConfig: { title: 'Starfall' },
      });
      expect(container.querySelector('#title-version')).toBeNull();
    });
  });

  describe('Requirement 8: Autoplay audio unlock on user interaction', () => {
    it('dispatches unlockAudio on pointerdown on #title-screen', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({}, actions);
      const root = container.querySelector('#title-screen');
      expect(root).not.toBeNull();

      fireEvent.pointerDown(root!);
      expect(actions.unlockAudio).toHaveBeenCalled();
    });

    it('dispatches unlockAudio on keydown on #title-screen', () => {
      const actions = createMockActions();
      const { container } = renderTitleScreen({}, actions);
      const root = container.querySelector('#title-screen');
      expect(root).not.toBeNull();

      fireEvent.keyDown(root!, { key: 'a', code: 'KeyA' });
      expect(actions.unlockAudio).toHaveBeenCalled();
    });

    it('dispatches unlockAudio on window keydown before element focus', () => {
      const actions = createMockActions();
      renderTitleScreen({}, actions);

      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(actions.unlockAudio).toHaveBeenCalled();
    });

    it('removes window keydown listener when TitleScreen unmounts', () => {
      const actions = createMockActions();
      const { unmount } = renderTitleScreen({}, actions);

      unmount();
      actions.unlockAudio.mockClear();

      fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' });
      expect(actions.unlockAudio).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 9: UI hygiene and accessibility', () => {
    it('contains no emoji characters in textContent across the entire title screen', () => {
      const { container } = renderTitleScreen({
        titleConfig: { title: 'Starfall Memories', version: '1.0.0' },
        hasSaveData: true,
      });
      const root = container.querySelector('#title-screen');
      expect(root).not.toBeNull();
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(root!.textContent).not.toMatch(emojiRegex);
    });

    it('ensures every button has readable text or an aria-label attribute', () => {
      const { container } = renderTitleScreen({ hasSaveData: true });
      const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
      expect(buttons.length).toBeGreaterThan(0);

      for (const btn of buttons) {
        const text = btn.textContent?.trim() ?? '';
        const ariaLabel = btn.getAttribute('aria-label')?.trim() ?? '';
        expect(
          text.length > 0 || ariaLabel.length > 0,
          `Button #${btn.id || 'unknown'} must have either text or aria-label`,
        ).toBe(true);
      }
    });
  });
});
