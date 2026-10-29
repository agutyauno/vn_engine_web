// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEditorUIStore, useUIStore } from '../../src/core/stores/uiStore';
import { setupTestStore } from '../testStoreHelpers';

describe('uiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Default window.innerWidth to 1920
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    setupTestStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('exports both useEditorUIStore and useUIStore as aliases', () => {
    expect(useEditorUIStore).toBe(useUIStore);
  });

  it('clamps navWidth within 200px - 450px and persists to localStorage', () => {
    useEditorUIStore.getState().setNavWidth(100);
    expect(useEditorUIStore.getState().navWidth).toBe(200);

    useEditorUIStore.getState().setNavWidth(500);
    expect(useEditorUIStore.getState().navWidth).toBe(450);

    useEditorUIStore.getState().setNavWidth(300);
    expect(useEditorUIStore.getState().navWidth).toBe(300);

    const saved = JSON.parse(localStorage.getItem('vn_editor_layout_dims') || '{}');
    expect(saved.navWidth).toBe(300);
  });

  it('clamps previewWidth within 320px - 720px and persists to localStorage', () => {
    useEditorUIStore.getState().setPreviewWidth(250);
    expect(useEditorUIStore.getState().previewWidth).toBe(320);

    useEditorUIStore.getState().setPreviewWidth(800);
    expect(useEditorUIStore.getState().previewWidth).toBe(720);

    useEditorUIStore.getState().setPreviewWidth(550);
    expect(useEditorUIStore.getState().previewWidth).toBe(550);

    const saved = JSON.parse(localStorage.getItem('vn_editor_layout_dims') || '{}');
    expect(saved.previewWidth).toBe(550);
  });

  it('clamps drawerHeight within 120px - 480px and persists to localStorage', () => {
    useEditorUIStore.getState().setDrawerHeight(50);
    expect(useEditorUIStore.getState().drawerHeight).toBe(120);

    useEditorUIStore.getState().setDrawerHeight(600);
    expect(useEditorUIStore.getState().drawerHeight).toBe(480);

    useEditorUIStore.getState().setDrawerHeight(300);
    expect(useEditorUIStore.getState().drawerHeight).toBe(300);

    const saved = JSON.parse(localStorage.getItem('vn_editor_layout_dims') || '{}');
    expect(saved.drawerHeight).toBe(300);
  });

  it('enforces composite width bounds to preserve minimum 400px center Monaco editor', () => {
    // Window width = 1000px, max combined width = 1000 - 400 = 600px
    Object.defineProperty(window, 'innerWidth', { value: 1000 });

    useEditorUIStore.getState().setNavWidth(350);
    // Setting previewWidth to 500 would make nav+preview = 850px > 600px
    useEditorUIStore.getState().setPreviewWidth(500);

    const state = useEditorUIStore.getState();
    expect(state.navWidth + state.previewWidth).toBeLessThanOrEqual(600);
  });

  it('re-evaluates composite width bounds on clampCompositeBounds upon resize', () => {
    useEditorUIStore.getState().setNavWidth(400);
    useEditorUIStore.getState().setPreviewWidth(600);
    // Initially window is 1920, nav+preview = 1000 <= 1520. Valid.

    // Shrink window to 1200px -> center guarantee allows max 800px combined
    Object.defineProperty(window, 'innerWidth', { value: 1200 });
    useEditorUIStore.getState().clampCompositeBounds();

    const state = useEditorUIStore.getState();
    expect(state.navWidth + state.previewWidth).toBeLessThanOrEqual(800);
  });

  it('resets dimensions to defaults upon resetDimensions', () => {
    useEditorUIStore.getState().setNavWidth(350);
    useEditorUIStore.getState().setPreviewWidth(600);
    useEditorUIStore.getState().setDrawerHeight(350);

    useEditorUIStore.getState().resetDimensions();

    const state = useEditorUIStore.getState();
    expect(state.navWidth).toBe(260);
    expect(state.previewWidth).toBe(440);
    expect(state.drawerHeight).toBe(200);
  });

  it('manages activeTab, selectTab, and closeTab', () => {
    useEditorUIStore.getState().setActiveTab('characters');
    expect(useEditorUIStore.getState().activeTab).toBe('characters');

    useEditorUIStore.getState().selectTab('file-1');
    expect(useEditorUIStore.getState().openFileIds).toContain('file-1');
    expect(useEditorUIStore.getState().activeFileId).toBe('file-1');

    useEditorUIStore.getState().selectTab('file-2');
    expect(useEditorUIStore.getState().openFileIds).toEqual(['file-1', 'file-2']);
    expect(useEditorUIStore.getState().activeFileId).toBe('file-2');

    // Close active tab file-2 -> shifts focus to file-1
    useEditorUIStore.getState().closeTab('file-2');
    expect(useEditorUIStore.getState().openFileIds).toEqual(['file-1']);
    expect(useEditorUIStore.getState().activeFileId).toBe('file-1');
  });

  it('manages modal visibility and direct setters', () => {
    expect(useEditorUIStore.getState().isSettingsOpen).toBe(false);
    useEditorUIStore.getState().toggleSettings();
    expect(useEditorUIStore.getState().isSettingsOpen).toBe(true);
    useEditorUIStore.getState().setSettingsOpen(false);
    expect(useEditorUIStore.getState().isSettingsOpen).toBe(false);

    useEditorUIStore.getState().toggleShortcuts();
    expect(useEditorUIStore.getState().isShortcutsOpen).toBe(true);

    useEditorUIStore.getState().toggleDrawer();
    expect(useEditorUIStore.getState().isDrawerOpen).toBe(true);

    useEditorUIStore.getState().setCursorJumpTarget({ line: 15, col: 4 });
    expect(useEditorUIStore.getState().cursorJumpTarget).toEqual({ line: 15, col: 4 });

    useEditorUIStore.getState().setLightboxImageUrl('/images/bg.png');
    expect(useEditorUIStore.getState().lightboxImageUrl).toBe('/images/bg.png');
    useEditorUIStore.getState().setLightboxImageUrl(null);
    expect(useEditorUIStore.getState().lightboxImageUrl).toBeNull();
  });

  it('handles declarative navigation targets and unsaved guard modal', () => {
    useEditorUIStore.getState().triggerUnsavedGuard({ type: 'project-hub' });

    let state = useEditorUIStore.getState();
    expect(state.isUnsavedModalOpen).toBe(true);
    expect(state.pendingNavigationTarget).toEqual({ type: 'project-hub' });

    useEditorUIStore.getState().resolveUnsavedGuard(false);
    state = useEditorUIStore.getState();
    expect(state.isUnsavedModalOpen).toBe(false);
    expect(state.pendingNavigationTarget).toBeNull();
  });
});
