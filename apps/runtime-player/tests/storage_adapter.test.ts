import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageAdapter } from '../src/adapters/StorageAdapter';
import type { SaveSlotData } from '../src/core/contracts';

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
      expect(slots.every((s) => s === null)).toBe(true);
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
