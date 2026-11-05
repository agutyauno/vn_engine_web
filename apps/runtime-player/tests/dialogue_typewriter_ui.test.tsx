import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import type { PlayerViewState, PlayerUIActions } from '../src/core/contracts';
import { PlayerUIProvider } from '../src/ui/context/PlayerUIContext';
import { DialogueBox } from '../src/ui/components/DialogueBox';

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
      textSpeed: 20, // 20 chars per second => 50ms per character
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

describe('Dialogue Typewriter Animation & Inline Colors (TASK-player-typewriter-and-colors)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  describe('TC-UI-01: Progressive Reveal (Typewriter Pacing)', () => {
    it('should reveal text progressively over elapsed time based on configured textSpeed', () => {
      const actions = createMockActions();
      const state = createMockState({
        settings: { textSpeed: 20, autoDelayMs: 1500 }, // 50ms per character
        dialogue: {
          isVisible: true,
          rawText: 'Hello World!', // 12 chars: total 600ms
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      expect(dialogueText).not.toBeNull();

      // At t=0, progressive reveal must NOT show full 12 chars immediately
      expect(dialogueText?.textContent?.trim().length).toBeLessThan(12);

      // Advance by 150ms (at 50ms/char => approx 3 characters: "Hel")
      act(() => {
        vi.advanceTimersByTime(150);
      });
      const textAt150ms = dialogueText?.textContent?.trim() ?? '';
      expect(textAt150ms.length).toBeGreaterThanOrEqual(2);
      expect(textAt150ms.length).toBeLessThan(12);
      expect('Hello World!'.startsWith(textAt150ms)).toBe(true);

      // Advance by remaining time to complete all 12 characters (total 650ms)
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(dialogueText?.textContent?.trim()).toBe('Hello World!');
      expect(actions.completeDialogue).toHaveBeenCalled();
    });

    it('should adjust reveal pacing according to segment speedMultiplier ({speed:slow} vs {speed:fast})', () => {
      const actions = createMockActions();
      // Base: 20 cps (50ms/char). slow = 0.5x (100ms/char), fast = 2.0x (25ms/char)
      const state = createMockState({
        settings: { textSpeed: 20, autoDelayMs: 1500 },
        dialogue: {
          isVisible: true,
          rawText: '{speed:slow}ABC{speed:fast}XYZ',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      // At t=150ms, with slow (100ms/char), only 1 or 2 characters should have appeared
      act(() => {
        vi.advanceTimersByTime(150);
      });
      const slowProgress = dialogueText?.textContent?.trim() ?? '';
      expect(slowProgress.length).toBeLessThanOrEqual(2);
      expect(slowProgress.includes('{speed:slow}')).toBe(false);

      // After 300ms total, "ABC" is done (3 * 100ms). Now enters fast segment (25ms/char)
      act(() => {
        vi.advanceTimersByTime(200); // t = 350ms -> 300ms for ABC + 50ms for 2 chars of XYZ
      });
      const midProgress = dialogueText?.textContent?.trim() ?? '';
      expect(midProgress.length).toBeGreaterThanOrEqual(4); // "ABC" + at least 1 fast char
    });
  });

  describe('TC-UI-02: Pause Tag Halting', () => {
    it('should halt typewriter progression when encountering {pause:500ms} before resuming', () => {
      const actions = createMockActions();
      // 20 cps = 50ms/char
      const state = createMockState({
        settings: { textSpeed: 20, autoDelayMs: 1500 },
        dialogue: {
          isVisible: true,
          rawText: 'Wait{pause:500ms}Go',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');

      // "Wait" takes 4 * 50ms = 200ms
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(dialogueText?.textContent?.trim()).toBe('Wait');

      // Advance by 300ms (within the 500ms pause) -> MUST STILL BE "Wait"
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(dialogueText?.textContent?.trim()).toBe('Wait');

      // Advance another 250ms (total 750ms -> 200ms text + 500ms pause + 50ms for 'G')
      act(() => {
        vi.advanceTimersByTime(250);
      });
      const resumedText = dialogueText?.textContent?.trim() ?? '';
      expect(resumedText.length).toBeGreaterThan(4);
      expect(resumedText.startsWith('Wait')).toBe(true);
      expect(dialogueText?.textContent).not.toContain('{pause:500ms}');
    });

    it('should support {wait:0.5s} pause alias and strip tag from DOM', () => {
      const actions = createMockActions();
      const state = createMockState({
        settings: { textSpeed: 20, autoDelayMs: 1500 },
        dialogue: {
          isVisible: true,
          rawText: 'Stop{wait:0.5s}!',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');

      act(() => {
        vi.advanceTimersByTime(200); // 4 chars * 50ms = "Stop"
      });
      expect(dialogueText?.textContent?.trim()).toBe('Stop');

      act(() => {
        vi.advanceTimersByTime(250); // halfway into 500ms wait
      });
      expect(dialogueText?.textContent?.trim()).toBe('Stop');

      act(() => {
        vi.advanceTimersByTime(350); // past wait + '!'
      });
      expect(dialogueText?.textContent?.trim()).toBe('Stop!');
      expect(dialogueText?.textContent).not.toContain('{wait:0.5s}');
    });
  });

  describe('TC-UI-03: First Click / Key Instant Finish', () => {
    it('should immediately complete text reveal and trigger completeDialogue on click while typing', () => {
      const actions = createMockActions();
      const state = createMockState({
        settings: { textSpeed: 10, autoDelayMs: 1500 }, // 100ms per char
        dialogue: {
          isVisible: true,
          rawText: 'A long sentence that would take ten seconds to type out completely.',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueBox = container.querySelector('#dialogue-box') as HTMLElement;
      const dialogueText = container.querySelector('#dialogue-text');

      // Click immediately while typing
      fireEvent.click(dialogueBox);

      // 1. completeDialogue called
      expect(actions.completeDialogue).toHaveBeenCalledTimes(1);
      // 2. advance was NOT called (requires second click)
      expect(actions.advance).not.toHaveBeenCalled();
      // 3. Text is 100% revealed
      expect(dialogueText?.textContent?.trim()).toBe(
        'A long sentence that would take ten seconds to type out completely.',
      );

      // Advancing remaining timers should not crash or trigger duplicate calls
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(actions.completeDialogue).toHaveBeenCalledTimes(1);
    });

    it('should complete text instantly on Space or Enter key press while typing', () => {
      const actions = createMockActions();
      const state = createMockState({
        settings: { textSpeed: 10, autoDelayMs: 1500 },
        dialogue: {
          isVisible: true,
          rawText: 'Pressing Space key finishes typing instantly.',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueBox = container.querySelector('#dialogue-box') as HTMLElement;
      const dialogueText = container.querySelector('#dialogue-text');

      fireEvent.keyDown(dialogueBox, { key: ' ' });

      expect(actions.completeDialogue).toHaveBeenCalledTimes(1);
      expect(actions.advance).not.toHaveBeenCalled();
      expect(dialogueText?.textContent?.trim()).toBe(
        'Pressing Space key finishes typing instantly.',
      );
    });
  });

  describe('TC-UI-04: Second Click Advance', () => {
    it('should dispatch actions.advance on click when isComplete === true', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: 'Text is already fully typed.',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueBox = container.querySelector('#dialogue-box') as HTMLElement;
      fireEvent.click(dialogueBox);

      expect(actions.advance).toHaveBeenCalledTimes(1);
      expect(actions.completeDialogue).not.toHaveBeenCalled();
    });

    it('should dispatch actions.advance on Enter key when isComplete === true', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: 'Text is fully typed.',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueBox = container.querySelector('#dialogue-box') as HTMLElement;
      fireEvent.keyDown(dialogueBox, { key: 'Enter' });

      expect(actions.advance).toHaveBeenCalledTimes(1);
      expect(actions.completeDialogue).not.toHaveBeenCalled();
    });

    it('should respect isComplete prop passed directly to DialogueBox', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: 'Overridden prop test',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox isComplete={true} />
        </PlayerUIProvider>,
      );

      const dialogueBox = container.querySelector('#dialogue-box') as HTMLElement;
      fireEvent.click(dialogueBox);

      expect(actions.advance).toHaveBeenCalledTimes(1);
    });
  });

  describe('TC-UI-05: SKIP / Instant Speed Bypass', () => {
    it('should display 100% text immediately without animation delay when playbackMode is SKIP', () => {
      const actions = createMockActions();
      const state = createMockState({
        playbackMode: 'SKIP',
        settings: { textSpeed: 20, autoDelayMs: 1500 },
        dialogue: {
          isVisible: true,
          rawText: 'Skipping through dialogue at warp speed!',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      // At t=0, SKIP mode renders 100% of text immediately
      expect(dialogueText?.textContent?.trim()).toBe('Skipping through dialogue at warp speed!');
    });

    it('should display 100% text immediately when textSpeed is 0 (instant text)', () => {
      const actions = createMockActions();
      const state = createMockState({
        playbackMode: 'NORMAL',
        settings: { textSpeed: 0, autoDelayMs: 1500 },
        dialogue: {
          isVisible: true,
          rawText: 'Instant text reveal with textSpeed 0',
          isComplete: false,
          canAdvance: true,
          isSeen: false,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      expect(dialogueText?.textContent?.trim()).toBe('Instant text reveal with textSpeed 0');
    });
  });

  describe('TC-UI-06: Colored Spans Rendering & Control Tag Sanitization', () => {
    it('should render colored text segments inside <span> elements with inline color styles', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: 'Greetings, {color:#38bdf8}Alice{/color}! Welcome.',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      expect(dialogueText).not.toBeNull();

      // Check span element exists for colored segment
      const spans = dialogueText?.querySelectorAll('span');
      expect(spans?.length).toBe(1);

      const span = spans?.[0] as HTMLElement;
      expect(span?.textContent).toBe('Alice');
      const styleAttr = span?.getAttribute('style') ?? '';
      expect(
        styleAttr.includes('#38bdf8') ||
          span?.style.color.includes('56, 189, 248'),
      ).toBe(true);

      // Clean text content across whole dialogue
      expect(dialogueText?.textContent?.trim()).toBe('Greetings, Alice! Welcome.');
    });

    it('should NEVER render control tags {speed:...}, {pause:...}, {wait:...}, {/color} as raw text in the DOM', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: '{speed:slow}Hello {pause:500ms}{color:#f43f5e}world{/color}{wait:1s}!',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      const fullText = dialogueText?.textContent ?? '';

      // Verify no control tags leaked into visible text
      expect(fullText).not.toContain('{speed:slow}');
      expect(fullText).not.toContain('{pause:500ms}');
      expect(fullText).not.toContain('{color:#f43f5e}');
      expect(fullText).not.toContain('{/color}');
      expect(fullText).not.toContain('{wait:1s}');
      expect(fullText.trim()).toBe('Hello world!');
    });

    it('should support multiple colored spans and color resets', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: '{color:#22c55e}Green{color:reset} and {color:#eab308}Yellow{/color}',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      const spans = dialogueText?.querySelectorAll('span');
      expect(spans?.length).toBe(2);

      expect(spans?.[0]?.textContent).toBe('Green');
      expect(
        spans?.[0]?.getAttribute('style')?.includes('#22c55e') ||
          (spans?.[0] as HTMLElement)?.style.color.includes('34, 197, 94'),
      ).toBe(true);

      expect(spans?.[1]?.textContent).toBe('Yellow');
      expect(
        spans?.[1]?.getAttribute('style')?.includes('#eab308') ||
          (spans?.[1] as HTMLElement)?.style.color.includes('234, 179, 8'),
      ).toBe(true);

      expect(dialogueText?.textContent?.trim()).toBe('Green and Yellow');
    });

    it('should gracefully handle empty or undefined rawText without crashing', () => {
      const actions = createMockActions();
      const state = createMockState({
        dialogue: {
          isVisible: true,
          rawText: '',
          isComplete: true,
          canAdvance: true,
          isSeen: true,
        },
      });

      const { container } = render(
        <PlayerUIProvider state={state} actions={actions}>
          <DialogueBox />
        </PlayerUIProvider>,
      );

      const dialogueText = container.querySelector('#dialogue-text');
      expect(dialogueText?.textContent).toBe('');
    });
  });
});
