import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction, Character } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters } from '../src/core/contracts';

describe('VNRuntimeKernel Character Color Resolution (TASK-player-typewriter-and-colors)', () => {
  let mockRenderer: NonNullable<KernelAdapters['renderer']>;
  let mockAudio: NonNullable<KernelAdapters['audio']>;
  let mockStorage: NonNullable<KernelAdapters['storage']>;

  const testCharacters: Character[] = [
    {
      id: 'alice',
      name: 'Alice Carroll',
      colorHex: '#38bdf8',
      sprites: { happy: 'sprite_alice_happy' },
    },
    {
      id: 'bob',
      name: 'Bob Smith',
      colorHex: '#f43f5e',
      sprites: { normal: 'sprite_bob_normal' },
    },
  ];

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

  describe('TC-KC-01: Character Color Mapping in Dialogue and Backlog', () => {
    it('should assign speakerColorHex from character options to state.dialogue and backlogEntry', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: 'alice', text: 'Hello, World!' },
        { type: 'DIALOGUE', character: 'bob', text: 'Hey there!' },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
        { characters: testCharacters },
      );

      await kernel.startNewGame();

      // Alice line
      const state1 = kernel.getState();
      expect(state1.dialogue.speakerName).toBe('alice');
      expect(state1.dialogue.speakerColorHex).toBe('#38bdf8');
      expect(state1.backlog).toHaveLength(1);
      expect(state1.backlog[0]?.speakerName).toBe('alice');
      expect(state1.backlog[0]?.speakerColorHex).toBe('#38bdf8');

      // Advance to Bob line
      await kernel.advance();
      const state2 = kernel.getState();
      expect(state2.dialogue.speakerName).toBe('bob');
      expect(state2.dialogue.speakerColorHex).toBe('#f43f5e');
      expect(state2.backlog).toHaveLength(2);
      expect(state2.backlog[1]?.speakerName).toBe('bob');
      expect(state2.backlog[1]?.speakerColorHex).toBe('#f43f5e');
    });

    it('should leave speakerColorHex undefined for narrator or unregistered character', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: null, text: 'Narrator speaking here.' },
        { type: 'DIALOGUE', character: 'charlie', text: 'Unknown character.' },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
        { characters: testCharacters },
      );

      await kernel.startNewGame();

      const state1 = kernel.getState();
      expect(state1.dialogue.speakerName).toBeUndefined();
      expect(state1.dialogue.speakerColorHex).toBeUndefined();
      expect(state1.backlog[0]?.speakerColorHex).toBeUndefined();

      await kernel.advance();
      const state2 = kernel.getState();
      expect(state2.dialogue.speakerName).toBe('charlie');
      expect(state2.dialogue.speakerColorHex).toBeUndefined();
      expect(state2.backlog[1]?.speakerColorHex).toBeUndefined();
    });
  });

  describe('TC-KC-02: Alias with Character Color', () => {
    it('should preserve speakerColorHex from character id when displayNameOverride is used', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        {
          type: 'DIALOGUE',
          character: 'alice',
          text: 'Who am I?',
          displayNameOverride: '???',
        },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
        { characters: testCharacters },
      );

      await kernel.startNewGame();

      const state = kernel.getState();
      // Display name should be the alias override "???"
      expect(state.dialogue.speakerName).toBe('???');
      // Color hex must still resolve to Alice's color "#38bdf8"
      expect(state.dialogue.speakerColorHex).toBe('#38bdf8');

      // Backlog entry should also record the alias with Alice's color
      expect(state.backlog).toHaveLength(1);
      expect(state.backlog[0]?.speakerName).toBe('???');
      expect(state.backlog[0]?.speakerColorHex).toBe('#38bdf8');
    });
  });

  describe('TC-KC-03: CatchUp and Rollback Color Synchronization', () => {
    it('should restore speakerColorHex on catch-up and rollback', async () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: 'alice', text: 'Line 1 by Alice.' },
        { type: 'DIALOGUE', character: 'bob', text: 'Line 2 by Bob.' },
      ];

      const kernel = new VNRuntimeKernel(
        program,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
        { characters: testCharacters },
      );

      await kernel.startNewGame();
      expect(kernel.getState().dialogue.speakerColorHex).toBe('#38bdf8');

      await kernel.advance();
      expect(kernel.getState().dialogue.speakerColorHex).toBe('#f43f5e');

      // Rollback to Line 1
      const rolled = kernel.rollback();
      expect(rolled).toBe(true);

      const rollbackState = kernel.getState();
      expect(rollbackState.dialogue.rawText).toBe('Line 1 by Alice.');
      expect(rollbackState.dialogue.speakerName).toBe('alice');
      expect(rollbackState.dialogue.speakerColorHex).toBe('#38bdf8');
    });
  });

  describe('TC-KC-04: Dynamic Character Registry Update on loadProgram', () => {
    it('should update character color resolution when loadProgram passes updated characters', async () => {
      const initialProgram: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: 'alice', text: 'Initial line.' },
      ];

      const kernel = new VNRuntimeKernel(
        initialProgram,
        { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
        { characters: testCharacters },
      );

      await kernel.startNewGame();
      expect(kernel.getState().dialogue.speakerColorHex).toBe('#38bdf8');

      // Hot reload script with updated character color palette (Alice changed to gold #eab308)
      const updatedCharacters: Character[] = [
        {
          id: 'alice',
          name: 'Alice Carroll',
          colorHex: '#eab308',
          sprites: { happy: 'sprite_alice_happy' },
        },
      ];

      const updatedProgram: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'DIALOGUE', character: 'alice', text: 'Updated line.' },
      ];

      await kernel.loadProgram(updatedProgram, {
        characters: updatedCharacters,
        scene: 'intro',
      });

      const updatedState = kernel.getState();
      expect(updatedState.dialogue.speakerColorHex).toBe('#eab308');
    });
  });
});

