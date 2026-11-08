import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction, Character } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters, SaveSlotData } from '../src/core/contracts';

function createMockAdapters() {
  let seenStore = new Set<string>();
  let slotsStore: Array<SaveSlotData | null> = [null, null, null, null, null, null];
  let quickSaveStore: SaveSlotData | null = null;

  const mockRenderer: NonNullable<KernelAdapters['renderer']> = {
    applySideEffect: vi.fn().mockResolvedValue(undefined),
    syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
    captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mockthumb'),
  };

  const mockAudio: NonNullable<KernelAdapters['audio']> = {
    applySideEffect: vi.fn(),
    syncStateCatchUp: vi.fn(),
    stopVoice: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
    playVoice: vi.fn(),
  };

  const mockStorage: NonNullable<KernelAdapters['storage']> = {
    getSeenDialogues: vi.fn(() => new Set(seenStore)),
    saveSeenDialogue: vi.fn((key: string) => {
      seenStore.add(key);
    }),
    saveSeenDialogues: vi.fn((seen: Set<string>) => {
      seenStore = new Set(seen);
    }),
    getSlots: vi.fn(() => [...slotsStore]),
    getQuickSave: vi.fn(() => quickSaveStore),
    saveSlot: vi.fn(async (data: SaveSlotData) => {
      if (data.slotIndex === 0) {
        quickSaveStore = data;
      } else {
        slotsStore[data.slotIndex - 1] = data;
      }
    }),
    loadSlot: vi.fn(async (slotIndex: number) => {
      if (slotIndex === 0) return quickSaveStore;
      return slotsStore[slotIndex - 1] ?? null;
    }),
  };

  return { mockRenderer, mockAudio, mockStorage };
}

describe('VNRuntimeKernel: Nameplate Reveal Resolution (TASK-player-core-bugs)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('TC-REV-01: should display revealed name when reveal instruction executes prior to dialogue', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice - Hội phó' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào bạn' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBe('Alice - Hội phó');
  });

  it('TC-REV-02: should prioritize inline displayNameOverride over runtime reveal', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice - Hội phó' },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Lời thoại bí ẩn',
        displayNameOverride: 'Bí ẩn',
      },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBe('Bí ẩn');
  });

  it('TC-REV-03: should fallback to configured Character Studio name when no reveal or inline override exists', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const characters: Character[] = [
      { id: 'bob', name: 'Robert', colorHex: '#10b981', sprites: {} },
    ];
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'bob', text: 'Hello there' },
    ];

    const kernel = new VNRuntimeKernel(
      program,
      { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      { characters }
    );

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBe('Robert');
    expect(state.dialogue.speakerColorHex).toBe('#10b981');
  });

  it('TC-REV-04: should fallback to raw character ID when not in Character Studio and no reveal exists', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'unknown_stranger', text: 'Who am I?' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBe('unknown_stranger');
  });

  it('TC-REV-05: should record resolved reveal speakerName in backlog entries', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice - Hội phó' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào bạn lần đầu' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const backlog = kernel.getState().backlog;
    expect(backlog).toHaveLength(1);
    expect(backlog[0]?.speakerName).toBe('Alice - Hội phó');
  });

  it('TC-REV-06: should preserve revealed speakerName after rollback via applyCatchUpSync', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice - Hội phó' },
      { type: 'DIALOGUE', character: 'alice', text: 'Line 1' },
      { type: 'DIALOGUE', character: 'alice', text: 'Line 2' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Line 1');
    expect(kernel.getState().dialogue.speakerName).toBe('Alice - Hội phó');

    await kernel.advance();
    expect(kernel.getState().dialogue.rawText).toBe('Line 2');
    expect(kernel.getState().dialogue.speakerName).toBe('Alice - Hội phó');

    const rollbackResult = kernel.rollback();
    expect(rollbackResult).toBe(true);
    expect(kernel.getState().dialogue.rawText).toBe('Line 1');
    expect(kernel.getState().dialogue.speakerName).toBe('Alice - Hội phó');
  });

  it('TC-REV-07: should record revealed speakerName in save slot and quick save previews', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice - Hội phó' },
      { type: 'DIALOGUE', character: 'alice', text: 'Save snapshot dialogue' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    await kernel.saveSlot(1);
    await kernel.quickSave();

    const state = kernel.getState();
    expect(state.saveSlots[0]?.speakerName).toBe('Alice - Hội phó');
    expect(state.quickSaveSlot?.speakerName).toBe('Alice - Hội phó');
  });
});

