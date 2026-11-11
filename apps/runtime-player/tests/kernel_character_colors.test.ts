import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters } from '../src/core/contracts';

describe('VNRuntimeKernel Literal Speaker Resolution (Unified Sprite Layer)', () => {
  let mockRenderer: NonNullable<KernelAdapters['renderer']>;
  let mockAudio: NonNullable<KernelAdapters['audio']>;
  let mockStorage: NonNullable<KernelAdapters['storage']>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockRenderer = {
      applySideEffect: vi.fn().mockResolvedValue(undefined),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mockthumb'),
    };

    mockAudio = {
      applySideEffect: vi.fn(),
      syncStateCatchUp: vi.fn(),
      stopVoice: vi.fn(),
      setVolume: vi.fn(),
      setMute: vi.fn(),
      playVoice: vi.fn(),
    };

    mockStorage = {
      getSeenDialogues: vi.fn(() => new Set<string>()),
      saveSeenDialogue: vi.fn(),
      getSlots: vi.fn(() => [null, null, null, null, null, null]),
      getQuickSave: vi.fn(() => null),
      saveSlot: vi.fn(async () => {}),
      loadSlot: vi.fn(async () => null),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('TC-KC-01: Speaker Name and Color in Dialogue and Backlog', () => {
    it('should assign speakerName and default #ffffff colorHex to state.dialogue and backlogEntry', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: 'Alice Carroll', text: 'Hello, World!' },
        { type: 'DIALOGUE', character: 'Bob Smith', text: 'Hey there!' },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      );

      await kernel.startNewGame();

      // Alice line
      const state1 = kernel.getState();
      expect(state1.dialogue.speakerName).toBe('Alice Carroll');
      expect(state1.dialogue.speakerColorHex).toBe('#ffffff');
      expect(state1.backlog).toHaveLength(1);
      expect(state1.backlog[0]?.speakerName).toBe('Alice Carroll');
      expect(state1.backlog[0]?.speakerColorHex).toBe('#ffffff');

      // Advance to Bob line
      await kernel.advance();
      const state2 = kernel.getState();
      expect(state2.dialogue.speakerName).toBe('Bob Smith');
      expect(state2.dialogue.speakerColorHex).toBe('#ffffff');
      expect(state2.backlog).toHaveLength(2);
      expect(state2.backlog[1]?.speakerName).toBe('Bob Smith');
      expect(state2.backlog[1]?.speakerColorHex).toBe('#ffffff');
    });

    it('should leave speakerName and speakerColorHex undefined for narrator without speaker', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: null, text: 'Narrator speaking here.' },
        { type: 'DIALOGUE', character: 'Charlie', text: 'Literal speaker character.' },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      );

      await kernel.startNewGame();

      const state1 = kernel.getState();
      expect(state1.dialogue.speakerName).toBeUndefined();
      expect(state1.dialogue.speakerColorHex).toBeUndefined();
      expect(state1.backlog[0]?.speakerColorHex).toBeUndefined();

      await kernel.advance();
      const state2 = kernel.getState();
      expect(state2.dialogue.speakerName).toBe('Charlie');
      expect(state2.dialogue.speakerColorHex).toBe('#ffffff');
      expect(state2.backlog[1]?.speakerColorHex).toBe('#ffffff');
    });
  });

  describe('TC-KC-02: Literal Speaker String in Dialogue', () => {
    it('should directly display mysterious speaker "???" with speakerColorHex', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        {
          type: 'DIALOGUE',
          character: '???',
          text: 'Who am I?',
        },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      );

      await kernel.startNewGame();

      const state = kernel.getState();
      expect(state.dialogue.speakerName).toBe('???');
      expect(state.dialogue.speakerColorHex).toBe('#ffffff');

      // Backlog entry should also record the literal speaker
      expect(state.backlog).toHaveLength(1);
      expect(state.backlog[0]?.speakerName).toBe('???');
      expect(state.backlog[0]?.speakerColorHex).toBe('#ffffff');
    });
  });

  describe('TC-KC-03: CatchUp and Rollback Color Synchronization', () => {
    it('should restore speakerColorHex on catch-up and rollback', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: 'Alice Carroll', text: 'Line 1 by Alice.' },
        { type: 'DIALOGUE', character: 'Bob Smith', text: 'Line 2 by Bob.' },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      );

      await kernel.startNewGame();
      expect(kernel.getState().dialogue.speakerColorHex).toBe('#ffffff');

      await kernel.advance();
      expect(kernel.getState().dialogue.speakerColorHex).toBe('#ffffff');

      // Rollback to Line 1
      const rolled = kernel.rollback();
      expect(rolled).toBe(true);

      const rollbackState = kernel.getState();
      expect(rollbackState.dialogue.rawText).toBe('Line 1 by Alice.');
      expect(rollbackState.dialogue.speakerName).toBe('Alice Carroll');
      expect(rollbackState.dialogue.speakerColorHex).toBe('#ffffff');
    });
  });
});
