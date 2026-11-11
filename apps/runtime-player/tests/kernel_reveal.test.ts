import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
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

describe('VNRuntimeKernel: Literal Speaker Resolution (TC-SPRITE-PLAYER-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('[TC-SPRITE-PLAYER-03] should display literal speaker name from string literal without REVEAL', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'Alice - Hội phó', speaker: 'Alice - Hội phó', text: 'Chào bạn' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBe('Alice - Hội phó');
    expect(state.dialogue.speakerColorHex).toBe('#ffffff');
  });

  it('[TC-SPRITE-PLAYER-03] should support literal question marks "???" as speakerName', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      {
        type: 'DIALOGUE',
        character: '???',
        speaker: '???',
        text: 'Lời thoại bí ẩn',
      },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBe('???');
    expect(state.dialogue.speakerColorHex).toBe('#ffffff');
  });

  it('[TC-SPRITE-PLAYER-03] should handle narrator dialogue with null speaker without speakerColorHex', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: null, speaker: null, text: 'Trời đổ cơn mưa rào.' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    const state = kernel.getState();
    expect(state.dialogue.speakerName).toBeUndefined();
    expect(state.dialogue.speakerColorHex).toBeUndefined();
  });

  it('[TC-SPRITE-PLAYER-03] should record literal speakerName in backlog entries', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'Alice - Hội phó', speaker: 'Alice - Hội phó', text: 'Chào bạn lần đầu' },
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

  it('[TC-SPRITE-PLAYER-03] should preserve literal speakerName after rollback', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: '???', speaker: '???', text: 'Line 1' },
      { type: 'DIALOGUE', character: 'Alice Carroll', speaker: 'Alice Carroll', text: 'Line 2' },
    ];

    const kernel = new VNRuntimeKernel(program, {
      renderer: mockRenderer,
      audio: mockAudio,
      storage: mockStorage,
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Line 1');
    expect(kernel.getState().dialogue.speakerName).toBe('???');

    await kernel.advance();
    expect(kernel.getState().dialogue.rawText).toBe('Line 2');
    expect(kernel.getState().dialogue.speakerName).toBe('Alice Carroll');

    const rollbackResult = kernel.rollback();
    expect(rollbackResult).toBe(true);
    expect(kernel.getState().dialogue.rawText).toBe('Line 1');
    expect(kernel.getState().dialogue.speakerName).toBe('???');
  });

  it('[TC-SPRITE-PLAYER-03] should record literal speakerName in save slot and quick save previews', async () => {
    const { mockRenderer, mockAudio, mockStorage } = createMockAdapters();
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'Alice Carroll', speaker: 'Alice Carroll', text: 'Save snapshot dialogue' },
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
    expect(state.saveSlots[0]?.speakerName).toBe('Alice Carroll');
    expect(state.quickSaveSlot?.speakerName).toBe('Alice Carroll');
  });
});
