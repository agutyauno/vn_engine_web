import React, { useState, useEffect } from 'react';
import {
  ChevronLeftIcon,
  EditIcon,
  SaveIcon,
  DownloadIcon,
  PlayIcon,
  CrosshairIcon,
} from '../common/Icons';

export interface StudioHeaderProps {
  projectTitle?: string;
  title?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  lastSavedAt?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  width?: number;
  height?: number;
  resolution?: { width: number; height: number; orientation?: string };
  scenes?: string[];
  selectedScene?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'standby';
  onBack?: () => void;
  onBackToHub?: () => void;
  onTitleChange?: (newTitle: string) => void;
  onQuickPlay?: () => void;
  onRunFromCursor?: () => void;
  onSelectScene?: (scene: string) => void;
  onOpenSettings?: () => void;
  onExport?: () => void;
  onSave?: () => void;
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
  title,
  isDirty = false,
  isSaving = false,
  scenes,
  selectedScene,
  connectionStatus = 'standby',
  onBack,
  onBackToHub,
  onTitleChange,
  onQuickPlay,
  onRunFromCursor,
  onSelectScene,
  onExport,
  onSave,
}) => {
  const resolvedTitle = projectTitle ?? title ?? '';
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(resolvedTitle);

  useEffect(() => {
    setTitleValue(resolvedTitle);
  }, [resolvedTitle]);

  const handleTitleSubmit = () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== resolvedTitle && onTitleChange) {
      onTitleChange(trimmed);
    } else {
      setTitleValue(resolvedTitle);
    }
    setIsEditingTitle(false);
  };

  const handleBack = onBack ?? onBackToHub ?? (() => {});

  let saveStatusText = 'Saved to IndexedDB';
  let saveStatusClass = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';

  if (isSaving) {
    saveStatusText = 'Saving...';
    saveStatusClass = 'text-amber-400 bg-amber-950/40 border-amber-800/40';
  } else if (isDirty) {
    saveStatusText = 'Unsaved changes';
    saveStatusClass = 'text-amber-400/80 bg-neutral-800 border-neutral-700/60';
  }

  const currentStatus = connectionStatus || 'standby';
  const statusDotClass =
    currentStatus === 'connected'
      ? 'bg-emerald-500'
      : currentStatus === 'disconnected'
      ? 'bg-red-500'
      : 'bg-neutral-500';

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 text-neutral-100 select-none">
      {/* Left: Back button & Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="btn-back-hub"
          onClick={handleBack}
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
                setTitleValue(resolvedTitle);
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
              {resolvedTitle}
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

      {/* Center: Runner Controls & Save Status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md bg-neutral-950/70 p-0.5 border border-neutral-800">
          {/* Play (F5) button */}
          <button
            type="button"
            data-testid="btn-header-play"
            title="Play (F5)"
            onClick={onQuickPlay}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-950/50 hover:text-emerald-300 transition"
          >
            <PlayIcon size={13} />
            <span>Play</span>
          </button>

          {/* Run from Cursor (Alt+F5) button */}
          <button
            type="button"
            data-testid="btn-header-run-cursor"
            title="Run from Cursor (Alt+F5)"
            onClick={onRunFromCursor}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
          >
            <CrosshairIcon size={13} />
            <span>Run from Cursor</span>
          </button>

          {/* Scene Dropdown */}
          <div className="h-4 w-px bg-neutral-800 mx-0.5" />
          <select
            data-testid="select-header-scene"
            value={selectedScene ?? ''}
            onChange={(e) => onSelectScene?.(e.target.value)}
            title="Select Scene"
            className="bg-transparent px-2 py-1 text-xs text-neutral-300 rounded focus:outline-none focus:bg-neutral-900 border-none cursor-pointer"
          >
            {(scenes || []).map((s) => (
              <option key={s} value={s} className="bg-neutral-900 text-neutral-200">
                {s}
              </option>
            ))}
          </select>

          {/* Preview Connection Status Indicator */}
          <div className="h-4 w-px bg-neutral-800 mx-0.5" />
          <div
            data-testid="header-preview-status"
            data-status={currentStatus}
            title={`Preview: ${currentStatus}`}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-neutral-400"
          >
            <span className={`inline-block h-2 w-2 rounded-full ${statusDotClass}`} />
            <span className="capitalize">{currentStatus}</span>
          </div>
        </div>

        {/* Save Status Badge */}
        <div
          data-testid="header-save-status"
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono border ${saveStatusClass}`}
        >
          {saveStatusText}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {onExport && (
          <button
            type="button"
            data-testid="btn-header-export"
            onClick={onExport}
            title="Export project bundle"
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <DownloadIcon size={13} />
            <span>Export</span>
          </button>
        )}
        {onSave && (
          <button
            type="button"
            data-testid="btn-manual-save"
            onClick={onSave}
            title={isDirty ? "Save project (Ctrl+S)" : "All changes saved"}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
              isDirty
                ? 'bg-amber-600/90 text-white hover:bg-amber-500'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            <SaveIcon size={13} />
            <span>Save</span>
          </button>
        )}
      </div>
    </header>
  );
};
