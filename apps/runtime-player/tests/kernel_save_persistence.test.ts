// ============================================================================
// TASK-PLY-SAVEFIX: Kernel save persistence (TC-SAVE-01, 02, 07)
// TC-01/02 dùng StorageAdapter THẬT trên localStorage của jsdom (không mock storage),
// để test không che bug định tuyến slot 0 như mock cũ trong kernel_reveal.test.ts.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import { StorageAdapter, StorageQuotaError } from '../src/adapters/StorageAdapter';
import type { KernelAdapters, SaveSlotData } from '../src/core/contracts';

const PROGRAM: Instruction[] = [
  { type: 'SCENE', name: 'intro' },
  { type: 'DIALOGUE', character: null, speaker: null, text: 'Dòng thoại đầu tiên.' },
  { type: 'DIALOGUE', character: null, speaker: null, text: 'Dòng thoại thứ hai.' },
];

function jsdomLocalStorage(): Storage {
  return (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage;
}

function createRenderer(): NonNullable<KernelAdapters['renderer']> {
  return {
    applySideEffect: vi.fn().mockResolvedValue(undefined),
    syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
    captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,kernelthumb'),
  };
}

function createAudio(): NonNullable<KernelAdapters['audio']> {
  return {
    applySideEffect: vi.fn(),
    syncStateCatchUp: vi.fn(),
    stopVoice: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
    playVoice: vi.fn(),
  };
}

function makeSlot(slotIndex: number, label: string): SaveSlotData {
  return {
    slotIndex,
    timestamp: 42,
    thumbnailDataUrl: '',
    currentScene: 'intro',
    previewText: label,
    dialogueCounter: 1,
    serializedState: `{"label":"${label}"}`,
  };
}

describe('VNRuntimeKernel: save persistence with real StorageAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Node >= 25 cài sẵn localStorage toàn cục (webstorage) che mất bản của jsdom;
    // gắn lại Storage THẬT của jsdom (không mock) cho StorageAdapter.
    vi.stubGlobal('localStorage', jsdomLocalStorage());
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('[TC-SAVE-01] quickSave() persists to localStorage so a fresh StorageAdapter can read it back', async () => {
    const kernel = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage: new StorageAdapter({ projectId: 'p1', isPreview: false }),
    });

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toContain('Dòng thoại đầu tiên.');

    await kernel.quickSave();
    const inMemory = kernel.getState().quickSaveSlot;
    expect(inMemory).not.toBeNull();

    const freshAdapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    const persisted = freshAdapter.getQuickSave();
    expect(persisted).not.toBeNull();
    expect(persisted?.slotIndex).toBe(0);
    expect(persisted?.serializedState).toBe(inMemory?.serializedState);

    // Quick save không được lọt vào mảng slot thường.
    expect(freshAdapter.getSlots().every(s => s === null)).toBe(true);
  });

  it('[TC-SAVE-02] a second kernel booted from the same storage sees the quick save', async () => {
    const first = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage: new StorageAdapter({ projectId: 'p1', isPreview: false }),
    });
    await first.startNewGame();
    await first.quickSave();
    const savedState = first.getState().quickSaveSlot?.serializedState;

    const second = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage: new StorageAdapter({ projectId: 'p1', isPreview: false }),
    });

    const bootSlot = second.getState().quickSaveSlot;
    expect(bootSlot).not.toBeNull();
    expect(bootSlot?.slotIndex).toBe(0);
    expect(bootSlot?.serializedState).toBe(savedState);
  });
});

describe('VNRuntimeKernel: storage quota failure reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createQuotaStorage(
    initialSlots: Array<SaveSlotData | null>,
    initialQuick: SaveSlotData | null,
  ): NonNullable<KernelAdapters['storage']> {
    return {
      getSeenDialogues: vi.fn(() => new Set<string>()),
      saveSeenDialogue: vi.fn(),
      saveSeenDialogues: vi.fn(),
      getSlots: vi.fn(() => [...initialSlots]),
      getQuickSave: vi.fn(() => initialQuick),
      saveSlot: vi.fn(async (data: SaveSlotData) => {
        throw new StorageQuotaError(
          data.slotIndex === 0 ? 'vn_engine_player_p1_quicksave' : 'vn_engine_player_p1_save_slots',
        );
      }),
      loadSlot: vi.fn(async () => null),
    };
  }

  it('[TC-SAVE-07] saveSlot(1) swallows StorageQuotaError, shows toast, and keeps the previous slot', async () => {
    const previousSlot = makeSlot(1, 'old slot 1');
    const kernel = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage: createQuotaStorage([previousSlot, null, null, null, null, null], null),
    });
    await kernel.startNewGame();

    await expect(kernel.saveSlot(1)).resolves.toBeUndefined();

    const state = kernel.getState();
    expect(state.activeToast?.message).toBe('Save failed: storage is full');
    expect(state.saveSlots[0]).toEqual(previousSlot);
  });

  it('[TC-SAVE-07] quickSave() swallows StorageQuotaError, shows toast, and keeps the previous quick save', async () => {
    const previousQuick = makeSlot(0, 'old quick');
    const kernel = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage: createQuotaStorage([null, null, null, null, null, null], previousQuick),
    });
    await kernel.startNewGame();

    await expect(kernel.quickSave()).resolves.toBeUndefined();

    const state = kernel.getState();
    expect(state.activeToast?.message).toBe('Save failed: storage is full');
    expect(state.quickSaveSlot).toEqual(previousQuick);
  });

  it('[TC-SAVE-07] quickSave() with no previous quick save leaves quickSaveSlot null on quota failure', async () => {
    const kernel = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage: createQuotaStorage([null, null, null, null, null, null], null),
    });
    await kernel.startNewGame();

    await expect(kernel.quickSave()).resolves.toBeUndefined();

    expect(kernel.getState().activeToast?.message).toBe('Save failed: storage is full');
    expect(kernel.getState().quickSaveSlot).toBeNull();
  });

  it('[TC-SAVE-07] non-quota storage errors still propagate from saveSlot()', async () => {
    const storage = createQuotaStorage([null, null, null, null, null, null], null);
    storage.saveSlot = vi.fn(async () => {
      throw new Error('disk on fire');
    });
    const kernel = new VNRuntimeKernel(PROGRAM, {
      renderer: createRenderer(),
      audio: createAudio(),
      storage,
    });
    await kernel.startNewGame();

    await expect(kernel.saveSlot(1)).rejects.toThrow('disk on fire');
    expect(kernel.getState().saveSlots[0]).toBeNull();
  });
});
