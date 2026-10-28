import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { AssetRef, Character, Project, ScriptFile } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../../core/contracts/repository';
import { ActivityBar, type StudioTab } from './ActivityBar';
import {
  FileExplorerPane,
  cleanChapterName,
  generateDefaultScriptName,
} from './FileExplorerPane';
import { StudioHeader } from './StudioHeader';
import { CharacterManagerPane } from '../characters/CharacterManagerPane';
import { CharacterModal } from '../characters/CharacterModal';
import { AssetLibraryPane } from './AssetLibraryPane';
import { EditorTabBar } from './EditorTabBar';
import { MonacoEditorContainer } from './MonacoEditorContainer';
import { DockDrawer, type DrawerTab } from './DockDrawer';
import { DockProblemsTable } from './DockProblemsTable';
import { RuntimeCheatInjector } from './RuntimeCheatInjector';
import { ConsoleLogStream, type ConsoleLogEntry } from './ConsoleLogStream';
import { PreviewDock } from './PreviewDock';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { ExportWizardModal, type ExportTarget } from './ExportWizardModal';
import {
  generateDiagnostics,
  type EditorDiagnostic,
} from '../../core/services/reconciliation';

export interface StudioWorkspacePageProps {
  projectId: string;
  repository: ProjectRepository;
  initialProject?: Project;
  onBackToHub?: () => void;
  onQuickPlay?: () => void;
  onOpenSettings?: () => void;
  onExport?: () => void;
}

export const StudioWorkspacePage: React.FC<StudioWorkspacePageProps> = ({
  projectId,
  repository,
  initialProject,
  onBackToHub,
  onQuickPlay,
  onOpenSettings,
  onExport,
}) => {
  const [project, setProject] = useState<Project | null>(initialProject ?? null);
  const [loading, setLoading] = useState<boolean>(!initialProject);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>('scripts');
  const [openFileIds, setOpenFileIds] = useState<string[]>(
    initialProject?.files ? initialProject.files.map((f) => f.id) : []
  );
  const [activeFileId, setActiveFileId] = useState<string | null>(
    initialProject?.files[0]?.id ?? null
  );
  const [dirtyFileIds, setDirtyFileIds] = useState<Set<string>>(new Set());

  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCharModalOpen, setIsCharModalOpen] = useState<boolean>(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);

  // Diagnostics & Bottom Drawer State (Milestone 7)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('problems');
  const [runtimeVariables, setRuntimeVariables] = useState<Record<string, unknown>>({});
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([
    {
      id: 'init-log-1',
      timestamp: Date.now(),
      level: 'info',
      message: 'Studio workspace initialized.',
    },
  ]);
  const [cursorJumpTarget, setCursorJumpTarget] = useState<{ line: number; col: number } | null>(null);

  const diagnostics = useMemo<EditorDiagnostic[]>(() => {
    return project ? generateDiagnostics(project) : [];
  }, [project]);

  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'error').length,
    [diagnostics]
  );
  const warningCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'warning').length,
    [diagnostics]
  );

  // Live Preview State (Milestone 8)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [isPreviewPopout, setIsPreviewPopout] = useState<boolean>(false);

  // Settings & Export Modals (Milestone 9)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

  const handleQuickPlayAction = useCallback(() => {
    setIsPreviewPlaying(true);
    onQuickPlay?.();
  }, [onQuickPlay]);

  const handleOpenSettingsModal = useCallback(() => {
    setIsSettingsOpen(true);
    onOpenSettings?.();
  }, [onOpenSettings]);

  const handleSaveSettings = useCallback(
    async (updated: Project) => {
      setProject(updated);
      setIsSettingsOpen(false);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to update project settings:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [repository]
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
    [project]
  );

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (initialProject) return;
      setLoading(true);
      setError(null);
      try {
        const loaded = await repository.getProject(projectId);
        if (!isMounted) return;
        if (loaded) {
          setProject(loaded);
          if (loaded.files.length > 0 && loaded.files[0]) {
            setActiveFileId(loaded.files[0].id);
            setOpenFileIds(loaded.files.map((f) => f.id));
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

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!project) return;
      const updated: Project = {
        ...project,
        title: newTitle,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to update project title:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleSelectTab = useCallback((fileId: string) => {
    setActiveFileId(fileId);
    setOpenFileIds((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]));
  }, []);

  const handleCloseTab = useCallback(
    (fileId: string) => {
      setOpenFileIds((prev) => {
        const next = prev.filter((id) => id !== fileId);
        if (activeFileId === fileId) {
          const nextActive = next[0] || (project?.files?.[0]?.id ?? '');
          setActiveFileId(nextActive);
        }
        return next;
      });
    },
    [activeFileId, project]
  );

  const handleCreateFile = useCallback(
    async (normalizedName: string) => {
      if (!project) return;
      const newFile: ScriptFile = {
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: normalizedName,
        content: `// ${cleanChapterName(normalizedName)}\n`,
        order: project.files.length,
        version: 1,
      };
      const updated: Project = {
        ...project,
        files: [...project.files, newFile],
        updatedAt: Date.now(),
      };
      setProject(updated);
      setActiveFileId(newFile.id);
      setOpenFileIds((prev) => [...prev, newFile.id]);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to create script file:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleRenameFile = useCallback(
    async (fileId: string, newName: string) => {
      if (!project) return;
      const updatedFiles = project.files.map((f) =>
        f.id === fileId ? { ...f, name: newName, version: f.version + 1 } : f
      );
      const updated: Project = {
        ...project,
        files: updatedFiles,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to rename script file:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      if (!project) return;
      const updatedFiles = project.files.filter((f) => f.id !== fileId);
      const updated: Project = {
        ...project,
        files: updatedFiles,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setOpenFileIds((prev) => prev.filter((id) => id !== fileId));
      if (activeFileId === fileId) {
        setActiveFileId(updatedFiles[0]?.id ?? null);
      }
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to delete script file:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository, activeFileId]
  );

  // Script content change
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (!project || !activeFileId) return;
      const updatedFiles = (project.files || []).map((f) =>
        f.id === activeFileId ? { ...f, content: newContent, version: (f.version || 1) + 1 } : f
      );
      const updated: Project = {
        ...project,
        files: updatedFiles,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setDirtyFileIds((prev) => new Set([...prev, activeFileId]));
      setIsDirty(true);
    },
    [project, activeFileId]
  );

  // Manual save
  const handleManualSave = useCallback(async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      await repository.updateProject(project);
      setDirtyFileIds(new Set());
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to save project:', err);
      setIsDirty(true);
    } finally {
      setIsSaving(false);
    }
  }, [project, repository]);

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
        : null
    );
    setIsCharModalOpen(true);
  }, []);

  const handleDiagnosticClick = useCallback(
    (diag: EditorDiagnostic) => {
      let targetFileId = diag.fileId;
      if (!targetFileId && diag.fileName && project) {
        const match = project.files.find((f) => f.name === diag.fileName);
        if (match) targetFileId = match.id;
      }
      if (targetFileId) {
        handleSelectTab(targetFileId);
      }
      if (diag.line) {
        setCursorJumpTarget({ line: diag.line, col: diag.col || 1 });
      }
    },
    [project, handleSelectTab]
  );

  const handleQuickFix = useCallback(
    (diag: EditorDiagnostic) => {
      if (diag.quickFix?.type === 'create_asset') {
        setActiveTab('assets');
      } else if (diag.quickFix?.type === 'create_character') {
        handleOpenCreateCharacter(diag.quickFix.targetId);
      }
    },
    [handleOpenCreateCharacter]
  );

  const handleInjectVariable = useCallback((key: string, value: unknown) => {
    setRuntimeVariables((prev) => ({ ...prev, [key]: value }));
    setConsoleLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        level: 'info',
        message: `Injected variable '${key}' = ${JSON.stringify(value)}`,
      },
    ]);
  }, []);

  const handleClearLogs = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  const handleOpenEditCharacter = useCallback((char: Character) => {
    setEditingCharacter(char);
    setIsCharModalOpen(true);
  }, []);

  const handleSaveCharacter = useCallback(
    async (savedChar: Character) => {
      if (!project) return;
      const existingChars = project.characters || [];
      const existingIndex = existingChars.findIndex((c) => c.id === savedChar.id);
      let updatedCharacters: Character[];
      if (existingIndex >= 0) {
        updatedCharacters = existingChars.map((c, i) => (i === existingIndex ? savedChar : c));
      } else {
        updatedCharacters = [...existingChars, savedChar];
      }
      const updated: Project = {
        ...project,
        characters: updatedCharacters,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to persist character:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
        setIsCharModalOpen(false);
      }
    },
    [project, repository]
  );

  const handleDeleteCharacter = useCallback(
    async (characterId: string) => {
      if (!project) return;
      const existingChars = project.characters || [];
      const updatedCharacters = existingChars.filter((c) => c.id !== characterId);
      const updated: Project = {
        ...project,
        characters: updatedCharacters,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to delete character:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleAddAsset = useCallback(
    async (newAsset: AssetRef, fileBlob: Blob) => {
      if (!project) return;
      try {
        await repository.saveAssetBlob(newAsset.id, fileBlob);
      } catch (err) {
        console.error('Failed to save asset blob:', err);
      }

      const existing = project.assets || [];
      const updated: Project = {
        ...project,
        assets: [...existing, newAsset],
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to update project assets:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleReplaceAsset = useCallback(
    async (assetId: string, newBlob: Blob, newFileName?: string) => {
      if (!project) return;
      try {
        await repository.saveAssetBlob(assetId, newBlob);
      } catch (err) {
        console.error('Failed to replace asset blob:', err);
      }

      const existing = project.assets || [];
      const updatedAssets = existing.map((a) => {
        if (a.id === assetId) {
          return {
            ...a,
            name: newFileName || a.name,
            sizeBytes: newBlob.size,
            version: (a.version || 1) + 1,
          };
        }
        return a;
      });

      const updated: Project = {
        ...project,
        assets: updatedAssets,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to update project after replacing asset:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      if (!project) return;
      const existing = project.assets || [];
      const updatedAssets = existing.filter((a) => a.id !== assetId);
      const updated: Project = {
        ...project,
        assets: updatedAssets,
        updatedAt: Date.now(),
      };
      setProject(updated);
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to delete asset from project:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

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

  if (error || !project) {
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

  const activeFile = project.files.find((f) => f.id === activeFileId) ?? null;
  const canvasWidth = project.displaySettings?.width ?? 1920;
  const canvasHeight = project.displaySettings?.height ?? 1080;

  return (
    <div
      data-testid="studio-workspace-page"
      className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100 font-sans overflow-hidden select-none"
    >
      {/* Top Header */}
      <StudioHeader
        projectTitle={project.title}
        title={project.title}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        width={canvasWidth}
        height={canvasHeight}
        isDirty={isDirty}
        isSaving={isSaving}
        onTitleChange={handleTitleChange}
        onSave={handleManualSave}
        onBack={onBackToHub}
        onBackToHub={onBackToHub}
        onQuickPlay={handleQuickPlayAction}
        onOpenSettings={handleOpenSettingsModal}
        onExport={handleOpenExportModal}
      />

      {/* 3-Column Director Workspace */}
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Column 1: Static Navigator (Activity Bar + FileExplorer / CharacterManager / AssetLibrary) */}
        <div
          data-testid="col-navigation"
          className="flex shrink-0 h-full border-r border-neutral-800 bg-neutral-900/40"
        >
          <ActivityBar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onOpenSettings={handleOpenSettingsModal}
          />

          {activeTab === 'scripts' && (
            <FileExplorerPane
              files={project.files}
              activeFileId={activeFileId}
              entrySceneName="main.vns"
              onSelectFile={handleSelectTab}
              onCreateFile={handleCreateFile}
              onRenameFile={handleRenameFile}
              onDeleteFile={handleDeleteFile}
            />
          )}

          {activeTab === 'characters' && (
            <CharacterManagerPane
              characters={project.characters || []}
              uncreatedIds={[]}
              onCreateCharacter={handleOpenCreateCharacter}
              onEditCharacter={handleOpenEditCharacter}
              onDeleteCharacter={handleDeleteCharacter}
            />
          )}

          {activeTab === 'assets' && (
            <div data-testid="pane-assets-placeholder" className="w-72 shrink-0 h-full">
              <AssetLibraryPane
                project={project}
                onAddAsset={handleAddAsset}
                onReplaceAsset={handleReplaceAsset}
                onDeleteAsset={handleDeleteAsset}
              />
            </div>
          )}
        </div>

        {/* Column 2: Center Workspace (Editor Tab Bar + Monaco Script Workspace + Bottom Drawer) */}
        <div
          data-testid="col-workspace"
          className="flex flex-1 flex-col min-w-0 h-full border-r border-neutral-800 bg-neutral-950"
        >
          {/* Header Tab Bar */}
          <EditorTabBar
            files={project.files || []}
            openFileIds={openFileIds}
            activeFileId={activeFileId || ''}
            dirtyFileIds={dirtyFileIds}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewFile={() =>
              handleCreateFile(
                generateDefaultScriptName((project.files || []).map((f) => f.name))
              )
            }
          />

          {/* Center Monaco Script Editor */}
          <MonacoEditorContainer
            file={activeFile}
            project={project}
            cursorJumpTarget={cursorJumpTarget}
            onChange={handleContentChange}
          />

          {/* Bottom Diagnostics & Debugger Drawer (Milestone 7) */}
          <DockDrawer
            isOpen={isDrawerOpen}
            activeTab={drawerTab}
            errorCount={errorCount}
            warningCount={warningCount}
            onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
            onSelectTab={setDrawerTab}
          >
            {drawerTab === 'problems' && (
              <DockProblemsTable
                diagnostics={diagnostics}
                onDiagnosticClick={handleDiagnosticClick}
                onQuickFix={handleQuickFix}
              />
            )}
            {drawerTab === 'cheats' && (
              <RuntimeCheatInjector
                variables={runtimeVariables}
                onInjectVariable={handleInjectVariable}
              />
            )}
            {drawerTab === 'console' && (
              <ConsoleLogStream
                logs={consoleLogs}
                onClearLogs={handleClearLogs}
              />
            )}
          </DockDrawer>
        </div>

        {/* Column 3: Live Preview Dock (100% full-height with aspect-ratio locked container) */}
        <div
          data-testid="col-preview-dock"
          className="flex w-[400px] lg:w-[480px] shrink-0 h-full flex-col bg-neutral-900/70"
        >
          <PreviewDock
            projectId={project.id}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            isPlaying={isPreviewPlaying}
            isPopout={isPreviewPopout}
            previewUrl={`http://localhost:3000/?mode=preview&projectId=${project.id}`}
            onTogglePlay={() => setIsPreviewPlaying((prev) => !prev)}
            onReload={() => {
              setIsPreviewPlaying(false);
              setTimeout(() => setIsPreviewPlaying(true), 50);
            }}
            onTogglePopout={() => setIsPreviewPopout((prev) => !prev)}
          />
        </div>
      </main>

      {/* Character Modal Dialog */}
      <CharacterModal
        isOpen={isCharModalOpen}
        initialData={editingCharacter}
        existingIds={(project.characters || [])
          .filter((c) => !editingCharacter || c.id !== editingCharacter.id)
          .map((c) => c.id)}
        onClose={() => {
          setIsCharModalOpen(false);
          setEditingCharacter(null);
        }}
        onSave={handleSaveCharacter}
      />

      {/* Project Settings Modal Dialog */}
      <ProjectSettingsModal
        isOpen={isSettingsOpen}
        project={project}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />

      {/* Export Release Wizard Modal Dialog */}
      <ExportWizardModal
        isOpen={isExportOpen}
        project={project}
        onClose={() => setIsExportOpen(false)}
        onExport={handlePerformExport}
      />
    </div>
  );
};
