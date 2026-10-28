import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ProjectRepository, ProjectSummary, CreateProjectParams } from '../../core/contracts/repository';
import { PlusIcon, SearchIcon, FolderIcon } from '../common/Icons';
import { ProjectCard } from './ProjectCard';
import { NewProjectModal } from './NewProjectModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface ProjectHubViewProps {
  repository: ProjectRepository;
  onOpenProject: (projectId: string) => void;
}

export const ProjectHubView: React.FC<ProjectHubViewProps> = ({ repository, onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageUsage, setStorageUsage] = useState<{ usedBytes: number; quotaBytes?: number } | null>(null);

  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const list = await repository.listProjects();
      setProjects(list);
      const usage = await repository.getStorageUsage();
      setStorageUsage(usage);
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async (params: CreateProjectParams) => {
    const created = await repository.createProject(params);
    await loadProjects();
    onOpenProject(created.id);
  };

  const handleDuplicateProject = async (id: string) => {
    const original = projects.find((p) => p.id === id);
    const newTitle = original ? `${original.title} - Copy` : 'Cloned Project';
    await repository.duplicateProject(id, newTitle);
    await loadProjects();
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    await repository.deleteProject(projectToDelete.id);
    setProjectToDelete(null);
    await loadProjects();
  };

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
    );
  }, [projects, searchQuery]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-white font-bold">
              VN
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">Visual Novel Studio</h1>
              <p className="text-xs text-neutral-400">Project Management & Workspace Hub</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {storageUsage && (
              <span className="hidden text-xs text-neutral-400 sm:inline-block">
                Storage: <span className="font-mono text-neutral-200">{formatBytes(storageUsage.usedBytes)}</span> used
              </span>
            )}
            <button
              type="button"
              data-testid="btn-new-project"
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-2 rounded bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
            >
              <PlusIcon size={16} />
              New Project
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
        {/* Controls: Search and Counter */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <SearchIcon
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="text"
              data-testid="input-project-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects by name or description..."
              className="w-full rounded border border-neutral-800 bg-neutral-900 py-2 pl-9 pr-4 text-sm text-neutral-200 placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div className="text-xs text-neutral-400">
            Showing <span className="font-semibold text-neutral-200">{filteredProjects.length}</span> of{' '}
            <span className="font-semibold text-neutral-200">{projects.length}</span> projects
          </div>
        </div>

        {/* Projects Grid or Empty State */}
        {loading ? (
          <div className="py-20 text-center text-sm text-neutral-500">Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div
            data-testid="empty-projects-state"
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-800 py-16 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-400">
              <FolderIcon size={24} />
            </div>
            <h3 className="mt-4 text-sm font-medium text-white">No projects found</h3>
            <p className="mt-1 text-xs text-neutral-400 max-w-sm">
              {searchQuery
                ? 'No projects match your current search query. Try typing something else.'
                : 'Get started by creating your very first visual novel project.'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => setIsNewModalOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
              >
                <PlusIcon size={14} />
                Create First Project
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="projects-grid"
            className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
          >
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={onOpenProject}
                onDuplicate={handleDuplicateProject}
                onDelete={(id) => {
                  const target = projects.find((item) => item.id === id);
                  if (target) setProjectToDelete(target);
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <NewProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <DeleteConfirmModal
        isOpen={!!projectToDelete}
        projectName={projectToDelete?.title ?? ''}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
