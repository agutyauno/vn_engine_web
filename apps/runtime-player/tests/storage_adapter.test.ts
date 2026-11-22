import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from 'vitest';
import {
  StorageAdapter,
  StorageQuotaError,
  isQuotaExceededError,
} from '../src/adapters/StorageAdapter';
import type { KernelAdapters, SaveSlotData } from '../src/core/contracts';

describe('StorageAdapter', () => {
  let mockStorageStore: Record<string, string>;

  beforeEach(() => {
    mockStorageStore = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorageStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorageStore[key];
      }),
      clear: vi.fn(() => {
        mockStorageStore = {};
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ADR-024 Key Partitioning', () => {
    it('should use standalone player prefix vn_engine_player_${projectId} when isPreview is false', async () => {
      const adapter = new StorageAdapter({ projectId: 'demo_game', isPreview: false });

      await adapter.saveSlot({
        slotIndex: 1,
        timestamp: 1000,
        thumbnailDataUrl: 'thumb1',
        currentScene: 'intro',
        previewText: 'Hello',
        dialogueCounter: 1,
        serializedState: '{"test":1}',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_player_demo_game_save_slots',
        expect.any(String),
      );

      adapter.saveSeenDialogue('intro#0');
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_player_demo_game_seen_dialogues',
        expect.any(String),
      );

      await adapter.saveQuickSave({
        slotIndex: 0,
        timestamp: 1000,
        thumbnailDataUrl: 'quickthumb',
        currentScene: 'intro',
        previewText: 'Quick',
        dialogueCounter: 1,
        serializedState: '{"quick":1}',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_player_demo_game_quicksave',
        expect.any(String),
      );
    });

    it('should use live preview prefix vn_engine_preview_${projectId} when isPreview is true', async () => {
      const adapter = new StorageAdapter({ projectId: 'demo_game', isPreview: true });

      await adapter.saveSlot({
        slotIndex: 2,
        timestamp: 2000,
        thumbnailDataUrl: 'thumb2',
        currentScene: 'chapter1',
        previewText: 'Preview',
        dialogueCounter: 2,
        serializedState: '{"test":2}',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_preview_demo_game_save_slots',
        expect.any(String),
      );

      adapter.saveSeenDialogue('chapter1#0');
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_preview_demo_game_seen_dialogues',
        expect.any(String),
      );

      await adapter.saveQuickSave({
        slotIndex: 0,
        timestamp: 2000,
        thumbnailDataUrl: 'quickthumb',
        currentScene: 'chapter1',
        previewText: 'QuickPreview',
        dialogueCounter: 2,
        serializedState: '{"quick":2}',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_preview_demo_game_quicksave',
        expect.any(String),
      );
    });

    it('should fallback cleanly when projectId is omitted', async () => {
      const adapter = new StorageAdapter({ isPreview: false });

      await adapter.saveSlot({
        slotIndex: 1,
        timestamp: 1000,
        thumbnailDataUrl: 'thumb',
        currentScene: 'scene',
        previewText: 'Text',
        dialogueCounter: 1,
        serializedState: '{}',
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'vn_engine_player_save_slots',
        expect.any(String),
      );
    });
  });

  describe('Slot Management (6 Regular Slots + 1 QuickSave)', () => {
    it('should initialize with 6 empty slots (null)', () => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
      const slots = adapter.getSlots();

      expect(slots).toHaveLength(6);
      expect(slots.every(s => s === null)).toBe(true);
    });

    it('should save and load regular save slot (1-6)', async () => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
      const slotData: SaveSlotData = {
        slotIndex: 3,
        timestamp: 12345678,
        thumbnailDataUrl: 'data:image/jpeg;base64,thumb3',
        currentScene: 'library',
        previewText: 'Found ancient book',
        speakerName: 'Alice',
        dialogueCounter: 14,
        serializedState: '{"vars":{"found":true}}',
        scriptHash: 'hash_abc123',
      };

      await adapter.saveSlot(slotData);

      const slots = adapter.getSlots();
      expect(slots).toHaveLength(6);
      expect(slots[2]).toEqual(slotData); // 1-indexed slot 3 is at array index 2

      const loaded = await adapter.loadSlot(3);
      expect(loaded).toEqual(slotData);

      // Other slots remain null
      expect(await adapter.loadSlot(1)).toBeNull();
    });

    it('should save and load dedicated quicksave slot (slotIndex 0)', async () => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
      expect(adapter.getQuickSave()).toBeNull();

      const quickData: SaveSlotData = {
        slotIndex: 0,
        timestamp: 999999,
        thumbnailDataUrl: 'data:image/jpeg;base64,quick',
        currentScene: 'corridor',
        previewText: 'Quick saving...',
        dialogueCounter: 5,
        serializedState: '{"vars":{}}',
      };

      await adapter.saveQuickSave(quickData);
      expect(adapter.getQuickSave()).toEqual(quickData);

      const loadedQuick = await adapter.loadSlot(0);
      expect(loadedQuick).toEqual(quickData);
    });
  });

  describe('Read Text Tracking (Seen Dialogues)', () => {
    it('should return empty set initially and persist seen dialogues incrementally', () => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
      expect(adapter.getSeenDialogues().size).toBe(0);

      adapter.saveSeenDialogue('scene1#0:alice:Hello');
      adapter.saveSeenDialogue('scene1#1:bob:Hi');

      const seen = adapter.getSeenDialogues();
      expect(seen.has('scene1#0:alice:Hello')).toBe(true);
      expect(seen.has('scene1#1:bob:Hi')).toBe(true);
      expect(seen.size).toBe(2);
    });

    it('should save full set of seen dialogues via saveSeenDialogues()', () => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
      const initialSet = new Set(['line1', 'line2', 'line3']);

      adapter.saveSeenDialogues(initialSet);
      const retrieved = adapter.getSeenDialogues();

      expect(retrieved.size).toBe(3);
      expect(retrieved.has('line1')).toBe(true);
      expect(retrieved.has('line2')).toBe(true);
      expect(retrieved.has('line3')).toBe(true);
    });
  });

  describe('SAD §3.3 Sandboxed Storage Fallback (MemoryStorage)', () => {
    it('should seamlessly fallback to in-memory storage when localStorage throws SecurityError', async () => {
      // Simulate strict sandboxed iframe without allow-same-origin
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
        setItem: vi.fn(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
        removeItem: vi.fn(() => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        }),
      });

      const adapter = new StorageAdapter({ projectId: 'sandboxed_p1', isPreview: false });

      // Should not throw!
      expect(() => adapter.getSlots()).not.toThrow();
      expect(adapter.getSlots()).toHaveLength(6);

      const slot1: SaveSlotData = {
        slotIndex: 1,
        timestamp: 55555,
        thumbnailDataUrl: 'mem_thumb',
        currentScene: 'sandboxed_scene',
        previewText: 'Inside sandbox',
        dialogueCounter: 1,
        serializedState: '{"inSandbox":true}',
      };

      await expect(adapter.saveSlot(slot1)).resolves.not.toThrow();
      const loadedSlot = await adapter.loadSlot(1);
      expect(loadedSlot).toEqual(slot1);

      // Quicksave fallback
      await expect(adapter.saveQuickSave(slot1)).resolves.not.toThrow();
      expect(adapter.getQuickSave()).toEqual(slot1);

      // Seen dialogues fallback
      expect(() => adapter.saveSeenDialogue('sandbox#1')).not.toThrow();
      expect(adapter.getSeenDialogues().has('sandbox#1')).toBe(true);
    });

    it('should handle corrupt JSON data in storage gracefully without throwing', () => {
      mockStorageStore['vn_engine_player_corrupt_save_slots'] = '{ invalid json !!';
      mockStorageStore['vn_engine_player_corrupt_seen_dialogues'] = 'not an array';

      const adapter = new StorageAdapter({ projectId: 'corrupt', isPreview: false });

      expect(adapter.getSlots()).toHaveLength(6);
      expect(adapter.getSeenDialogues().size).toBe(0);
    });
  });
});

// ============================================================================
// TASK-PLY-SAVEFIX: save persistence fixes (TC-SAVE-03..06, 08, 09)
// Dùng localStorage THẬT của jsdom (gắn trong tests/setup.ts, không stub) để không
// che bug định tuyến/quota.
// ============================================================================

describe('save persistence fixes', () => {
  const PREFIX = 'vn_engine_player_p1';
  const SLOTS_KEY = `${PREFIX}_save_slots`;
  const QUICK_KEY = `${PREFIX}_quicksave`;
  const SEEN_KEY = `${PREFIX}_seen_dialogues`;

  function makeSlot(slotIndex: number, overrides: Partial<SaveSlotData> = {}): SaveSlotData {
    return {
      slotIndex,
      timestamp: 1000 + slotIndex,
      thumbnailDataUrl: `data:image/jpeg;base64,thumb${slotIndex}`,
      currentScene: 'intro',
      previewText: `Slot ${slotIndex}`,
      dialogueCounter: slotIndex,
      serializedState: `{"slot":${slotIndex}}`,
      ...overrides,
    };
  }

  function snapshotLocalStorage(): Record<string, string | null> {
    const snapshot: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) snapshot[key] = localStorage.getItem(key);
    }
    return snapshot;
  }

  function parseSlots(raw: string | null): Array<SaveSlotData | null> {
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw ?? 'null');
    expect(Array.isArray(parsed)).toBe(true);
    return parsed as Array<SaveSlotData | null>;
  }

  /** setItem ném QuotaExceededError ở lần gọi đầu, sau đó ghi thật. */
  function failFirstSetItemWithQuota(): void {
    const originalSetItem = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      calls += 1;
      if (calls === 1) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      originalSetItem.call(this, key, value);
    });
  }

  beforeEach(() => {
    // Gỡ các stub localStorage của describe phía trên, quay về Storage thật của jsdom.
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('[TC-SAVE-03] saveSlot({ slotIndex: 0 }) routes to the quicksave key and leaves regular slots empty', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    const quick = makeSlot(0);

    await adapter.saveSlot(quick);

    const raw = localStorage.getItem(QUICK_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? 'null')).toEqual(quick);
    expect(adapter.getQuickSave()).toEqual(quick);
    expect(await adapter.loadSlot(0)).toEqual(quick);

    const slots = adapter.getSlots();
    expect(slots).toHaveLength(6);
    expect(slots.every(s => s === null)).toBe(true);
  });

  it.each([7, -1, 1.5])(
    '[TC-SAVE-04] saveSlot with invalid slotIndex %s rejects RangeError and leaves localStorage untouched',
    async badIndex => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
      await adapter.saveSlot(makeSlot(2));
      const before = snapshotLocalStorage();

      await expect(adapter.saveSlot(makeSlot(badIndex))).rejects.toBeInstanceOf(RangeError);

      expect(snapshotLocalStorage()).toEqual(before);
    },
  );

  it('[TC-SAVE-05] quota error on first write retries without thumbnail and keeps using real localStorage', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    failFirstSetItemWithQuota();

    const slot = makeSlot(1);
    await expect(adapter.saveSlot(slot)).resolves.toBeUndefined();

    const stored = parseSlots(localStorage.getItem(SLOTS_KEY));
    expect(stored[0]).toEqual({ ...slot, thumbnailDataUrl: '' });
    expect(adapter.getSlots()[0]?.thumbnailDataUrl).toBe('');

    // Fallback memory KHÔNG được bật: lần ghi sau vẫn đi vào localStorage thật.
    adapter.saveSeenDialogue('intro#0');
    const seenRaw = localStorage.getItem(SEEN_KEY);
    expect(seenRaw).not.toBeNull();
    expect(JSON.parse(seenRaw ?? '[]')).toEqual(['intro#0']);
  });

  it('[TC-SAVE-05] quota retry only strips the thumbnail of the slot being saved', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    const existing = makeSlot(2);
    await adapter.saveSlot(existing);
    failFirstSetItemWithQuota();

    await adapter.saveSlot(makeSlot(1));

    const stored = parseSlots(localStorage.getItem(SLOTS_KEY));
    expect(stored[0]?.thumbnailDataUrl).toBe('');
    expect(stored[1]).toEqual(existing);
  });

  it('[TC-SAVE-05] saveQuickSave retries without thumbnail on first quota error', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    failFirstSetItemWithQuota();

    const quick = makeSlot(0);
    await expect(adapter.saveQuickSave(quick)).resolves.toBeUndefined();

    const raw = localStorage.getItem(QUICK_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? 'null')).toEqual({ ...quick, thumbnailDataUrl: '' });
  });

  it('[TC-SAVE-06] saveSlot and saveQuickSave reject StorageQuotaError when quota is always exceeded', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    await expect(adapter.saveSlot(makeSlot(1))).rejects.toBeInstanceOf(StorageQuotaError);
    await expect(adapter.saveQuickSave(makeSlot(0))).rejects.toBeInstanceOf(StorageQuotaError);
    await expect(adapter.saveSlot(makeSlot(0))).rejects.toBeInstanceOf(StorageQuotaError);

    // Không chuyển âm thầm sang memory: không có slot "ma" nào được đọc lại.
    expect(adapter.getSlots()[0]).toBeNull();
    expect(adapter.getQuickSave()).toBeNull();
  });

  it('[TC-SAVE-06] StorageQuotaError carries the key and a stable name', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    let caught: unknown = null;
    try {
      await adapter.saveSlot(makeSlot(1));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StorageQuotaError);
    expect(caught).toBeInstanceOf(Error);
    if (caught instanceof StorageQuotaError) {
      expect(caught.name).toBe('StorageQuotaError');
      expect(caught.key).toBe(SLOTS_KEY);
    }
  });

  it('[TC-SAVE-08] SecurityError on setItem still falls back to memory without throwing', async () => {
    const adapter = new StorageAdapter({ projectId: 'p1', isPreview: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    const slot = makeSlot(1);
    await expect(adapter.saveSlot(slot)).resolves.toBeUndefined();
    expect(await adapter.loadSlot(1)).toEqual(slot);

    const quick = makeSlot(0);
    await expect(adapter.saveQuickSave(quick)).resolves.toBeUndefined();
    expect(adapter.getQuickSave()).toEqual(quick);

    expect(() => adapter.saveSeenDialogue('intro#0')).not.toThrow();
    expect(adapter.getSeenDialogues().has('intro#0')).toBe(true);
  });

  describe('[TC-SAVE-09] isQuotaExceededError', () => {
    function domExceptionWithCode(name: string, code: number): DOMException {
      const err = new DOMException('quota', name);
      Object.defineProperty(err, 'code', { value: code, configurable: true });
      return err;
    }

    it('returns true for Chromium QuotaExceededError', () => {
      expect(isQuotaExceededError(new DOMException('quota', 'QuotaExceededError'))).toBe(true);
    });

    it('returns true for Firefox NS_ERROR_DOM_QUOTA_REACHED', () => {
      expect(isQuotaExceededError(new DOMException('quota', 'NS_ERROR_DOM_QUOTA_REACHED'))).toBe(
        true,
      );
    });

    it('returns true for a DOMException with legacy code 22 and a non-standard name', () => {
      const err = domExceptionWithCode('LegacyQuotaError', 22);
      expect(err.code).toBe(22);
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('returns true for a DOMException with Firefox code 1014', () => {
      const err = domExceptionWithCode('LegacyFirefoxQuota', 1014);
      expect(err.code).toBe(1014);
      expect(isQuotaExceededError(err)).toBe(true);
    });

    it('returns false for a plain Error, SecurityError, and non-error values', () => {
      expect(isQuotaExceededError(new Error('QuotaExceededError'))).toBe(false);
      expect(isQuotaExceededError(new DOMException('blocked', 'SecurityError'))).toBe(false);
      expect(isQuotaExceededError({ name: 'QuotaExceededError', code: 22 })).toBe(false);
      expect(isQuotaExceededError(null)).toBe(false);
      expect(isQuotaExceededError(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// TASK-title-branding-and-saveload-system, Phase T1 (§3.2, §4 T1)
// deleteSlot(0..6) và getMostRecentSave() trên localStorage THẬT của jsdom.
//
// Quy tắc hòa timestamp (tie rule) chốt ở đây: khi nhiều save cùng có timestamp
// lớn nhất, getMostRecentSave() trả về save tìm thấy ĐẦU TIÊN theo thứ tự
// quicksave (slot 0), rồi slot 1, 2, ..., 6 (chỉ thay khi lớn hơn hẳn).
// ============================================================================

describe('title task: deleteSlot & getMostRecentSave', () => {
  const OPTIONS = { projectId: 'p1' } as const;
  const PREFIX = 'vn_engine_player_p1';
  const SLOTS_KEY = `${PREFIX}_save_slots`;
  const QUICK_KEY = `${PREFIX}_quicksave`;

  function makeSlot(slotIndex: number, overrides: Partial<SaveSlotData> = {}): SaveSlotData {
    return {
      slotIndex,
      timestamp: 1000 + slotIndex,
      thumbnailDataUrl: `data:image/jpeg;base64,thumb${slotIndex}`,
      currentScene: `scene_${slotIndex}`,
      previewText: `Slot ${slotIndex}`,
      dialogueCounter: slotIndex,
      serializedState: `{"slot":${slotIndex}}`,
      ...overrides,
    };
  }

  function snapshotLocalStorage(): Record<string, string | null> {
    const snapshot: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) snapshot[key] = localStorage.getItem(key);
    }
    return snapshot;
  }

  /** Ghi quicksave + slot 1..6; trả về mảng theo index 0..6. */
  async function fillAll(adapter: StorageAdapter): Promise<SaveSlotData[]> {
    const saved: SaveSlotData[] = [];
    const quick = makeSlot(0);
    await adapter.saveQuickSave(quick);
    saved.push(quick);
    for (let i = 1; i <= 6; i++) {
      const slot = makeSlot(i);
      await adapter.saveSlot(slot);
      saved.push(slot);
    }
    return saved;
  }

  beforeEach(() => {
    // Gỡ stub localStorage của describe 'StorageAdapter', dùng Storage thật của jsdom.
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe('deleteSlot', () => {
    it('[TC-T1-01] deleteSlot(3) clears only slot 3; slots 1,2,4,5,6 and quicksave are unchanged', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      const saved = await fillAll(adapter);
      const quickRawBefore = localStorage.getItem(QUICK_KEY);

      await adapter.deleteSlot(3);

      const slots = adapter.getSlots();
      expect(slots).toHaveLength(6);
      expect(slots[2]).toBeNull();
      expect(await adapter.loadSlot(3)).toBeNull();
      for (const i of [1, 2, 4, 5, 6]) {
        expect(slots[i - 1]).toEqual(saved[i]);
      }
      expect(adapter.getQuickSave()).toEqual(saved[0]);
      expect(localStorage.getItem(QUICK_KEY)).toBe(quickRawBefore);
    });

    it('[TC-T1-02] deleteSlot(0) removes the quicksave key and leaves regular slots untouched', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      const saved = await fillAll(adapter);
      const slotsRawBefore = localStorage.getItem(SLOTS_KEY);

      await adapter.deleteSlot(0);

      expect(adapter.getQuickSave()).toBeNull();
      expect(await adapter.loadSlot(0)).toBeNull();
      expect(localStorage.getItem(QUICK_KEY)).toBeNull();
      expect(Object.keys(snapshotLocalStorage())).not.toContain(QUICK_KEY);
      expect(localStorage.getItem(SLOTS_KEY)).toBe(slotsRawBefore);
      expect(adapter.getSlots()).toEqual(saved.slice(1));
    });

    it.each([7, -1, 1.5, Number.NaN])(
      'deleteSlot(%s) rejects with RangeError and leaves storage unchanged',
      async invalidIndex => {
        const adapter = new StorageAdapter(OPTIONS);
        await fillAll(adapter);
        const before = snapshotLocalStorage();

        await expect(adapter.deleteSlot(invalidIndex)).rejects.toBeInstanceOf(RangeError);

        expect(snapshotLocalStorage()).toEqual(before);
      },
    );

    it('deleting an already-empty regular slot resolves and changes nothing', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await adapter.saveSlot(makeSlot(1));
      await adapter.saveQuickSave(makeSlot(0));
      const before = snapshotLocalStorage();

      await expect(adapter.deleteSlot(4)).resolves.toBeUndefined();

      expect(snapshotLocalStorage()).toEqual(before);
    });

    it('deleting the quicksave when none exists resolves and changes nothing', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await adapter.saveSlot(makeSlot(2));
      const before = snapshotLocalStorage();

      await expect(adapter.deleteSlot(0)).resolves.toBeUndefined();

      expect(snapshotLocalStorage()).toEqual(before);
    });

    it('deleteSlot on fully empty storage resolves for every valid index', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      for (let i = 0; i <= 6; i++) {
        await expect(adapter.deleteSlot(i)).resolves.toBeUndefined();
      }
      expect(adapter.getQuickSave()).toBeNull();
      expect(adapter.getSlots()).toEqual([null, null, null, null, null, null]);
    });

    it('deletion persists: a fresh StorageAdapter with the same options sees it', async () => {
      const writer = new StorageAdapter(OPTIONS);
      const saved = await fillAll(writer);

      await writer.deleteSlot(5);
      await writer.deleteSlot(0);

      const reader = new StorageAdapter(OPTIONS);
      expect(reader.getQuickSave()).toBeNull();
      const slots = reader.getSlots();
      expect(slots[4]).toBeNull();
      for (const i of [1, 2, 3, 4, 6]) {
        expect(slots[i - 1]).toEqual(saved[i]);
      }
    });

    it('only touches its own project partition (ADR-024)', async () => {
      const mine = new StorageAdapter(OPTIONS);
      const other = new StorageAdapter({ projectId: 'p2' });
      await mine.saveSlot(makeSlot(3));
      await other.saveSlot(makeSlot(3));
      await other.saveQuickSave(makeSlot(0));

      await mine.deleteSlot(3);
      await mine.deleteSlot(0);

      expect(other.getSlots()[2]).toEqual(makeSlot(3));
      expect(other.getQuickSave()).toEqual(makeSlot(0));
    });
  });

  describe('getMostRecentSave', () => {
    it('[TC-T1-04] returns null on empty storage', () => {
      const adapter = new StorageAdapter(OPTIONS);
      expect(adapter.getMostRecentSave()).toBeNull();
    });

    it('[TC-T1-04] returns the quicksave when it is the only save', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      const quick = makeSlot(0, { timestamp: 42 });
      await adapter.saveQuickSave(quick);

      expect(adapter.getMostRecentSave()).toEqual(quick);
    });

    it('returns the only regular slot when no quicksave exists', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      const slot = makeSlot(6, { timestamp: 7 });
      await adapter.saveSlot(slot);

      expect(adapter.getMostRecentSave()).toEqual(slot);
    });

    it('[TC-T1-03] picks the quicksave when it has the greatest timestamp', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await fillAll(adapter);
      const quick = makeSlot(0, { timestamp: 9999, previewText: 'newest quick' });
      await adapter.saveQuickSave(quick);

      expect(adapter.getMostRecentSave()).toEqual(quick);
    });

    it('[TC-T1-03] picks a regular slot when it has the greatest timestamp', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await fillAll(adapter);
      const newest = makeSlot(4, { timestamp: 9999, previewText: 'newest slot 4' });
      await adapter.saveSlot(newest);

      expect(adapter.getMostRecentSave()).toEqual(newest);
    });

    it('[TC-T1-03] is driven by timestamp, not slot order (newest in slot 1)', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await adapter.saveQuickSave(makeSlot(0, { timestamp: 100 }));
      const newest = makeSlot(1, { timestamp: 500 });
      await adapter.saveSlot(newest);
      await adapter.saveSlot(makeSlot(6, { timestamp: 300 }));

      expect(adapter.getMostRecentSave()).toEqual(newest);
    });

    it('tie rule: quicksave wins a timestamp tie against regular slots', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      const quick = makeSlot(0, { timestamp: 5000 });
      await adapter.saveSlot(makeSlot(2, { timestamp: 5000 }));
      await adapter.saveQuickSave(quick);
      await adapter.saveSlot(makeSlot(5, { timestamp: 5000 }));

      expect(adapter.getMostRecentSave()).toEqual(quick);
    });

    it('tie rule: among regular slots the lowest slot index wins', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await adapter.saveQuickSave(makeSlot(0, { timestamp: 10 }));
      await adapter.saveSlot(makeSlot(5, { timestamp: 5000 }));
      const lowest = makeSlot(3, { timestamp: 5000 });
      await adapter.saveSlot(lowest);

      expect(adapter.getMostRecentSave()).toEqual(lowest);
    });

    it('reflects deletions: after deleting the newest save, the next newest is returned', async () => {
      const adapter = new StorageAdapter(OPTIONS);
      await adapter.saveQuickSave(makeSlot(0, { timestamp: 300 }));
      await adapter.saveSlot(makeSlot(2, { timestamp: 900 }));
      const second = makeSlot(4, { timestamp: 600 });
      await adapter.saveSlot(second);

      await adapter.deleteSlot(2);
      expect(adapter.getMostRecentSave()).toEqual(second);

      await adapter.deleteSlot(4);
      await adapter.deleteSlot(0);
      expect(adapter.getMostRecentSave()).toBeNull();
    });
  });

  describe('KernelAdapters.storage contract (§3.2)', () => {
    type StorageContract = NonNullable<KernelAdapters['storage']>;

    it('declares optional deleteSlot/getMostRecentSave with the spec signatures', () => {
      expectTypeOf<NonNullable<StorageContract['deleteSlot']>>().toEqualTypeOf<
        (slotIndex: number) => Promise<void>
      >();
      expectTypeOf<NonNullable<StorageContract['getMostRecentSave']>>().toEqualTypeOf<
        () => SaveSlotData | null
      >();
    });

    it('StorageAdapter is assignable to KernelAdapters.storage and exposes both methods', () => {
      const storage: StorageContract = new StorageAdapter(OPTIONS);
      expect(typeof storage.deleteSlot).toBe('function');
      expect(typeof storage.getMostRecentSave).toBe('function');
    });
  });
});
