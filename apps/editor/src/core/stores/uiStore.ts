import { create } from 'zustand';

export type PendingNavigationTarget =
  | { type: 'project-hub' }
  | { type: 'close-tab'; fileId: string }
  | { type: 'switch-tab'; fileId: string };

export interface EditorUIStoreState {
  // Layout Dimensions (Persisted in localStorage)
  navWidth: number; // Default: 260px (Range: 200px - 450px)
  previewWidth: number; // Default: 440px (Range: 320px - 720px)
  drawerHeight: number; // Default: 200px (Range: 120px - 480px)

  // Workspace Navigation
  activeTab: 'scripts' | 'characters' | 'assets' | null;
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

  setActiveTab: (tab: 'scripts' | 'characters' | 'assets' | null) => void;
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
      previewWidth: typeof parsed.previewWidth === 'number' ? parsed.previewWidth : defaults.previewWidth,
      drawerHeight: typeof parsed.drawerHeight === 'number' ? parsed.drawerHeight : defaults.drawerHeight,
    };
  } catch {
    return defaults;
  }
}

function persistDimensions(dims: { navWidth: number; previewWidth: number; drawerHeight: number }): void {
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
    return Math.max(window.innerWidth - 400, 520); // 200 minNav + 320 minPreview
  }
  return 1520; // 1920 - 400 default
}

export const useEditorUIStore = create<EditorUIStoreState>((set, get) => ({
  ...initialUIState,

  setNavWidth: (width) => {
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

  setPreviewWidth: (width) => {
    const maxCombined = getMaxCombinedWidth();
    const maxPreviewAllowed = Math.max(320, Math.min(720, maxCombined - 200));
    const clampedPreview = clamp(width, 320, maxPreviewAllowed);
    let currentNav = get().navWidth;

    if (currentNav + clampedPreview > maxCombined) {
      currentNav = clamp(maxCombined - clampedPreview, 200, 450);
    }

    set({ navWidth: currentNav, previewWidth: clampedPreview });
    persistDimensions({
      navWidth: currentNav,
      previewWidth: clampedPreview,
      drawerHeight: get().drawerHeight,
    });
  },

  setDrawerHeight: (height) => {
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
    let { navWidth, previewWidth, drawerHeight } = get();

    if (navWidth + previewWidth > maxCombined) {
      const remainingForPreview = maxCombined - navWidth;
      if (remainingForPreview >= 320) {
        previewWidth = remainingForPreview;
      } else {
        previewWidth = 320;
        navWidth = clamp(maxCombined - 320, 200, 450);
      }
      set({ navWidth, previewWidth });
      persistDimensions({
        navWidth,
        previewWidth,
        drawerHeight,
      });
    }
  },

  resetDimensions: () => {
    const defaults = { navWidth: 260, previewWidth: 440, drawerHeight: 200 };
    set(defaults);
    persistDimensions(defaults);
  },

  setActiveTab: (activeTab) => set({ activeTab }),

  selectTab: (fileId) =>
    set((state) => {
      const openFileIds = state.openFileIds.includes(fileId)
        ? state.openFileIds
        : [...state.openFileIds, fileId];
      return {
        openFileIds,
        activeFileId: fileId,
      };
    }),

  closeTab: (fileId) =>
    set((state) => {
      const openFileIds = state.openFileIds.filter((id) => id !== fileId);
      let activeFileId = state.activeFileId;

      if (activeFileId === fileId) {
        activeFileId = openFileIds.length > 0 ? (openFileIds[openFileIds.length - 1] ?? null) : null;
      }

      return {
        openFileIds,
        activeFileId,
      };
    }),

  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

  setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),

  setCursorJumpTarget: (cursorJumpTarget) => set({ cursorJumpTarget }),

  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),

  toggleShortcuts: () => set((state) => ({ isShortcutsOpen: !state.isShortcutsOpen })),

  setShortcutsOpen: (isShortcutsOpen) => set({ isShortcutsOpen }),

  setLightboxImageUrl: (lightboxImageUrl) => set({ lightboxImageUrl }),

  triggerUnsavedGuard: (pendingNavigationTarget) =>
    set({
      isUnsavedModalOpen: true,
      pendingNavigationTarget,
    }),

  resolveUnsavedGuard: (_proceed) =>
    set({
      isUnsavedModalOpen: false,
      pendingNavigationTarget: null,
    }),
}));

export const useUIStore = useEditorUIStore;
