import { create } from 'zustand';
import { normalizeCategoryTab } from '../utils/assetCategories';

export type PendingNavigationTarget =
  | { type: 'project-hub' }
  | { type: 'close-tab'; fileId: string }
  | { type: 'switch-tab'; fileId: string };

export type ViewMode = 'list' | 'grid';

export interface EditorUIStoreState {
  // Layout Dimensions (Persisted in localStorage)
  navWidth: number; // Default: 260px (Range: 200px - 450px)
  previewWidth: number; // Default: 440px (Range: 320px - 720px)
  drawerHeight: number; // Default: 200px (Range: 120px - 480px)

  // Workspace Navigation
  activeTab: 'scripts' | 'assets' | null;
  lastAssetCategory: string; // Default: 'all'
  assetViewMode: ViewMode;
  openFileIds: string[];
  activeFileId: string | null;
  isDrawerOpen: boolean;
  cursorJumpTarget: { line: number; col: number } | null;

  // Modal Visibility & Navigation Guard
  isSettingsOpen: boolean;
  isShortcutsOpen: boolean;
  isUnsavedModalOpen: boolean;
  pendingNavigationTarget: PendingNavigationTarget | null;
  lightboxImageUrl: string | null;

  // Core Actions
  setNavWidth: (width: number) => void;
  setPreviewWidth: (width: number) => void;
  setDrawerHeight: (height: number) => void;
  clampCompositeBounds: () => void;
  resetDimensions: () => void;

  setActiveTab: (tab: 'scripts' | 'assets' | null) => void;
  setLastAssetCategory: (category: string) => void;
  setAssetViewMode: (mode: ViewMode) => void;
  selectTab: (fileId: string) => void;
  closeTab: (fileId: string) => void;

  toggleDrawer: () => void;
  setDrawerOpen: (open: boolean) => void;
  setCursorJumpTarget: (target: { line: number; col: number } | null) => void;

  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleShortcuts: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setLightboxImageUrl: (url: string | null) => void;

  triggerUnsavedGuard: (target: PendingNavigationTarget) => void;
  resolveUnsavedGuard: (proceed: boolean) => void;
}

const STORAGE_KEY = 'vn_editor_layout_dims';
const ASSET_CATEGORY_STORAGE_KEY = 'vn_editor_last_asset_category';
const ASSET_VIEW_MODE_STORAGE_KEY = 'vn_editor_asset_view_mode';

function getInitialViewMode(key: string): ViewMode {
  if (typeof window === 'undefined' || !window.localStorage) return 'list';
  try {
    const val = localStorage.getItem(key);
    return val === 'grid' || val === 'list' ? val : 'list';
  } catch {
    return 'list';
  }
}

function getInitialAssetCategory(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'all';
  }
  try {
    const stored = localStorage.getItem(ASSET_CATEGORY_STORAGE_KEY);
    return normalizeCategoryTab(stored);
  } catch {
    return 'all';
  }
}

function getInitialDimensions(): { navWidth: number; previewWidth: number; drawerHeight: number } {
  const defaults = { navWidth: 260, previewWidth: 440, drawerHeight: 200 };
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      navWidth: typeof parsed.navWidth === 'number' ? parsed.navWidth : defaults.navWidth,
      previewWidth:
        typeof parsed.previewWidth === 'number' ? parsed.previewWidth : defaults.previewWidth,
      drawerHeight:
        typeof parsed.drawerHeight === 'number' ? parsed.drawerHeight : defaults.drawerHeight,
    };
  } catch {
    return defaults;
  }
}

function persistDimensions(dims: {
  navWidth: number;
  previewWidth: number;
  drawerHeight: number;
}): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dims));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

export const initialUIState: Omit<
  EditorUIStoreState,
  | 'setNavWidth'
  | 'setPreviewWidth'
  | 'setDrawerHeight'
  | 'clampCompositeBounds'
  | 'resetDimensions'
  | 'setActiveTab'
  | 'setLastAssetCategory'
  | 'setAssetViewMode'
  | 'selectTab'
  | 'closeTab'
  | 'toggleDrawer'
  | 'setDrawerOpen'
  | 'setCursorJumpTarget'
  | 'toggleSettings'
  | 'setSettingsOpen'
  | 'toggleShortcuts'
  | 'setShortcutsOpen'
  | 'setLightboxImageUrl'
  | 'triggerUnsavedGuard'
  | 'resolveUnsavedGuard'
> = {
  ...getInitialDimensions(),
  lastAssetCategory: getInitialAssetCategory(),
  assetViewMode: getInitialViewMode(ASSET_VIEW_MODE_STORAGE_KEY),
  activeTab: 'scripts',
  openFileIds: [],
  activeFileId: null,
  isDrawerOpen: false,
  cursorJumpTarget: null,
  isSettingsOpen: false,
  isShortcutsOpen: false,
  isUnsavedModalOpen: false,
  pendingNavigationTarget: null,
  lightboxImageUrl: null,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getMaxCombinedWidth(): number {
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
    return Math.max(window.innerWidth - 400, 520);
  }
  return 1520;
}

export const useEditorUIStore = create<EditorUIStoreState>((set, get) => ({
  ...initialUIState,

  setNavWidth: width => {
    const maxCombined = getMaxCombinedWidth();
    const maxNavAllowed = Math.max(200, Math.min(450, maxCombined - 320));
    const clampedNav = clamp(width, 200, maxNavAllowed);
    const currentPreview = get().previewWidth;

    let adjustedPreview = currentPreview;
    if (clampedNav + currentPreview > maxCombined) {
      adjustedPreview = clamp(maxCombined - clampedNav, 320, 720);
    }

    set({ navWidth: clampedNav, previewWidth: adjustedPreview });
    persistDimensions({
      navWidth: clampedNav,
      previewWidth: adjustedPreview,
      drawerHeight: get().drawerHeight,
    });
  },

  setPreviewWidth: width => {
    const maxCombined = getMaxCombinedWidth();
    const maxPreviewAllowed = Math.max(320, Math.min(720, maxCombined - 200));
    const clampedPreview = clamp(width, 320, maxPreviewAllowed);
    const currentNav = get().navWidth;

    let adjustedNav = currentNav;
    if (currentNav + clampedPreview > maxCombined) {
      adjustedNav = clamp(maxCombined - clampedPreview, 200, 450);
    }

    set({ previewWidth: clampedPreview, navWidth: adjustedNav });
    persistDimensions({
      navWidth: adjustedNav,
      previewWidth: clampedPreview,
      drawerHeight: get().drawerHeight,
    });
  },

  setDrawerHeight: height => {
    const clamped = clamp(height, 120, 480);
    set({ drawerHeight: clamped });
    persistDimensions({
      navWidth: get().navWidth,
      previewWidth: get().previewWidth,
      drawerHeight: clamped,
    });
  },

  clampCompositeBounds: () => {
    const maxCombined = getMaxCombinedWidth();
    const currentNav = get().navWidth;
    const currentPreview = get().previewWidth;

    if (currentNav + currentPreview > maxCombined) {
      const clampedNav = clamp(currentNav, 200, Math.min(450, maxCombined - 320));
      const clampedPreview = clamp(maxCombined - clampedNav, 320, 720);
      set({ navWidth: clampedNav, previewWidth: clampedPreview });
      persistDimensions({
        navWidth: clampedNav,
        previewWidth: clampedPreview,
        drawerHeight: get().drawerHeight,
      });
    }
  },

  resetDimensions: () => {
    const defaults = { navWidth: 260, previewWidth: 440, drawerHeight: 200 };
    set(defaults);
    persistDimensions(defaults);
  },

  setActiveTab: tab => set({ activeTab: tab }),

  setLastAssetCategory: category => {
    const normalized = normalizeCategoryTab(category);
    set({ lastAssetCategory: normalized });
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(ASSET_CATEGORY_STORAGE_KEY, normalized);
      } catch {
        // Ignore
      }
    }
  },

  setAssetViewMode: mode => {
    set({ assetViewMode: mode });
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(ASSET_VIEW_MODE_STORAGE_KEY, mode);
      } catch {
        // Ignore
      }
    }
  },

  selectTab: fileId => {
    const { openFileIds } = get();
    if (!openFileIds.includes(fileId)) {
      set({
        openFileIds: [...openFileIds, fileId],
        activeFileId: fileId,
      });
    } else {
      set({ activeFileId: fileId });
    }
  },

  closeTab: fileId => {
    const { openFileIds, activeFileId } = get();
    const newOpenFileIds = openFileIds.filter(id => id !== fileId);

    let nextActiveId = activeFileId;
    if (activeFileId === fileId) {
      if (newOpenFileIds.length > 0) {
        const closedIndex = openFileIds.indexOf(fileId);
        const nextIndex = Math.max(0, closedIndex - 1);
        nextActiveId = newOpenFileIds[nextIndex] || null;
      } else {
        nextActiveId = null;
      }
    }

    set({
      openFileIds: newOpenFileIds,
      activeFileId: nextActiveId,
    });
  },

  toggleDrawer: () => set(state => ({ isDrawerOpen: !state.isDrawerOpen })),
  setDrawerOpen: open => set({ isDrawerOpen: open }),
  setCursorJumpTarget: target => set({ cursorJumpTarget: target }),

  toggleSettings: () => set(state => ({ isSettingsOpen: !state.isSettingsOpen })),
  setSettingsOpen: open => set({ isSettingsOpen: open }),
  toggleShortcuts: () => set(state => ({ isShortcutsOpen: !state.isShortcutsOpen })),
  setShortcutsOpen: open => set({ isShortcutsOpen: open }),
  setLightboxImageUrl: url => set({ lightboxImageUrl: url }),

  triggerUnsavedGuard: target => set({ pendingNavigationTarget: target, isUnsavedModalOpen: true }),
  resolveUnsavedGuard: () => set({ pendingNavigationTarget: null, isUnsavedModalOpen: false }),
}));

export const useUIStore = useEditorUIStore;

