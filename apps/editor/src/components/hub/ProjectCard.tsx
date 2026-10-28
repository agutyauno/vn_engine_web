import React from 'react';
import { ProjectSummary } from '../../core/contracts/repository';
import { PlayIcon, CopyIcon, TrashIcon } from '../common/Icons';

interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpen,
  onDuplicate,
  onDelete,
}) => {
  const resolutionText = `${project.canvasWidth} × ${project.canvasHeight}`;

  const formattedDate = new Date(project.updatedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      data-testid={`card-project-${project.id}`}
      className="group flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-900/80 p-5 transition-all hover:border-neutral-600 hover:bg-neutral-900 shadow-sm"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3
            className="cursor-pointer text-base font-semibold text-white group-hover:text-neutral-100 transition-colors"
            onClick={() => onOpen(project.id)}
          >
            {project.title}
          </h3>
          <span className="shrink-0 rounded bg-neutral-800 px-2 py-0.5 text-xs font-mono text-neutral-300">
            {resolutionText}
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-neutral-400 line-clamp-2">
          {project.description || 'No description provided.'}
        </p>

        <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
          <span>{project.scriptCount} script{project.scriptCount === 1 ? '' : 's'}</span>
          <span>•</span>
          <span>{project.characterCount} char{project.characterCount === 1 ? '' : 's'}</span>
          <span>•</span>
          <span>Updated {formattedDate}</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-neutral-800/80 pt-3">
        <button
          type="button"
          data-testid={`btn-open-project-${project.id}`}
          onClick={() => onOpen(project.id)}
          className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-neutral-200"
        >
          <PlayIcon size={12} />
          Open
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid={`btn-duplicate-project-${project.id}`}
            onClick={() => onDuplicate(project.id)}
            title="Duplicate Project"
            aria-label="Duplicate Project"
            className="rounded p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
          >
            <CopyIcon size={15} />
          </button>
          <button
            type="button"
            data-testid={`btn-delete-project-${project.id}`}
            onClick={() => onDelete(project.id)}
            title="Delete Project"
            aria-label="Delete Project"
            className="rounded p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-red-400"
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
