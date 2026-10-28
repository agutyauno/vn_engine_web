import React, { useState } from 'react';
import type { ScriptFile } from '@vn-engine/shared-types';
import { PlusIcon, TrashIcon, FileTextIcon, EditIcon } from '../common/Icons';

export interface FileExplorerPaneProps {
  files: ScriptFile[];
  activeFileId: string | null;
  entrySceneName?: string;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeleteFile: (fileId: string) => void;
}

/**
 * Strips .vns extension for clean display in UI (UT-EDT-07)
 */
export function cleanChapterName(filename: string): string {
  return filename.replace(/\.vns$/i, '');
}

/**
 * Normalizes user input into a canonical .vns filename, preserving base-name casing
 */
export function normalizeScriptName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().endsWith('.vns')) {
    return trimmed.slice(0, -4) + '.vns';
  }
  return `${trimmed}.vns`;
}

/**
 * Validates a script filename against forbidden characters, emptiness, and duplicates
 */
export function validateFileName(
  name: string,
  existingNames: string[],
  currentName?: string
): { valid: boolean; error?: string; normalizedName?: string } {
  const trimmed = name.trim();
  if (!trimmed || trimmed.toLowerCase() === '.vns') {
    return { valid: false, error: 'File name cannot be empty.' };
  }

  const normalized = normalizeScriptName(trimmed);

  // Check forbidden characters: \ / : * ? " < > |
  if (/[\\/:*?"<>|]/.test(normalized)) {
    return {
      valid: false,
      error: 'File name cannot contain characters: \\ / : * ? " < > |',
    };
  }

  const normalizedLower = normalized.toLowerCase();
  const currentLower = currentName ? normalizeScriptName(currentName).toLowerCase() : undefined;

  const isDuplicate = existingNames.some((existing) => {
    const existingNormLower = normalizeScriptName(existing).toLowerCase();
    if (currentLower && existingNormLower === currentLower) {
      return false; // ignore self when renaming
    }
    return existingNormLower === normalizedLower;
  });

  if (isDuplicate) {
    return {
      valid: false,
      error: `File "${normalized}" already exists!`,
    };
  }

  return { valid: true, normalizedName: normalized };
}

/**
 * Generates sequential Windows-style default script names (e.g. New Script.vns, New Script (2).vns)
 */
export function generateDefaultScriptName(existingNames: string[]): string {
  const base = 'New Script';
  let candidate = `${base}.vns`;
  let counter = 2;
  const set = new Set(existingNames.map((n) => normalizeScriptName(n).toLowerCase()));

  while (set.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter}).vns`;
    counter++;
  }
  return candidate;
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
  const [validationError, setValidationError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleCreateSubmit = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) {
      setIsCreating(false);
      setValidationError(null);
      return;
    }
    const existingNames = files.map((f) => f.name);
    const validation = validateFileName(trimmed, existingNames);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid file name');
      return;
    }

    onCreateFile(validation.normalizedName!);
    setNewFileName('');
    setValidationError(null);
    setIsCreating(false);
  };

  const handleRenameSubmit = (fileId: string) => {
    const targetFile = files.find((f) => f.id === fileId);
    if (!targetFile) return;

    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('File name cannot be empty.');
      return;
    }

    const existingNames = files.map((f) => f.name);
    const validation = validateFileName(trimmed, existingNames, targetFile.name);
    if (!validation.valid) {
      setRenameError(validation.error || 'Invalid file name');
      return;
    }

    onRenameFile(fileId, validation.normalizedName!);
    setRenamingId(null);
    setRenameValue('');
    setRenameError(null);
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
            setValidationError(null);
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
          <div className="flex flex-col gap-1 rounded bg-neutral-800/80 p-1.5">
            <div className="flex items-center gap-1.5">
              <FileTextIcon size={14} className="shrink-0 text-neutral-400" />
              <input
                type="text"
                autoFocus
                data-testid="input-new-script-name"
                value={newFileName}
                onChange={(e) => {
                  setNewFileName(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setValidationError(null);
                  }
                }}
                onBlur={() => {
                  if (newFileName.trim()) {
                    handleCreateSubmit();
                  } else {
                    setIsCreating(false);
                    setValidationError(null);
                  }
                }}
                placeholder="script_name"
                className="w-full bg-transparent text-xs text-white focus:outline-none font-mono"
              />
            </div>
            {validationError && (
              <span data-testid="file-validation-error" className="text-[10px] text-red-400 px-1">
                {validationError}
              </span>
            )}
          </div>
        )}

        {files.map((file) => {
          const isEntry =
            file.name === entrySceneName ||
            cleanChapterName(file.name) === cleanChapterName(entrySceneName) ||
            file.name === 'main.vns';
          const isDeleteDisabled = isEntry || files.length <= 1;
          const isActive = file.id === activeFileId;
          const isEditing = file.id === renamingId;
          const displayName = cleanChapterName(file.name);

          return (
            <div
              key={file.id}
              data-testid={`file-item-${file.id}`}
              style={isActive ? { backgroundColor: 'var(--vn-primary-highlight, #1e293b)' } : undefined}
              className={`group flex flex-col rounded px-2 py-1.5 text-xs transition cursor-pointer ${
                isActive
                  ? 'text-white font-medium'
                  : 'hover:bg-neutral-800/50 text-neutral-400 hover:text-neutral-200'
              }`}
              onClick={() => onSelectFile(file.id)}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 overflow-hidden pr-2 flex-1">
                  <FileTextIcon
                    size={14}
                    className={`shrink-0 ${isActive ? 'text-white' : 'text-neutral-500'}`}
                  />

                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      data-testid={`input-rename-file-${file.id}`}
                      value={renameValue}
                      onChange={(e) => {
                        setRenameValue(e.target.value);
                        if (renameError) setRenameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(file.id);
                        if (e.key === 'Escape') {
                          setRenamingId(null);
                          setRenameError(null);
                        }
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
                        setRenameError(null);
                      }}
                      title="Rename Script"
                      className="rounded p-1 text-neutral-400 hover:text-white"
                    >
                      <EditIcon size={12} />
                    </button>

                    <button
                      type="button"
                      data-testid={`btn-delete-file-${file.id}`}
                      disabled={isDeleteDisabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDeleteDisabled) onDeleteFile(file.id);
                      }}
                      title={
                        isEntry
                          ? 'Entry scene cannot be deleted'
                          : files.length <= 1
                          ? 'Cannot delete the only script file'
                          : 'Delete Script'
                      }
                      className={`rounded p-1 ${
                        isDeleteDisabled
                          ? 'cursor-not-allowed opacity-30 text-neutral-600'
                          : 'text-neutral-400 hover:text-red-400'
                      }`}
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                )}
              </div>

              {renameError && renamingId === file.id && (
                <span data-testid={`rename-error-${file.id}`} className="text-[10px] text-red-400 mt-1 block">
                  {renameError}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
