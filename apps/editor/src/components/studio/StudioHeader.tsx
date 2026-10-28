import React, { useState, useEffect } from 'react';
import { PlayIcon, SettingsIcon, ChevronLeftIcon, EditIcon } from '../common/Icons';

export interface StudioHeaderProps {
  projectTitle: string;
  isDirty?: boolean;
  isSaving?: boolean;
  lastSavedAt?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  resolution?: { width: number; height: number; orientation?: string };
  onBack: () => void;
  onTitleChange?: (newTitle: string) => void;
  onQuickPlay?: () => void;
  onOpenSettings?: () => void;
  onExport?: () => void;
}

export function getAspectRatioBadge(width?: number, height?: number): string {
  const w = width ?? 1920;
  const h = height ?? 1080;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(w, h);
  const wRatio = w / divisor;
  const hRatio = h / divisor;
  return `${w} × ${h} (${wRatio}:${hRatio})`;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  projectTitle,
  isDirty = false,
  isSaving = false,
  canvasWidth,
  canvasHeight,
  resolution,
  onBack,
  onTitleChange,
  onQuickPlay,
  onOpenSettings,
  onExport,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(projectTitle);

  useEffect(() => {
    setTitleValue(projectTitle);
  }, [projectTitle]);

  const handleTitleSubmit = () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== projectTitle && onTitleChange) {
      onTitleChange(trimmed);
    } else {
      setTitleValue(projectTitle);
    }
    setIsEditingTitle(false);
  };

  const effectiveWidth = resolution?.width ?? canvasWidth ?? 1920;
  const effectiveHeight = resolution?.height ?? canvasHeight ?? 1080;

  let saveStatusText = 'Saved to IndexedDB';
  let saveStatusClass = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';

  if (isSaving) {
    saveStatusText = 'Saving...';
    saveStatusClass = 'text-amber-400 bg-amber-950/40 border-amber-800/40';
  } else if (isDirty) {
    saveStatusText = 'Unsaved changes';
    saveStatusClass = 'text-amber-400/80 bg-neutral-800 border-neutral-700/60';
  }

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 text-neutral-100 select-none">
      {/* Left: Back button & Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="btn-back-hub"
          onClick={onBack}
          title="Back to Project Hub"
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          <ChevronLeftIcon size={14} />
          Projects
        </button>

        <span className="text-neutral-700">|</span>

        {isEditingTitle ? (
          <input
            type="text"
            autoFocus
            data-testid="input-header-title"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setTitleValue(projectTitle);
                setIsEditingTitle(false);
              }
            }}
            onBlur={handleTitleSubmit}
            className="rounded border border-neutral-600 bg-neutral-950 px-2 py-0.5 text-xs font-semibold text-white focus:outline-none"
          />
        ) : (
          <div
            className="group flex items-center gap-1.5 cursor-pointer rounded px-1.5 py-0.5 hover:bg-neutral-800/60 transition"
            onClick={() => setIsEditingTitle(true)}
            title="Click to rename project"
          >
            <h1
              data-testid="header-project-title"
              className="text-sm font-semibold text-neutral-200 tracking-tight"
            >
              {projectTitle}
            </h1>
            <EditIcon size={12} className="opacity-0 group-hover:opacity-100 text-neutral-500 transition-opacity" />
            {isDirty && (
              <span
                data-testid="header-dirty-dot"
                className="text-amber-500 font-bold ml-0.5"
                title="Unsaved changes"
              >
                ●
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center: Resolution & Save Status */}
      <div className="flex items-center gap-3">
        <div
          data-testid="header-resolution-badge"
          className="rounded bg-neutral-800/80 px-2.5 py-0.5 text-[11px] font-mono text-neutral-400 border border-neutral-700/50"
        >
          {getAspectRatioBadge(effectiveWidth, effectiveHeight)}
        </div>

        <div
          data-testid="header-save-status"
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono border ${saveStatusClass}`}
        >
          {saveStatusText}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {onQuickPlay && (
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
        )}

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

        {onOpenSettings && (
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
        )}
      </div>
    </header>
  );
};
