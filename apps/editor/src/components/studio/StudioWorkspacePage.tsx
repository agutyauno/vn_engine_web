import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { AssetRef, AssetCategory, Character, Project } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../../core/contracts/repository';
import { ActivityBar, type StudioTab } from './ActivityBar';
import { FileExplorerPane, generateDefaultScriptName } from './FileExplorerPane';
import { StudioHeader } from './StudioHeader';
import { CharacterManagerPane } from '../characters/CharacterManagerPane';
import { CharacterModal } from '../characters/CharacterModal';
import { AssetLibraryPane } from './AssetLibraryPane';
import { CreateAssetModal } from './CreateAssetModal';
import { calculateVariableInsertion } from '../../core/services/quickFixService';
import { EditorTabBar } from './EditorTabBar';
import { MonacoEditorContainer } from './MonacoEditorContainer';
import { DockDrawer } from './DockDrawer';
import { DockProblemsTable, type DiagnosticItem } from './DockProblemsTable';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { ExportWizardModal, type ExportTarget } from './ExportWizardModal';
import { ColumnSplitter } from './ColumnSplitter';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { useProjectStore } from '../../core/stores/projectStore';
import { useEditorUIStore } from '../../core/stores/uiStore';
import { useDiagnosticsStore } from '../../core/stores/diagnosticsStore';
import { usePreviewStore } from '../../core/stores/livePreviewStore';
import { useCompilerPipeline } from '../../hooks/useCompilerPipeline';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { CompilerService } from '../../core/services/compilerService';
import { PreviewBridge, buildPreviewUrl } from '../../core/services/previewBridge';
import {
  scanActiveReconciliation,
  type EditorDiagnostic,
} from '../../core/services/reconciliation';

export interface StudioWorkspacePageProps {
  projectId: string;
  repository: ProjectRepository;
  initialProject?: Project;
  onBackToHub?: () => void;
  onQuickPlay?: () => void;
  onRunFromCursor?: () => void;
  onOpenSettings?: () => void;
  onExport?: () => void;
}

let lastLoadedProjectId: string | null = null;

export const StudioWorkspacePage: React.FC<StudioWorkspacePageProps> = ({
  projectId,
  repository,
  initialProject,
  onBackToHub,
  onQuickPlay,
  onRunFromCursor,
  onOpenSettings,
  onExport,
}) => {
  // --- Project Store Hook Injection ---
  const project = useProjectStore(s => s.project);
  const isDirty = useProjectStore(s => s.isDirty);
  const isSaving = useProjectStore(s => s.isSaving);
  const dirtyFileIds = useProjectStore(s => s.dirtyFileIds);
  const setProject = useProjectStore(s => s.setProject);
  const updateFileContent = useProjectStore(s => s.updateFileContent);
  const saveProject = useProjectStore(s => s.saveProject);
  const updateProjectMetadata = useProjectStore(s => s.updateProjectMetadata);
  const createFile = useProjectStore(s => s.createFile);
  const renameFile = useProjectStore(s => s.renameFile);
  const deleteFile = useProjectStore(s => s.deleteFile);
  const saveCharacter = useProjectStore(s => s.saveCharacter);
  const deleteCharacter = useProjectStore(s => s.deleteCharacter);
  const saveAsset = useProjectStore(s => s.saveAsset);
  const deleteAsset = useProjectStore(s => s.deleteAsset);

  // --- UI Store Hook Injection ---
  const navWidth = useEditorUIStore(s => s.navWidth);
  const drawerHeight = useEditorUIStore(s => s.drawerHeight);
  const setNavWidth = useEditorUIStore(s => s.setNavWidth);
  const setDrawerHeight = useEditorUIStore(s => s.setDrawerHeight);

  const activeTab = useEditorUIStore(s => s.activeTab);
  const setActiveTab = useEditorUIStore(s => s.setActiveTab);
  const activeFileId = useEditorUIStore(s => s.activeFileId);
  const openFileIds = useEditorUIStore(s => s.openFileIds);
  const selectTab = useEditorUIStore(s => s.selectTab);
  const isDrawerOpen = useEditorUIStore(s => s.isDrawerOpen);
  const toggleDrawer = useEditorUIStore(s => s.toggleDrawer);
  const cursorJumpTarget = useEditorUIStore(s => s.cursorJumpTarget);
  const setCursorJumpTarget = useEditorUIStore(s => s.setCursorJumpTarget);

  const isSettingsOpen = useEditorUIStore(s => s.isSettingsOpen);
  const setSettingsOpen = useEditorUIStore(s => s.setSettingsOpen);
  const isShortcutsOpen = useEditorUIStore(s => s.isShortcutsOpen);
  const setShortcutsOpen = useEditorUIStore(s => s.setShortcutsOpen);
  const isUnsavedModalOpen = useEditorUIStore(s => s.isUnsavedModalOpen);
  const triggerUnsavedGuard = useEditorUIStore(s => s.triggerUnsavedGuard);
  const resolveUnsavedGuard = useEditorUIStore(s => s.resolveUnsavedGuard);

  // --- Diagnostics Store Hook Injection ---
  const compilerDiagnostics = useDiagnosticsStore(s => s.compilerDiagnostics);
  const runtimeDiagnostics = useDiagnosticsStore(s => s.runtimeDiagnostics);
  const reconciliationDiagnostics = useDiagnosticsStore(s => s.reconciliationDiagnostics);
  const errorCount = useDiagnosticsStore(s => s.errorCount);
  const warningCount = useDiagnosticsStore(s => s.warningCount);

  // --- Live Preview Store Hook Injection ---
  const setIsPlaying = usePreviewStore(s => s.setIsPlaying);

  const currentProject = project ?? initialProject ?? null;

  // Local component states
  const [loading, setLoading] = useState<boolean>(!initialProject && !project);
  const [error, setError] = useState<string | null>(null);
  const [currentCursorLine, setCurrentCursorLine] = useState<number>(1);
  const [isCharModalOpen, setIsCharModalOpen] = useState<boolean>(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [pendingQuickFixAsset, setPendingQuickFixAsset] = useState<{
    id: string;
    category?: AssetCategory;
  } | null>(null);

  // Pop-out Window Reference
  const popoutWindowRef = useRef<Window | null>(null);

  // Pending navigation target callback for unsaved guard
  const pendingNavRef = useRef<(() => void) | null>(null);

  // --- Compiler Service & Preview Bridge Instances ---
  const compilerService = useMemo(() => new CompilerService(), []);
  const previewBridge = useMemo(
    () =>
      new PreviewBridge({
        targetWindow: () => {
          if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
            return popoutWindowRef.current;
          }
          if (typeof document !== 'undefined') {
            const iframe = document.querySelector<HTMLIFrameElement>(
              'iframe[data-testid="preview-player-iframe"]',
            );
            if (iframe?.contentWindow) return iframe.contentWindow;
          }
          return null;
        },
        previewOrigin: '*',
        repository,
        getProgramPayload: () => {
          const activeProgram = compilerService.getLatestProgram?.();
          const proj = useProjectStore.getState().project;
          if (activeProgram && activeProgram.length > 0 && proj) {
            return {
              program: activeProgram,
              projectId: proj.id,
              characters: proj.characters,
              assets: proj.assets,
            };
          }
          return null;
        },
      }),
    [repository],
  );

  useEffect(() => {
    return () => {
      compilerService.terminate();
      previewBridge.dispose();
    };
  }, [compilerService, previewBridge]);

  // Mount compiler pipeline
  useCompilerPipeline({
    compilerService,
    previewBridge,
    debounceMs: 200,
  });

  // Manual save
  const handleManualSave = useCallback(async () => {
    try {
      await saveProject(repository);
    } catch (err) {
      console.error('Failed to save project:', err);
    }
  }, [saveProject, repository]);

  // Close tab handler with active tab fallback
  const handleCloseTab = useCallback((fileId: string) => {
    const open = useEditorUIStore.getState().openFileIds;
    const index = open.indexOf(fileId);
    const nextOpen = open.filter(id => id !== fileId);
    let nextActive = useEditorUIStore.getState().activeFileId;
    if (nextActive === fileId) {
      nextActive = nextOpen[index] || nextOpen[index - 1] || nextOpen[0] || null;
    }
    useEditorUIStore.setState({
      openFileIds: nextOpen,
      activeFileId: nextActive,
    });
  }, []);

  const previousTabRef = useRef<StudioTab>('scripts');

  useEffect(() => {
    if (activeTab !== null) {
      previousTabRef.current = activeTab;
    }
  }, [activeTab]);

  const handleToggleSidebar = useCallback(() => {
    const currentTab = useEditorUIStore.getState().activeTab;
    if (currentTab !== null) {
      previousTabRef.current = currentTab;
      setActiveTab(null);
    } else {
      setActiveTab(previousTabRef.current || 'scripts');
    }
  }, [setActiveTab]);

  // Pop-out Preview Launcher & Hot Reload Handlers
  const openOrFocusPopout = useCallback(
    async (targetOptions?: { scene?: string; line?: number }) => {
      if (!currentProject) return;
      const url = buildPreviewUrl('http://localhost:3000', currentProject.id, {
        isPopout: true,
        editorOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
      });

      const isNewWindow = !popoutWindowRef.current || popoutWindowRef.current.closed;
      if (typeof window !== 'undefined') {
        if (isNewWindow) {
          usePreviewStore.getState().setConnectionStatus('standby');
          popoutWindowRef.current = window.open(
            url,
            'VN_Preview_Popout',
            'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no',
          );
        } else {
          popoutWindowRef.current?.focus?.();
        }
      }
      setIsPlaying(true);
      previewBridge.probeReady();

      let activeProgram = compilerService.getLatestProgram?.() || [];
      if (activeProgram.length === 0 && currentProject.files && currentProject.files.length > 0) {
        try {
          const compileResult = await compilerService.compile(currentProject.files, {
            characters: currentProject.characters,
            assets: currentProject.assets,
            forceSync: true,
          });
          if (compileResult.success && compileResult.bytecode) {
            activeProgram = compileResult.bytecode;
          }
        } catch (err) {
          console.error('[openOrFocusPopout] On-demand compilation error:', err);
        }
      }

      if (activeProgram.length > 0) {
        previewBridge.hotReload({
          program: activeProgram,
          scene: targetOptions?.scene,
          line: targetOptions?.line,
          projectId: currentProject.id,
          characters: currentProject.characters,
          assets: currentProject.assets,
          preserveState: targetOptions?.line !== undefined,
        });
      }
    },
    [currentProject, compilerService, previewBridge, setIsPlaying],
  );

  const handleQuickPlayAction = useCallback(() => {
    openOrFocusPopout();
    onQuickPlay?.();
  }, [openOrFocusPopout, onQuickPlay]);

  const handleRunFromCursorAction = useCallback(() => {
    openOrFocusPopout({ line: currentCursorLine });
    onRunFromCursor?.();
  }, [openOrFocusPopout, currentCursorLine, onRunFromCursor]);

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    onSave: handleManualSave,
    onTogglePlay: handleQuickPlayAction,
    onRunFromCursor: handleRunFromCursorAction,
    onToggleDrawer: toggleDrawer,
    onToggleSidebar: handleToggleSidebar,
    onOpenSettings: () => setSettingsOpen(true),
    onCloseTab: () => {
      if (activeFileId) {
        handleCloseTab(activeFileId);
      }
    },
    onOpenShortcuts: () => setShortcutsOpen(true),
    enabled: true,
  });

  // Mount & Load Project
  useEffect(() => {
    if (lastLoadedProjectId !== projectId) {
      lastLoadedProjectId = projectId;
      if (useEditorUIStore.getState().activeTab !== null) {
        useEditorUIStore.setState({ activeTab: 'scripts' });
      }
    }

    if (initialProject) {
      useProjectStore.getState().initProject(initialProject, repository);
      if (initialProject.files && initialProject.files.length > 0) {
        useEditorUIStore.setState({
          openFileIds: initialProject.files.map(f => f.id),
          activeFileId: initialProject.files[0]?.id ?? null,
          isDrawerOpen: true,
        });
      }
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const loaded = await repository.getProject(projectId);
        if (!isMounted) return;
        if (loaded) {
          useProjectStore.getState().initProject(loaded, repository);
          if (loaded.files && loaded.files.length > 0) {
            useEditorUIStore.setState({
              openFileIds: loaded.files.map(f => f.id),
              activeFileId: loaded.files[0]?.id ?? null,
              isDrawerOpen: true,
            });
          }
        } else {
          setError(`Project not found: ${projectId}`);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [projectId, repository, initialProject]);

  // Safe Navigation Guard
  const handleBackToHub = useCallback(() => {
    if (useProjectStore.getState().isDirty) {
      pendingNavRef.current = () => onBackToHub?.();
      triggerUnsavedGuard({ type: 'project-hub' });
    } else {
      onBackToHub?.();
    }
  }, [onBackToHub, triggerUnsavedGuard]);

  const handleSaveAndContinue = useCallback(async () => {
    try {
      await saveProject(repository);
    } catch (err) {
      console.error('Failed to save project:', err);
    }
    const nav = pendingNavRef.current;
    pendingNavRef.current = null;
    resolveUnsavedGuard(true);
    nav?.();
  }, [saveProject, repository, resolveUnsavedGuard]);

  const handleDiscardAndContinue = useCallback(() => {
    useProjectStore.setState({ isDirty: false, dirtyFileIds: [] });
    const nav = pendingNavRef.current;
    pendingNavRef.current = null;
    resolveUnsavedGuard(true);
    nav?.();
  }, [resolveUnsavedGuard]);

  const handleCancelUnsaved = useCallback(() => {
    pendingNavRef.current = null;
    resolveUnsavedGuard(false);
  }, [resolveUnsavedGuard]);

  // Header Title Change
  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!project) return;
      updateProjectMetadata({ title: newTitle });
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to update project title:', err);
      }
    },
    [project, updateProjectMetadata, saveProject, repository],
  );

  // Tab Selection
  const handleSelectTab = useCallback(
    (fileId: string) => {
      selectTab(fileId);
    },
    [selectTab],
  );

  // File Creation
  const handleCreateFile = useCallback(
    async (normalizedName: string) => {
      createFile(normalizedName);
      const updatedProject = useProjectStore.getState().project;
      if (updatedProject && updatedProject.files.length > 0) {
        const createdFile = updatedProject.files[updatedProject.files.length - 1];
        if (createdFile) {
          selectTab(createdFile.id);
        }
      }
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to create script file:', err);
      }
    },
    [createFile, selectTab, saveProject, repository],
  );

  // File Renaming
  const handleRenameFile = useCallback(
    async (fileId: string, newName: string) => {
      renameFile(fileId, newName);
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to rename script file:', err);
      }
    },
    [renameFile, saveProject, repository],
  );

  // File Deletion
  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      deleteFile(fileId);
      handleCloseTab(fileId);
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to delete script file:', err);
      }
    },
    [deleteFile, handleCloseTab, saveProject, repository],
  );

  // Set Entry Scene
  const handleSetEntryScene = useCallback(
    async (fileName: string) => {
      updateProjectMetadata({ entryScene: fileName });
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to update entry scene:', err);
      }
    },
    [updateProjectMetadata, saveProject, repository],
  );

  // Script Content Editing
  const handleContentChange = useCallback(
    (newContent: string) => {
      const fileId =
        activeFileId ||
        useEditorUIStore.getState().activeFileId ||
        useProjectStore.getState().project?.files[0]?.id;
      if (!fileId) return;
      updateFileContent(fileId, newContent);
    },
    [activeFileId, updateFileContent],
  );

  // Character Management Handlers
  const handleOpenCreateCharacter = useCallback((prefillId?: string) => {
    setEditingCharacter(
      prefillId
        ? {
            id: prefillId,
            name: '',
            colorHex: '#38bdf8',
            sprites: {},
            defaultExpression: 'default',
          }
        : null,
    );
    setIsCharModalOpen(true);
  }, []);

  const handleOpenEditCharacter = useCallback((char: Character) => {
    setEditingCharacter(char);
    setIsCharModalOpen(true);
  }, []);

  const handleSaveCharacter = useCallback(
    async (savedChar: Character) => {
      saveCharacter(savedChar);
      setIsCharModalOpen(false);
      setEditingCharacter(null);
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to persist character:', err);
      }
    },
    [saveCharacter, saveProject, repository],
  );

  const handleDeleteCharacter = useCallback(
    async (characterId: string) => {
      deleteCharacter(characterId);
      try {
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to delete character:', err);
      }
    },
    [deleteCharacter, saveProject, repository],
  );

  // Asset Management Handlers
  const handleAddAsset = useCallback(
    async (newAsset: AssetRef, fileBlob?: Blob) => {
      try {
        await saveAsset(newAsset, fileBlob);
        await saveProject(repository);
        setPendingQuickFixAsset(null);
      } catch (err) {
        console.error('Failed to persist asset:', err);
      }
    },
    [saveAsset, saveProject, repository],
  );

  const handleReplaceAsset = useCallback(
    async (assetId: string, newBlob: Blob, newFileName?: string) => {
      const current = useProjectStore.getState().project;
      const existing = current?.assets.find(a => a.id === assetId);
      if (!existing) return;

      const updatedAsset: AssetRef = {
        ...existing,
        name: newFileName || existing.name,
        sizeBytes: newBlob.size,
        version: (existing.version || 1) + 1,
      };

      try {
        await saveAsset(updatedAsset, newBlob);
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to replace asset:', err);
      }
    },
    [saveAsset, saveProject, repository],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      try {
        await deleteAsset(assetId);
        await saveProject(repository);
      } catch (err) {
        console.error('Failed to delete asset:', err);
      }
    },
    [deleteAsset, saveProject, repository],
  );

  // Diagnostic Click & QuickFix
  const allDiagnostics = useMemo<DiagnosticItem[]>(() => {
    return [...compilerDiagnostics, ...reconciliationDiagnostics, ...runtimeDiagnostics];
  }, [compilerDiagnostics, reconciliationDiagnostics, runtimeDiagnostics]);

  const handleDiagnosticClick = useCallback(
    (diag: DiagnosticItem) => {
      let targetFileId = (diag as EditorDiagnostic).fileId;
      const fileName = (diag as EditorDiagnostic).fileName;
      if (!targetFileId && fileName && project) {
        const match = project.files.find(f => f.name === fileName);
        if (match) targetFileId = match.id;
      }
      if (targetFileId) {
        handleSelectTab(targetFileId);
      }
      if (diag.line) {
        setCursorJumpTarget({ line: diag.line, col: diag.col || 1 });
      }
    },
    [project, handleSelectTab, setCursorJumpTarget],
  );

  const handleQuickFix = useCallback(
    (diag: DiagnosticItem) => {
      const editorDiag = diag as EditorDiagnostic;
      if (editorDiag.quickFix?.type === 'create_asset') {
        setPendingQuickFixAsset({
          id: editorDiag.quickFix.targetId,
          category: (editorDiag.quickFix.prefillData?.category as AssetCategory) || 'background',
        });
        setIsAssetModalOpen(true);
      } else if (editorDiag.quickFix?.type === 'create_character') {
        handleOpenCreateCharacter(editorDiag.quickFix.targetId);
      } else if (editorDiag.quickFix?.type === 'define_variable') {
        const varName = editorDiag.quickFix.targetId;
        const currentProj = useProjectStore.getState().project;
        let targetFile = currentProj?.files.find(f => f.id === editorDiag.fileId);
        if (!targetFile && editorDiag.fileName && currentProj) {
          targetFile = currentProj.files.find(f => f.name === editorDiag.fileName);
        }
        if (!targetFile && currentProj && currentProj.files.length > 0) {
          const activeId = useEditorUIStore.getState().activeFileId;
          targetFile = currentProj.files.find(f => f.id === activeId) || currentProj.files[0];
        }
        if (targetFile) {
          const insResult = calculateVariableInsertion(
            targetFile.content,
            varName,
            'scene',
            editorDiag.line || 1,
          );
          const lines = targetFile.content.split('\n');
          lines.splice(insResult.insertLine - 1, 0, insResult.text.replace(/\n$/, ''));
          const newContent = lines.join('\n');
          updateFileContent(targetFile.id, newContent);
          handleSelectTab(targetFile.id);
          setCursorJumpTarget({ line: insResult.newCursorLine, col: 1 });
          saveProject(repository).catch(err => console.error('Failed to save after quickfix:', err));
        }
      }
    },
    [handleOpenCreateCharacter, updateFileContent, handleSelectTab, setCursorJumpTarget, saveProject, repository],
  );

  const handleRequestCreateAsset = useCallback((targetId: string, category?: AssetCategory) => {
    setPendingQuickFixAsset({
      id: targetId,
      category: category || 'background',
    });
    setIsAssetModalOpen(true);
  }, []);

  const handleRequestCreateCharacter = useCallback(
    (targetId: string) => {
      handleOpenCreateCharacter(targetId);
    },
    [handleOpenCreateCharacter],
  );

  // Settings & Export Handlers
  const handleOpenSettingsModal = useCallback(() => {
    setSettingsOpen(true);
    onOpenSettings?.();
  }, [setSettingsOpen, onOpenSettings]);

  const handleSaveSettings = useCallback(
    async (updated: Project) => {
      setSettingsOpen(false);
      setProject(updated);
      try {
        await repository.updateProject(updated);
      } catch (err) {
        console.error('Failed to update project settings:', err);
      }
    },
    [setSettingsOpen, setProject, repository],
  );

  const handleOpenExportModal = useCallback(() => {
    setIsExportOpen(true);
    onExport?.();
  }, [onExport]);

  const handlePerformExport = useCallback(
    (target: ExportTarget) => {
      if (!project) return;
      try {
        const jsonString = JSON.stringify(project, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${target}_release.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to export release:', err);
      }
      setIsExportOpen(false);
    },
    [project],
  );

  const uncreatedCharacterIds = useMemo(() => {
    if (!currentProject) return [];
    return scanActiveReconciliation(currentProject).uncreatedCharacters;
  }, [currentProject]);

  if (loading) {
    return (
      <div
        data-testid="studio-loading-state"
        className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-sm text-neutral-400 font-mono"
      >
        Loading project workspace...
      </div>
    );
  }

  if (!project && (error || !loading)) {
    return (
      <div
        data-testid="studio-error-state"
        className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 text-sm text-red-400 font-mono gap-4"
      >
        <span>{error ?? 'Project not found.'}</span>
        {onBackToHub && (
          <button
            type="button"
            data-testid="btn-error-back-hub"
            onClick={onBackToHub}
            className="rounded bg-neutral-800 px-4 py-2 text-xs text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
          >
            Back to Hub
          </button>
        )}
      </div>
    );
  }

  const currentActiveFileId =
    activeFileId ||
    useEditorUIStore.getState().activeFileId ||
    (currentProject?.files && currentProject.files[0]?.id) ||
    null;
  const activeFile = (currentProject?.files || []).find(f => f.id === currentActiveFileId) ?? null;
  const canvasWidth = currentProject?.displaySettings?.width ?? 1920;
  const canvasHeight = currentProject?.displaySettings?.height ?? 1080;
  const memoizedDirtyFileIds = new Set(dirtyFileIds);

  return (
    <div
      data-testid="studio-workspace-page"
      className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100 font-sans overflow-hidden select-none"
    >
      {/* Top Header */}
      {currentProject && (
        <StudioHeader
          projectTitle={currentProject.title}
          title={currentProject.title}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          width={canvasWidth}
          height={canvasHeight}
          isDirty={isDirty}
          isSaving={isSaving}
          onTitleChange={handleTitleChange}
          onSave={handleManualSave}
          onBack={handleBackToHub}
          onBackToHub={handleBackToHub}
          onOpenSettings={handleOpenSettingsModal}
          onExport={handleOpenExportModal}
          onQuickPlay={handleQuickPlayAction}
          onRunFromCursor={handleRunFromCursorAction}
        />
      )}

      {/* 3-Column Director Workspace */}
      {currentProject && (
        <main className="flex flex-1 min-h-0 overflow-hidden">
          {/* Column 1: Static Navigator (Activity Bar + FileExplorer / CharacterManager / AssetLibrary) */}
          <div
            data-testid="col-navigation"
            className="flex shrink-0 h-full border-r border-neutral-800 bg-neutral-900/40"
            style={{ width: `${activeTab === null ? 48 : navWidth}px` }}
          >
            <ActivityBar
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onOpenSettings={handleOpenSettingsModal}
              onOpenShortcuts={() => setShortcutsOpen(true)}
            />

            {activeTab === 'scripts' && (
              <FileExplorerPane
                files={currentProject.files}
                activeFileId={currentActiveFileId}
                entrySceneName={currentProject.entryScene || 'main.vns'}
                onSelectFile={handleSelectTab}
                onCreateFile={handleCreateFile}
                onRenameFile={handleRenameFile}
                onDeleteFile={handleDeleteFile}
                onSetEntryScene={handleSetEntryScene}
              />
            )}

            {activeTab === 'characters' && (
              <CharacterManagerPane
                characters={currentProject.characters || []}
                uncreatedIds={uncreatedCharacterIds}
                onCreateCharacter={handleOpenCreateCharacter}
                onEditCharacter={handleOpenEditCharacter}
                onDeleteCharacter={handleDeleteCharacter}
              />
            )}

            {activeTab === 'assets' && (
              <div data-testid="pane-assets-placeholder" className="flex-1 min-w-0 w-auto h-full">
                <AssetLibraryPane
                  project={currentProject}
                  quickFixAsset={pendingQuickFixAsset}
                  quickFixAssetName={pendingQuickFixAsset?.id}
                  onClearQuickFix={() => setPendingQuickFixAsset(null)}
                  onAddAsset={handleAddAsset}
                  onReplaceAsset={handleReplaceAsset}
                  onDeleteAsset={handleDeleteAsset}
                />
              </div>
            )}
          </div>

          {/* Resizable Nav Splitter */}
          {activeTab !== null && (
            <ColumnSplitter
              type="nav"
              onResize={delta => setNavWidth(navWidth + delta)}
              onReset={() => setNavWidth(260)}
            />
          )}

          {/* Column 2: Center Workspace (Editor Tab Bar + Monaco Script Workspace + Bottom Drawer) */}
          <div
            data-testid="col-workspace"
            className="flex flex-1 flex-col min-w-0 h-full bg-neutral-950"
          >
            {/* Header Tab Bar */}
            <EditorTabBar
              files={currentProject.files || []}
              openFileIds={
                openFileIds.length > 0 ? openFileIds : (currentProject.files || []).map(f => f.id)
              }
              activeFileId={currentActiveFileId || ''}
              dirtyFileIds={memoizedDirtyFileIds}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              onNewFile={() =>
                handleCreateFile(
                  generateDefaultScriptName((currentProject.files || []).map(f => f.name)),
                )
              }
            />

            {/* Center Monaco Script Editor */}
            <MonacoEditorContainer
              file={activeFile}
              project={currentProject}
              cursorJumpTarget={cursorJumpTarget}
              onChange={handleContentChange}
              onCursorChange={line => setCurrentCursorLine(line)}
              onRequestCreateAsset={handleRequestCreateAsset}
              onRequestCreateCharacter={handleRequestCreateCharacter}
            />

            {/* Resizable Drawer Splitter */}
            <ColumnSplitter
              type="drawer"
              onResize={delta => setDrawerHeight(drawerHeight + delta)}
              onReset={() => setDrawerHeight(200)}
            />

            {/* Bottom Diagnostics Problems Drawer */}
            <DockDrawer
              isOpen={isDrawerOpen}
              activeTab="problems"
              errorCount={errorCount}
              warningCount={warningCount}
              height={drawerHeight}
              onToggleDrawer={toggleDrawer}
            >
              <DockProblemsTable
                diagnostics={allDiagnostics}
                onDiagnosticClick={handleDiagnosticClick}
                onQuickFix={handleQuickFix}
              />
            </DockDrawer>
          </div>
        </main>
      )}

      {/* Character Modal Dialog */}
      {currentProject && (
        <CharacterModal
          isOpen={isCharModalOpen}
          initialData={editingCharacter}
          existingIds={(currentProject.characters || [])
            .filter(c => !editingCharacter || c.id !== editingCharacter.id)
            .map(c => c.id)}
          onClose={() => {
            setIsCharModalOpen(false);
            setEditingCharacter(null);
          }}
          onSave={handleSaveCharacter}
        />
      )}

      {/* QuickFix Create Asset Modal Dialog */}
      {currentProject && isAssetModalOpen && (
        <CreateAssetModal
          isOpen={isAssetModalOpen}
          initialFile={null}
          initialAssetId={pendingQuickFixAsset?.id}
          initialCategory={pendingQuickFixAsset?.category}
          existingAssetIds={(currentProject.assets || []).map(a => a.id)}
          onClose={() => {
            setIsAssetModalOpen(false);
            setPendingQuickFixAsset(null);
          }}
          onSave={async (newAsset, fileBlob) => {
            await handleAddAsset(newAsset, fileBlob);
            setIsAssetModalOpen(false);
            setPendingQuickFixAsset(null);
          }}
        />
      )}

      {/* Project Settings Modal Dialog */}
      {currentProject && (
        <ProjectSettingsModal
          isOpen={isSettingsOpen}
          project={currentProject}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}

      {/* Export Release Wizard Modal Dialog */}
      {currentProject && (
        <ExportWizardModal
          isOpen={isExportOpen}
          project={currentProject}
          onClose={() => setIsExportOpen(false)}
          onExport={handlePerformExport}
        />
      )}

      {/* Unsaved Changes Navigation Guard Modal */}
      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        onSaveAndContinue={handleSaveAndContinue}
        onDiscardAndContinue={handleDiscardAndContinue}
        onCancel={handleCancelUnsaved}
      />

      {/* Shortcuts Help Modal Dialog */}
      <ShortcutsHelpModal isOpen={isShortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
};
