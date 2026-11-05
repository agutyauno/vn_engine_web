import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions, BacklogEntry } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { BacklogDrawer } from '../src/ui/components/modals/BacklogDrawer';
import { PreviewStandbyScreen } from '../src/ui/components/PreviewStandbyScreen';
import { PlayerApp } from '../src/ui/components/PlayerApp';

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
      rawText: 'Hello world',
      isComplete: false,
      canAdvance: true,
      isSeen: false,
    },
    activeChoices: null,
    activeInspectModal: null,
    activeModal: 'none',
    settings: {
      textSpeed: 20,
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

describe('Phase 3: Backlog Drawer Color Retention & Standby Clean Screen (TASK-player-typewriter-and-colors)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && !window.ResizeObserver) {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('TC-UI-07: Backlog Drawer Color Retention & Control Tag Sanitization', () => {
    it('should render colored <span> elements inside .backlog-text for color tags and retain colors', () => {
      const actions = createMockActions();
      const entry: BacklogEntry = {
        id: 'entry-1',
        speakerName: 'Alice',
        speakerColorHex: '#38bdf8',
        text: '{color:#38bdf8}Alice{/color} nói {color:#ef4444}nguy hiểm{/color}!',
        timestamp: Date.now(),
      };
      const state = createMockState({
        activeModal: 'backlog',
        backlog: [entry],
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      const backlogText = container.querySelector('.backlog-text');
      expect(backlogText).not.toBeNull();

      // Verify raw tags are stripped from visible text content
      expect(backlogText?.textContent).not.toContain('{color:#38bdf8}');
      expect(backlogText?.textContent).not.toContain('{/color}');
      expect(backlogText?.textContent).not.toContain('{color:#ef4444}');
      expect(backlogText?.textContent?.trim()).toBe('Alice nói nguy hiểm!');

      // Verify colored child spans are rendered inside .backlog-text
      const coloredSpans = backlogText?.querySelectorAll('span');
      expect(coloredSpans).toBeDefined();
      expect(coloredSpans!.length).toBeGreaterThanOrEqual(2);

      // First colored span: Alice with #38bdf8
      const aliceSpan = coloredSpans![0] as HTMLElement;
      expect(aliceSpan.textContent).toBe('Alice');
      expect(
        aliceSpan.style.color.includes('38bdf8') ||
          aliceSpan.style.color.includes('rgb(56, 189, 248)') ||
          aliceSpan.getAttribute('style')?.includes('#38bdf8'),
      ).toBe(true);

      // Second colored span: nguy hiểm with #ef4444
      const dangerSpan = coloredSpans![1] as HTMLElement;
      expect(dangerSpan.textContent).toBe('nguy hiểm');
      expect(
        dangerSpan.style.color.includes('ef4444') ||
          dangerSpan.style.color.includes('rgb(239, 68, 68)') ||
          dangerSpan.getAttribute('style')?.includes('#ef4444'),
      ).toBe(true);
    });

    it('should strip rhythm tags {speed:...}, {pause:...}, {wait:...} and not render them as raw text', () => {
      const actions = createMockActions();
      const entry: BacklogEntry = {
        id: 'entry-2',
        speakerName: 'Narrator',
        text: '{speed:slow}{color:#38bdf8}Hero{/color} attacks{pause:1s}{wait:500ms}!',
        timestamp: Date.now(),
      };
      const state = createMockState({
        activeModal: 'backlog',
        backlog: [entry],
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      const backlogText = container.querySelector('.backlog-text');
      const fullText = backlogText?.textContent ?? '';

      // Verify rhythm and inline tags are not leaked into visible text
      expect(fullText).not.toContain('{speed:slow}');
      expect(fullText).not.toContain('{pause:1s}');
      expect(fullText).not.toContain('{wait:500ms}');
      expect(fullText).not.toContain('{color:#38bdf8}');
      expect(fullText).not.toContain('{/color}');
      expect(fullText.trim()).toBe('Hero attacks!');

      // Color span for "Hero" must be preserved
      const spans = backlogText?.querySelectorAll('span');
      expect(spans?.length).toBeGreaterThanOrEqual(1);
      const heroSpan = spans![0] as HTMLElement;
      expect(heroSpan.textContent).toBe('Hero');
      expect(
        heroSpan.style.color.includes('38bdf8') ||
          heroSpan.style.color.includes('rgb(56, 189, 248)') ||
          heroSpan.getAttribute('style')?.includes('#38bdf8'),
      ).toBe(true);
    });

    it('should display speakerName with correct speakerColorHex style in .backlog-speaker', () => {
      const actions = createMockActions();
      const entry: BacklogEntry = {
        id: 'entry-3',
        speakerName: 'Alice',
        speakerColorHex: '#38bdf8',
        text: 'Hello from wonderland',
        timestamp: Date.now(),
      };
      const state = createMockState({
        activeModal: 'backlog',
        backlog: [entry],
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      const speakerEl = container.querySelector('.backlog-speaker') as HTMLElement;
      expect(speakerEl).not.toBeNull();
      expect(speakerEl.textContent).toBe('Alice');
      expect(
        speakerEl.style.color.includes('38bdf8') ||
          speakerEl.style.color.includes('rgb(56, 189, 248)') ||
          speakerEl.getAttribute('style')?.includes('#38bdf8'),
      ).toBe(true);
    });

    it('should omit .backlog-speaker element when speakerName is not provided', () => {
      const actions = createMockActions();
      const entry: BacklogEntry = {
        id: 'entry-4',
        speakerName: undefined,
        text: 'The wind whispers through the trees...',
        timestamp: Date.now(),
      };
      const state = createMockState({
        activeModal: 'backlog',
        backlog: [entry],
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      const speakerEl = container.querySelector('.backlog-speaker');
      expect(speakerEl).toBeNull();
      expect(container.querySelector('.backlog-text')?.textContent?.trim()).toBe(
        'The wind whispers through the trees...',
      );
    });

    it('should handle voice replay button click and close button click', () => {
      const actions = createMockActions();
      const entry: BacklogEntry = {
        id: 'entry-5',
        speakerName: 'Alice',
        speakerColorHex: '#38bdf8',
        text: 'Listen to my voice!',
        voiceAssetId: 'voice_alice_welcome',
        timestamp: Date.now(),
      };
      const state = createMockState({
        activeModal: 'backlog',
        backlog: [entry],
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      const voiceBtn = container.querySelector('.btn-replay-voice') as HTMLButtonElement;
      expect(voiceBtn).not.toBeNull();
      fireEvent.click(voiceBtn);
      expect(actions.replayVoice).toHaveBeenCalledWith('voice_alice_welcome');

      const closeBtn = container.querySelector('#btn-close-backlog') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      fireEvent.click(closeBtn);
      expect(actions.closeModal).toHaveBeenCalled();
    });

    it('should handle plain text without any tags or empty strings cleanly', () => {
      const actions = createMockActions();
      const entry1: BacklogEntry = {
        id: 'entry-plain',
        speakerName: 'Bob',
        text: 'Just regular plain text without tags.',
        timestamp: Date.now(),
      };
      const entry2: BacklogEntry = {
        id: 'entry-empty',
        speakerName: 'Narrator',
        text: '',
        timestamp: Date.now(),
      };
      const state = createMockState({
        activeModal: 'backlog',
        backlog: [entry1, entry2],
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <BacklogDrawer />
        </PlayerUIProvider>,
      );

      const entries = container.querySelectorAll('.backlog-entry');
      expect(entries.length).toBe(2);
      expect(entries[0]?.querySelector('.backlog-text')?.textContent).toBe(
        'Just regular plain text without tags.',
      );
      expect(entries[1]?.querySelector('.backlog-text')?.textContent).toBe('');
    });
  });

  describe('TC-UI-08: Standby Clean Screen (Removal of Live Preview Card)', () => {
    it('should render #preview-standby-screen without .standby-box and without card text', () => {
      const { container } = render(<PreviewStandbyScreen />);

      // Container still exists for stage composition
      const standbyScreen = container.querySelector('#preview-standby-screen');
      expect(standbyScreen).not.toBeNull();

      // Obsolete .standby-box card must be completely removed
      const standbyBox = container.querySelector('.standby-box');
      expect(standbyBox).toBeNull();

      // Obsolete text content must not exist
      expect(container.textContent).not.toContain('Live Preview Connected');
      expect(container.textContent).not.toContain('Waiting for script from Studio Editor...');
      expect(container.textContent).not.toContain('LIVE PREVIEW STANDBY');
    });

    it('should render clean transparent stage when PlayerApp is in STANDBY mode', () => {
      const actions = createMockActions();
      const state = createMockState({
        mode: 'STANDBY',
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <PlayerApp />
        </PlayerUIProvider>,
      );

      // Stage contains standby screen container
      const standbyScreen = container.querySelector('#preview-standby-screen');
      expect(standbyScreen).not.toBeNull();

      // Standby box card and messages must not exist anywhere in PlayerApp
      expect(container.querySelector('.standby-box')).toBeNull();
      expect(container.querySelector('.standby-status-pill')).toBeNull();
      expect(container.querySelector('.standby-title')).toBeNull();
      expect(container.querySelector('.standby-desc')).toBeNull();
      expect(container.textContent).not.toContain('Live Preview Connected');
      expect(container.textContent).not.toContain('Waiting for script from Studio Editor...');
    });
  });
});
