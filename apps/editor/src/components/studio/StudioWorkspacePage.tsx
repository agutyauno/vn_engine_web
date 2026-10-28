import React, { useState, useEffect, useCallback } from 'react';
import type { Character, Project, ScriptFile } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../../core/contracts/repository';
import { ActivityBar, type StudioTab } from './ActivityBar';
import { FileExplorerPane, cleanChapterName } from './FileExplorerPane';
import { StudioHeader } from './StudioHeader';
import { CharacterManagerPane } from '../characters/CharacterManagerPane';
import { CharacterModal } from '../characters/CharacterModal';

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
  const [activeFileId, setActiveFileId] = useState<string | null>(
    initialProject?.files[0]?.id ?? null
  );
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCharModalOpen, setIsCharModalOpen] = useState<boolean>(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);

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

  const handleSelectFile = useCallback((fileId: string) => {
    setActiveFileId(fileId);
  }, []);

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
      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to persist new script:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, repository]
  );

  const handleRenameFile = useCallback(
    async (fileId: string, newNormalizedName: string) => {
      if (!project) return;
      const updatedFiles = project.files.map((file) => {
        if (file.id === fileId) {
          return {
            ...file,
            name: newNormalizedName,
            version: file.version + 1,
          };
        }
        return file;
      });
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
        console.error('Failed to persist file rename:', err);
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
      const targetFile = project.files.find((f) => f.id === fileId);
      if (!targetFile) return;

      // Invariants: root file main.vns cannot be deleted, project must have at least 1 script
      if (targetFile.name === 'main.vns' || project.files.length <= 1) {
        return;
      }

      const remainingFiles = project.files.filter((f) => f.id !== fileId);
      const updated: Project = {
        ...project,
        files: remainingFiles,
        updatedAt: Date.now(),
      };
      setProject(updated);

      if (activeFileId === fileId) {
        const fallback = remainingFiles[0]?.id ?? null;
        setActiveFileId(fallback);
      }

      setIsSaving(true);
      try {
        await repository.updateProject(updated);
        setIsDirty(false);
      } catch (err) {
        console.error('Failed to persist file deletion:', err);
        setIsDirty(true);
      } finally {
        setIsSaving(false);
      }
    },
    [project, activeFileId, repository]
  );

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
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-700 transition"
          >
            Back to Projects Hub
          </button>
        )}
      </div>
    );
  }

  const activeFile = project.files.find((f) => f.id === activeFileId) ?? project.files[0];
  const canvasWidth = project.displaySettings?.width ?? 1920;
  const canvasHeight = project.displaySettings?.height ?? 1080;

  return (
    <div
      data-testid="studio-workspace-page"
      className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100 overflow-hidden select-none"
    >
      {/* Studio Top Header */}
      <StudioHeader
        projectTitle={project.title}
        isDirty={isDirty}
        isSaving={isSaving}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        onBack={onBackToHub ?? (() => {})}
        onTitleChange={handleTitleChange}
        onQuickPlay={onQuickPlay ?? (() => {})}
        onOpenSettings={onOpenSettings ?? (() => {})}
        onExport={onExport}
      />

      {/* 3-Column Studio Body */}
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {/* Column 1: Navigation Rail (ActivityBar + Content Pane) */}
        <div
          data-testid="col-navigation"
          className="flex shrink-0 h-full border-r border-neutral-800 bg-neutral-900/40"
        >
          <ActivityBar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onOpenSettings={onOpenSettings}
          />

          {activeTab === 'scripts' && (
            <FileExplorerPane
              files={project.files}
              activeFileId={activeFileId}
              entrySceneName="main.vns"
              onSelectFile={handleSelectFile}
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
            <div
              data-testid="pane-assets-placeholder"
              className="flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-900/60 p-4 text-neutral-400 text-xs select-none"
            >
              <span className="font-semibold uppercase tracking-wider text-neutral-300">
                Asset Library
              </span>
              <p className="mt-2 text-neutral-500">
                Asset library & safe delete pane (Coming in Milestone 5)
              </p>
            </div>
          )}
        </div>

        {/* Column 2: Center Workspace (Editor Tab Bar + Script Content + Bottom Drawer) */}
        <div
          data-testid="col-workspace"
          className="flex flex-1 flex-col min-w-0 h-full border-r border-neutral-800 bg-neutral-950"
        >
          {/* Header Tab Bar Placeholder */}
          <div
            data-testid="workspace-tab-bar"
            className="flex h-9 items-center border-b border-neutral-800 bg-neutral-900/80 px-2 text-xs"
          >
            <div className="flex items-center gap-2 rounded bg-neutral-800 px-3 py-1 font-mono text-neutral-200 border border-neutral-700/50">
              <span>{activeFile ? cleanChapterName(activeFile.name) : 'No file selected'}</span>
            </div>
          </div>

          {/* Center Script Container Placeholder */}
          <div
            data-testid="workspace-script-container"
            className="flex-1 overflow-auto p-4 font-mono text-xs text-neutral-300 bg-neutral-950/80"
          >
            <pre className="whitespace-pre-wrap">{activeFile?.content || '// Empty script file'}</pre>
          </div>

          {/* Bottom Drawer Placeholder */}
          <div
            data-testid="workspace-bottom-drawer"
            className="flex h-36 flex-col border-t border-neutral-800 bg-neutral-900/90 text-xs"
          >
            <div className="flex h-7 items-center border-b border-neutral-800 px-3 text-neutral-400">
              <span className="font-semibold tracking-wide uppercase text-[10px]">
                Diagnostics & Problems (Coming in Milestone 7)
              </span>
            </div>
            <div className="flex-1 p-2 text-neutral-500 font-mono">
              <span>Zero issues detected in current script workspace.</span>
            </div>
          </div>
        </div>

        {/* Column 3: Live Preview Dock (100% full-height with aspect-ratio locked container) */}
        <div
          data-testid="col-preview-dock"
          className="flex w-[400px] lg:w-[460px] shrink-0 h-full flex-col bg-neutral-900/70"
        >
          <div className="flex h-9 items-center justify-between border-b border-neutral-800 px-3 text-xs text-neutral-400">
            <span className="font-semibold">Live Preview</span>
            <span className="font-mono text-[10px] text-neutral-500">
              {canvasWidth} × {canvasHeight}
            </span>
          </div>

          <div className="flex flex-1 items-center justify-center p-4 overflow-hidden">
            <div
              data-testid="preview-dock-container"
              className="relative flex w-full items-center justify-center rounded border border-neutral-800 bg-black shadow-2xl overflow-hidden"
              style={{
                aspectRatio: `${canvasWidth} / ${canvasHeight}`,
                maxHeight: '100%',
              }}
            >
              <div className="text-center text-xs text-neutral-500 font-mono">
                <span>Preview Dock Standby (Coming in Milestone 8)</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <CharacterModal
        isOpen={isCharModalOpen}
        initialData={editingCharacter}
        existingIds={(project.characters || []).map((c) => c.id)}
        onClose={() => setIsCharModalOpen(false)}
        onSave={handleSaveCharacter}
      />
    </div>
  );
};
