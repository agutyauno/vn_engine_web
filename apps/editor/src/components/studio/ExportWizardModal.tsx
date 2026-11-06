import React, { useState } from 'react';
import type { Project } from '@vn-engine/shared-types';
import { XIcon, DownloadIcon } from '../common/Icons';

export interface ExportWizardModalProps {
  isOpen: boolean;
  project: Project;
  onClose: () => void;
  onExport: (target: 'web' | 'desktop' | 'backup') => void;
}

export type ExportTarget = 'web' | 'desktop' | 'backup';

export const ExportWizardModal: React.FC<ExportWizardModalProps> = ({
  isOpen,
  project,
  onClose,
  onExport,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<ExportTarget>('web');

  if (!isOpen) return null;

  const handleDownload = () => {
    onExport(selectedTarget);
  };

  return (
    <div
      data-testid="modal-export-wizard"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex h-[440px] w-full max-w-lg flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-4 bg-neutral-950">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <DownloadIcon size={16} className="text-neutral-400" />
            <span>Export Release Package</span>
          </div>

          <button
            type="button"
            data-testid="btn-close-export"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-5 text-xs text-neutral-300 space-y-4">
          <p className="text-neutral-400">
            Select the release format for <strong className="text-white font-medium">{project.title}</strong>:
          </p>

          <div className="space-y-2">
            {/* 1. Web Release ZIP */}
            <div
              data-testid="export-target-web"
              onClick={() => setSelectedTarget('web')}
              className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition ${
                selectedTarget === 'web'
                  ? 'border-neutral-400 bg-neutral-800/80'
                  : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800/40'
              }`}
            >
              <input
                type="radio"
                name="export-target"
                checked={selectedTarget === 'web'}
                onChange={() => setSelectedTarget('web')}
                className="mt-0.5 accent-white"
              />
              <div>
                <span className="block font-semibold text-white">Web Release ZIP Package</span>
                <span className="text-[11px] text-neutral-400">
                  Ready-to-upload ZIP for itch.io, Game Jolt, or hosting on static Web servers.
                </span>
              </div>
            </div>

            {/* 2. Desktop Electron Bundle */}
            <div
              data-testid="export-target-desktop"
              onClick={() => setSelectedTarget('desktop')}
              className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition ${
                selectedTarget === 'desktop'
                  ? 'border-neutral-400 bg-neutral-800/80'
                  : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800/40'
              }`}
            >
              <input
                type="radio"
                name="export-target"
                checked={selectedTarget === 'desktop'}
                onChange={() => setSelectedTarget('desktop')}
                className="mt-0.5 accent-white"
              />
              <div>
                <span className="block font-semibold text-white">Desktop Electron App Bundle</span>
                <span className="text-[11px] text-neutral-400">
                  Pre-packaged offline release build for Windows, macOS, and Linux.
                </span>
              </div>
            </div>

            {/* 3. Project Backup */}
            <div
              data-testid="export-target-backup"
              onClick={() => setSelectedTarget('backup')}
              className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition ${
                selectedTarget === 'backup'
                  ? 'border-neutral-400 bg-neutral-800/80'
                  : 'border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800/40'
              }`}
            >
              <input
                type="radio"
                name="export-target"
                checked={selectedTarget === 'backup'}
                onChange={() => setSelectedTarget('backup')}
                className="mt-0.5 accent-white"
              />
              <div>
                <span className="block font-semibold text-white">Raw Project Backup (.json)</span>
                <span className="text-[11px] text-neutral-400">
                  Full snapshot of scripts, characters, and assets for easy import & backup.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex h-12 items-center justify-end gap-2 border-t border-neutral-800 px-4 bg-neutral-950">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid="btn-export-download"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded bg-white px-4 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 transition"
          >
            <DownloadIcon size={12} />
            <span>Generate & Download</span>
          </button>
        </div>
      </div>
    </div>
  );
};
