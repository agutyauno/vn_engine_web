import React, { useState } from 'react';
import type { ScriptFile } from '@vn-engine/shared-types';
import { PlusIcon, TrashIcon, FileTextIcon } from '../common/Icons';

export interface FileExplorerPaneProps {
  files: ScriptFile[];
  activeFileId: string | null;
  entrySceneName?: string;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeleteFile: (fileId: string) => void;
}

export const FileExplorerPane: React.FC<FileExplorerPaneProps> = ({
  files,
  activeFileId,
  entrySceneName = 'main.vns',
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const stripExtension = (name: string) => name.replace(/\.vns$/i, '');
  const ensureExtension = (name: string) => (name.toLowerCase().endsWith('.vns') ? name : `${name}.vns`);

  const handleCreateSubmit = () => {
    const trimmed = newFileName.trim();
    if (trimmed) {
      onCreateFile(ensureExtension(trimmed));
      setNewFileName('');
      setIsCreating(false);
    }
  };

  const handleRenameSubmit = (fileId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameFile(fileId, ensureExtension(trimmed));
      setRenamingId(null);
      setRenameValue('');
    }
  };

  return (
    <div
      data-testid="pane-file-explorer"
      className="flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-900/60 text-neutral-300 select-none shrink-0"
    >
      {/* Pane Header */}
      <div className="flex h-10 items-center justify-between border-b border-neutral-800 px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Scripts ({files.length})
        </span>
        <button
          type="button"
          data-testid="btn-new-script"
          onClick={() => {
            setIsCreating(true);
            setNewFileName('');
          }}
          title="New Script File"
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isCreating && (
          <div className="flex items-center gap-1.5 rounded bg-neutral-800/80 px-2 py-1">
            <FileTextIcon size={14} className="shrink-0 text-neutral-400" />
            <input
              type="text"
              autoFocus
              data-testid="input-new-script-name"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubmit();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              onBlur={handleCreateSubmit}
              placeholder="script_name"
              className="w-full bg-transparent text-xs text-white focus:outline-none font-mono"
            />
          </div>
        )}

        {files.map((file) => {
          const isEntry = file.name === entrySceneName || stripExtension(file.name) === stripExtension(entrySceneName);
          const isActive = file.id === activeFileId;
          const isEditing = file.id === renamingId;
          const displayName = stripExtension(file.name);

          return (
            <div
              key={file.id}
              data-testid={`file-item-${file.id}`}
              className={`group flex items-center justify-between rounded px-2 py-1.5 text-xs transition cursor-pointer ${
                isActive
                  ? 'bg-neutral-800 text-white font-medium'
                  : 'hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200'
              }`}
              onClick={() => onSelectFile(file.id)}
            >
              <div className="flex items-center gap-2 overflow-hidden pr-2">
                <FileTextIcon size={14} className={`shrink-0 ${isActive ? 'text-white' : 'text-neutral-500'}`} />

                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    data-testid={`input-rename-file-${file.id}`}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(file.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => handleRenameSubmit(file.id)}
                    className="w-full bg-neutral-950 px-1 py-0.5 text-xs text-white rounded border border-neutral-600 focus:outline-none font-mono"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="truncate font-mono">{displayName}</span>
                )}

                {isEntry && (
                  <span
                    data-testid={`badge-entry-${file.id}`}
                    className="shrink-0 rounded bg-neutral-700/80 px-1.5 py-0.2 text-[10px] font-mono text-neutral-300"
                  >
                    Entry
                  </span>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    data-testid={`btn-rename-file-${file.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(file.id);
                      setRenameValue(displayName);
                    }}
                    title="Rename Script"
                    className="rounded p-1 text-neutral-400 hover:text-white"
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    data-testid={`btn-delete-file-${file.id}`}
                    disabled={isEntry}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isEntry) onDeleteFile(file.id);
                    }}
                    title={isEntry ? 'Entry scene cannot be deleted' : 'Delete Script'}
                    className={`rounded p-1 ${
                      isEntry
                        ? 'cursor-not-allowed opacity-30 text-neutral-600'
                        : 'text-neutral-400 hover:text-red-400'
                    }`}
                  >
                    <TrashIcon size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
