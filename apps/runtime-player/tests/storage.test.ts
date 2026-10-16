import { describe, it, expect, beforeEach } from 'vitest';
import { GameStorage, TOTAL_SLOTS } from '../src/storage';

// In-memory mock for localStorage in NodeJS test environment
let mockStore: Record<string, string> = {};
const mockLocalStorage: Storage = {
  getItem: (key: string) => mockStore[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStore[key];
  },
  clear: () => {
    mockStore = {};
  },
  get length() {
    return Object.keys(mockStore).length;
  },
  key: (index: number) => Object.keys(mockStore)[index] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

describe('GameStorage Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    GameStorage.setProjectId(null);
  });

  it('initializes with array of null slots', () => {
    const slots = GameStorage.getSlots();
    expect(slots.length).toBe(TOTAL_SLOTS);
    expect(slots.every(s => s === null)).toBe(true);
  });

  it('saves and loads slot data properly', () => {
    const testData = {
      timestamp: 1234567890,
      sceneName: 'scene_intro',
      thumbnail: 'data:image/png;base64,sample',
      vmStateJson: '{"variables":{}}',
      dialoguePreview: 'Hello world',
    };

    GameStorage.saveSlot(2, testData);
    const loaded = GameStorage.loadSlot(2);

    expect(loaded).not.toBeNull();
    expect(loaded?.slotIndex).toBe(2);
    expect(loaded?.sceneName).toBe('scene_intro');
    expect(loaded?.dialoguePreview).toBe('Hello world');

    // Slot 1 should still be empty
    expect(GameStorage.loadSlot(1)).toBeNull();
  });

  it('isolates save slots between different project IDs', () => {
    GameStorage.setProjectId('proj_a');
    GameStorage.saveSlot(0, {
      timestamp: 1000,
      sceneName: 'scene_a',
      thumbnail: '',
      vmStateJson: '{}',
      dialoguePreview: 'A',
    });

    GameStorage.setProjectId('proj_b');
    expect(GameStorage.loadSlot(0)).toBeNull();

    GameStorage.setProjectId('proj_a');
    expect(GameStorage.loadSlot(0)?.sceneName).toBe('scene_a');
  });

  it('manages quick saves and quick loads', () => {
    expect(GameStorage.quickLoad()).toBeNull();

    GameStorage.quickSave({
      timestamp: 2000,
      sceneName: 'scene_quick',
      thumbnail: '',
      vmStateJson: '{}',
      dialoguePreview: 'Quick save test',
    });

    const loaded = GameStorage.quickLoad();
    expect(loaded).not.toBeNull();
    expect(loaded?.sceneName).toBe('scene_quick');
  });

  it('tracks seen dialogues correctly', () => {
    const seen = new Set(['line_1', 'line_2']);
    GameStorage.saveSeenDialogues(seen);

    const loadedSeen = GameStorage.getSeenDialogues();
    expect(loadedSeen.has('line_1')).toBe(true);
    expect(loadedSeen.has('line_2')).toBe(true);
    expect(loadedSeen.has('line_3')).toBe(false);

    GameStorage.clearSeenDialogues();
    expect(GameStorage.getSeenDialogues().size).toBe(0);
  });

  it('isolates save slots, quicksave, and seen dialogues between Standalone and Preview modes', () => {
    GameStorage.setProjectId('proj_demo');
    GameStorage.setPreviewMode(false); // Standalone mode

    GameStorage.saveSlot(0, {
      timestamp: 1000,
      sceneName: 'standalone_scene',
      thumbnail: '',
      vmStateJson: '{"mode":"standalone"}',
      dialoguePreview: 'Standalone text',
    });
    GameStorage.quickSave({
      timestamp: 1001,
      sceneName: 'standalone_quick',
      thumbnail: '',
      vmStateJson: '{"quick":true}',
      dialoguePreview: 'Standalone quick text',
    });
    GameStorage.saveSeenDialogues(new Set(['dialogue_standalone']));

    // Switch to Preview mode for the same project ID
    GameStorage.setPreviewMode(true);
    expect(GameStorage.isPreview()).toBe(true);

    // Preview mode should have fresh slots
    expect(GameStorage.loadSlot(0)).toBeNull();
    expect(GameStorage.quickLoad()).toBeNull();
    expect(GameStorage.getSeenDialogues().has('dialogue_standalone')).toBe(false);

    // Save in Preview mode
    GameStorage.saveSlot(0, {
      timestamp: 2000,
      sceneName: 'preview_scene',
      thumbnail: '',
      vmStateJson: '{"mode":"preview"}',
      dialoguePreview: 'Preview text',
    });
    GameStorage.quickSave({
      timestamp: 2001,
      sceneName: 'preview_quick',
      thumbnail: '',
      vmStateJson: '{"quick_preview":true}',
      dialoguePreview: 'Preview quick text',
    });
    GameStorage.saveSeenDialogues(new Set(['dialogue_preview']));

    expect(GameStorage.loadSlot(0)?.sceneName).toBe('preview_scene');
    expect(GameStorage.quickLoad()?.sceneName).toBe('preview_quick');
    expect(GameStorage.getSeenDialogues().has('dialogue_preview')).toBe(true);

    // Switch back to Standalone mode: original standalone data remains intact!
    GameStorage.setPreviewMode(false);
    expect(GameStorage.isPreview()).toBe(false);
    expect(GameStorage.loadSlot(0)?.sceneName).toBe('standalone_scene');
    expect(GameStorage.quickLoad()?.sceneName).toBe('standalone_quick');
    expect(GameStorage.getSeenDialogues().has('dialogue_standalone')).toBe(true);
    expect(GameStorage.getSeenDialogues().has('dialogue_preview')).toBe(false);
  });
});
