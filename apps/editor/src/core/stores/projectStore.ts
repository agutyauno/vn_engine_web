import { create } from 'zustand';
import type {
  Project,
  ProjectMetadata,
  ProjectDisplaySettings,
  ProjectGameplaySettings,
  ProjectEditorSettings,
  Character,
  AssetRef,
} from '@vn-engine/shared-types';
import type { ProjectRepository } from '../contracts/repository';
import { useDiagnosticsStore } from './diagnosticsStore';

export interface ProjectStoreState {
  project: Project | null;
  isDirty: boolean;
  dirtyFileIds: string[];
  isSaving: boolean;

  initProject: (project: Project, repo?: ProjectRepository) => void;
  setProject: (project: Project) => void;
  setRepository: (repo: ProjectRepository) => void;

  updateFileContent: (fileId: string, content: string) => void;
  saveProject: (repo?: ProjectRepository) => Promise<void>;

  updateProjectMetadata: (metadata: Partial<ProjectMetadata>) => void;
  updateDisplaySettings: (settings: Partial<ProjectDisplaySettings>) => void;
  updateGameplaySettings: (settings: Partial<ProjectGameplaySettings>) => void;
  updateEditorSettings: (settings: Partial<ProjectEditorSettings>) => void;

  createFile: (name: string) => void;
  renameFile: (fileId: string, newName: string) => void;
  duplicateFile: (fileId: string) => void;
  deleteFile: (fileId: string) => void;

  saveCharacter: (char: Character) => void;
  deleteCharacter: (charId: string) => void;

  saveAsset: (asset: AssetRef, blob: Blob) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
}

export const initialProjectState: Omit<
  ProjectStoreState,
  | 'initProject'
  | 'setProject'
  | 'setRepository'
  | 'updateFileContent'
  | 'saveProject'
  | 'updateProjectMetadata'
  | 'updateDisplaySettings'
  | 'updateGameplaySettings'
  | 'updateEditorSettings'
  | 'createFile'
  | 'renameFile'
  | 'duplicateFile'
  | 'deleteFile'
  | 'saveCharacter'
  | 'deleteCharacter'
  | 'saveAsset'
  | 'deleteAsset'
> = {
  project: null,
  isDirty: false,
  dirtyFileIds: [],
  isSaving: false,
};

// Module-scoped state for non-serializable objects and timer handles
let activeRepository: ProjectRepository | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_DISPLAY_SETTINGS: ProjectDisplaySettings = {
  width: 1920,
  height: 1080,
  orientation: 'landscape',
  lockAspectRatio: true,
};

const DEFAULT_GAMEPLAY_SETTINGS: ProjectGameplaySettings = {
  unmetChoiceDisplay: 'disabled',
  textSpeed: 30,
  autoForwardDelay: 2000,
  defaultVolumes: {
    master: 1,
    bgm: 0.8,
    sfx: 0.8,
    voice: 1,
  },
};

const DEFAULT_EDITOR_SETTINGS: ProjectEditorSettings = {
  autoSave: true,
  autoSaveDebounceMs: 1000,
};

function clearAutoSaveTimer(): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

function normalizeVnsExtension(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().endsWith('.vns')) {
    return trimmed;
  }
  return `${trimmed}.vns`;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  ...initialProjectState,

  initProject: (project, repo) => {
    clearAutoSaveTimer();
    if (repo) {
      activeRepository = repo;
    }
    set({
      project,
      isDirty: false,
      dirtyFileIds: [],
      isSaving: false,
    });
  },

  setProject: (project) => {
    clearAutoSaveTimer();
    set({
      project,
      isDirty: false,
      dirtyFileIds: [],
      isSaving: false,
    });
  },

  setRepository: (repo) => {
    activeRepository = repo;
  },

  updateFileContent: (fileId, content) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const fileIndex = currentProject.files.findIndex((f) => f.id === fileId);
    if (fileIndex === -1) return;

    const existingFile = currentProject.files[fileIndex];
    if (!existingFile) return;

    const updatedFile = {
      ...existingFile,
      content,
      version: (existingFile.version || 1) + 1,
    };

    const updatedFiles = [...currentProject.files];
    updatedFiles[fileIndex] = updatedFile;

    const dirtyFileIds = get().dirtyFileIds.includes(fileId)
      ? get().dirtyFileIds
      : [...get().dirtyFileIds, fileId];

    set({
      project: {
        ...currentProject,
        files: updatedFiles,
        updatedAt: Date.now(),
      },
      isDirty: true,
      dirtyFileIds,
    });

    // Schedule debounced auto-save if enabled
    if (currentProject.editorSettings?.autoSave !== false) {
      clearAutoSaveTimer();
      const delayMs = currentProject.editorSettings?.autoSaveDebounceMs ?? 1000;
      autoSaveTimer = setTimeout(() => {
        get().saveProject();
      }, delayMs);
    }
  },

  saveProject: async (repo) => {
    clearAutoSaveTimer();
    const currentProject = get().project;
    if (!currentProject) return;

    const repository = repo ?? activeRepository;
    const snapshottedDirtyIds = [...get().dirtyFileIds];

    set({ isSaving: true });

    try {
      if (repository) {
        await repository.updateProject(currentProject);
      }

      // Snapshot subtraction: remove only the files that were snapshotted
      const remainingDirtyIds = get().dirtyFileIds.filter(
        (id) => !snapshottedDirtyIds.includes(id)
      );

      set({
        dirtyFileIds: remainingDirtyIds,
        isDirty: remainingDirtyIds.length > 0,
      });
    } catch (error) {
      // Retain dirtyFileIds and keep isDirty on error
      set({ isDirty: true });

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save project';
      useDiagnosticsStore.getState().addRuntimeDiagnostic({
        id: `diag-save-${Date.now()}`,
        code: 'E_STORAGE_SAVE',
        message: `Storage Save Failed: ${errorMessage}`,
        severity: 'error',
        category: 'runtime',
        timestamp: Date.now(),
      });
    } finally {
      // Unconditionally release isSaving state
      set({ isSaving: false });
    }
  },

  updateProjectMetadata: (metadata) => {
    const currentProject = get().project;
    if (!currentProject) return;

    set({
      project: {
        ...currentProject,
        ...metadata,
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  updateDisplaySettings: (settings) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const baseDisplay = currentProject.displaySettings ?? DEFAULT_DISPLAY_SETTINGS;
    set({
      project: {
        ...currentProject,
        displaySettings: {
          ...baseDisplay,
          ...settings,
        },
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  updateGameplaySettings: (settings) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const baseGameplay = currentProject.gameplaySettings ?? DEFAULT_GAMEPLAY_SETTINGS;
    set({
      project: {
        ...currentProject,
        gameplaySettings: {
          ...baseGameplay,
          ...settings,
        },
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  updateEditorSettings: (settings) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const baseEditor = currentProject.editorSettings ?? DEFAULT_EDITOR_SETTINGS;
    set({
      project: {
        ...currentProject,
        editorSettings: {
          ...baseEditor,
          ...settings,
        },
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  createFile: (name) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const normalized = normalizeVnsExtension(name);
    const newFileId = generateUUID();
    const newFile = {
      id: newFileId,
      name: normalized,
      content: '',
      order: currentProject.files.length + 1,
      version: 1,
    };

    set({
      project: {
        ...currentProject,
        files: [...currentProject.files, newFile],
        updatedAt: Date.now(),
      },
      dirtyFileIds: [...get().dirtyFileIds, newFileId],
      isDirty: true,
    });
  },

  renameFile: (fileId, newName) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const normalized = normalizeVnsExtension(newName);

    // Check for duplicate filenames
    const exists = currentProject.files.some(
      (f) => f.id !== fileId && f.name.toLowerCase() === normalized.toLowerCase()
    );
    if (exists) {
      return; // Prevent duplicate names
    }

    const updatedFiles = currentProject.files.map((f) =>
      f.id === fileId ? { ...f, name: normalized, version: (f.version || 1) + 1 } : f
    );

    const dirtyFileIds = get().dirtyFileIds.includes(fileId)
      ? get().dirtyFileIds
      : [...get().dirtyFileIds, fileId];

    set({
      project: {
        ...currentProject,
        files: updatedFiles,
        updatedAt: Date.now(),
      },
      dirtyFileIds,
      isDirty: true,
    });
  },

  duplicateFile: (fileId) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const targetIndex = currentProject.files.findIndex((f) => f.id === fileId);
    if (targetIndex === -1) return;

    const targetFile = currentProject.files[targetIndex];
    if (!targetFile) return;

    // Determine base name without extension and without existing (Copy N)
    const rawName = targetFile.name.replace(/\.vns$/i, '');
    const cleanBaseName = rawName.replace(/\s+\(Copy\s+\d+\)$/i, '');

    // Find next incremental copy index
    let copyIndex = 1;
    let candidateName = `${cleanBaseName} (Copy ${copyIndex}).vns`;
    while (
      currentProject.files.some(
        (f) => f.name.toLowerCase() === candidateName.toLowerCase()
      )
    ) {
      copyIndex++;
      candidateName = `${cleanBaseName} (Copy ${copyIndex}).vns`;
    }

    // Append copy suffix to scene declarations to avoid duplicate scene compiler errors
    const duplicatedContent = targetFile.content.replace(
      /scene\s+([a-zA-Z0-9_]+):/g,
      'scene $1_copy:'
    );

    const newFileId = generateUUID();
    const duplicatedFile = {
      id: newFileId,
      name: candidateName,
      content: duplicatedContent,
      order: (targetFile.order ?? 0) + 1,
      version: 1,
    };

    const updatedFiles = [...currentProject.files];
    updatedFiles.splice(targetIndex + 1, 0, duplicatedFile);

    set({
      project: {
        ...currentProject,
        files: updatedFiles,
        updatedAt: Date.now(),
      },
      dirtyFileIds: [...get().dirtyFileIds, newFileId],
      isDirty: true,
    });
  },

  deleteFile: (fileId) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const target = currentProject.files.find((f) => f.id === fileId);
    if (!target) return;

    // Protection: never delete main.vns
    if (target.name.toLowerCase() === 'main.vns') {
      return;
    }

    const updatedFiles = currentProject.files.filter((f) => f.id !== fileId);
    const dirtyFileIds = get().dirtyFileIds.filter((id) => id !== fileId);

    set({
      project: {
        ...currentProject,
        files: updatedFiles,
        updatedAt: Date.now(),
      },
      dirtyFileIds,
      isDirty: true,
    });
  },

  saveCharacter: (char) => {
    const currentProject = get().project;
    if (!currentProject) return;

    const index = currentProject.characters.findIndex((c) => c.id === char.id);
    const updated = [...currentProject.characters];
    if (index >= 0) {
      updated[index] = char;
    } else {
      updated.push(char);
    }

    set({
      project: {
        ...currentProject,
        characters: updated,
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  deleteCharacter: (charId) => {
    const currentProject = get().project;
    if (!currentProject) return;

    set({
      project: {
        ...currentProject,
        characters: currentProject.characters.filter((c) => c.id !== charId),
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  saveAsset: async (asset, blob) => {
    const currentProject = get().project;
    if (!currentProject) return;

    if (activeRepository) {
      await activeRepository.saveAssetBlob(asset.id, blob);
    }

    const index = currentProject.assets.findIndex((a) => a.id === asset.id);
    const updated = [...currentProject.assets];
    if (index >= 0) {
      updated[index] = asset;
    } else {
      updated.push(asset);
    }

    set({
      project: {
        ...currentProject,
        assets: updated,
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },

  deleteAsset: async (assetId) => {
    const currentProject = get().project;
    if (!currentProject) return;

    if (activeRepository) {
      await activeRepository.deleteAssetBlob(assetId);
    }

    set({
      project: {
        ...currentProject,
        assets: currentProject.assets.filter((a) => a.id !== assetId),
        updatedAt: Date.now(),
      },
      isDirty: true,
    });
  },
}));
