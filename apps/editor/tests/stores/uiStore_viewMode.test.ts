// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEditorUIStore } from '../../src/core/stores/uiStore';
import { setupTestStore } from '../testStoreHelpers';

describe('uiStore viewMode', () => {
  beforeEach(() => {
    localStorage.clear();
    setupTestStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('TC-STORE-VIEW-01: Asset and character viewMode persistence and actions', () => {
    it('initializes with default list viewMode for both asset and character', () => {
      const state = useEditorUIStore.getState();
      expect((state as any).assetViewMode).toBe('list');
      expect((state as any).characterViewMode).toBe('list');
    });

    it('updates assetViewMode to grid and persists to localStorage', () => {
      (useEditorUIStore.getState() as any).setAssetViewMode('grid');

      expect((useEditorUIStore.getState() as any).assetViewMode).toBe('grid');
      expect(localStorage.getItem('vn_editor_asset_view_mode')).toBe('grid');
    });

    it('updates characterViewMode to grid and persists to localStorage', () => {
      (useEditorUIStore.getState() as any).setCharacterViewMode('grid');

      expect((useEditorUIStore.getState() as any).characterViewMode).toBe('grid');
      expect(localStorage.getItem('vn_editor_character_view_mode')).toBe('grid');
    });

    it('switches viewMode back to list and updates localStorage', () => {
      const store = useEditorUIStore.getState() as any;
      store.setAssetViewMode('grid');
      store.setCharacterViewMode('grid');

      store.setAssetViewMode('list');
      store.setCharacterViewMode('list');

      expect((useEditorUIStore.getState() as any).assetViewMode).toBe('list');
      expect(localStorage.getItem('vn_editor_asset_view_mode')).toBe('list');

      expect((useEditorUIStore.getState() as any).characterViewMode).toBe('list');
      expect(localStorage.getItem('vn_editor_character_view_mode')).toBe('list');
    });
  });
});
