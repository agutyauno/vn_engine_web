import React from 'react';
import { PlayIcon, SettingsIcon } from '../common/Icons';

interface StudioHeaderProps {
  projectTitle: string;
  onBack: () => void;
  onQuickPlay: () => void;
  onOpenSettings: () => void;
  onExport?: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  projectTitle,
  onBack,
  onQuickPlay,
  onOpenSettings,
  onExport,
}) => {
  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 text-neutral-100 select-none">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="btn-back-hub"
          onClick={onBack}
          title="Back to Project Hub"
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Projects
        </button>

        <span className="text-neutral-700">|</span>

        <h1
          data-testid="header-project-title"
          className="text-sm font-semibold text-neutral-200 tracking-tight"
        >
          {projectTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="btn-quick-play"
          onClick={onQuickPlay}
          title="Run Live Preview from active scene"
          className="flex items-center gap-1.5 rounded bg-white px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 transition"
        >
          <PlayIcon size={11} />
          Quick Play
        </button>

        {onExport && (
          <button
            type="button"
            data-testid="btn-export-project"
            onClick={onExport}
            title="Export Release Package"
            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
          >
            Export
          </button>
        )}

        <button
          type="button"
          data-testid="btn-project-settings"
          onClick={onOpenSettings}
          title="Project Settings"
          aria-label="Settings"
          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  );
};
