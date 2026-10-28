import React from 'react';
import type { ScriptFile } from '@vn-engine/shared-types';
import { cleanChapterName } from './FileExplorerPane';
import { CloseIcon, FileTextIcon, PlusIcon } from '../common/Icons';

export interface EditorTabBarProps {
  files: ScriptFile[];
  openFileIds: string[];
  activeFileId: string;
  dirtyFileIds: Set<string>;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string) => void;
  onNewFile?: () => void;
}

export const EditorTabBar: React.FC<EditorTabBarProps> = ({
  files,
  openFileIds,
  activeFileId,
  dirtyFileIds,
  onSelectTab,
  onCloseTab,
  onNewFile,
}) => {
  const fileMap = new Map(files.map((f) => [f.id, f]));

  return (
    <div
      data-testid="workspace-tab-bar"
      className="flex h-9 w-full items-center border-b border-neutral-800 bg-neutral-900/90 select-none overflow-x-auto overflow-y-hidden"
    >
      <div className="flex items-center h-full flex-1 min-w-0">
        {openFileIds.map((fileId) => {
          const file = fileMap.get(fileId);
          if (!file) return null;

          const isActive = fileId === activeFileId;
          const isDirty = dirtyFileIds.has(fileId);
          const displayName = cleanChapterName(file.name);

          return (
            <div
              key={fileId}
              data-testid={`editor-tab-${fileId}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSelectTab(fileId)}
              className={`group flex h-full items-center gap-2 border-r border-neutral-800 px-3.5 text-xs font-mono transition cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-neutral-950 text-white border-t-2 border-t-blue-500 font-medium'
                  : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200 border-t-2 border-t-transparent'
              }`}
            >
              <FileTextIcon size={13} className={isActive ? 'text-blue-400' : 'text-neutral-500'} />
              <span className="truncate max-w-[140px]">{displayName}</span>

              {/* Dirty Dot Indicator */}
              {isDirty && (
                <span
                  data-testid={`dirty-dot-${fileId}`}
                  className="text-amber-400 font-bold text-xs select-none"
                  title="Unsaved changes"
                >
                  ●
                </span>
              )}

              {/* Close Tab Button */}
              <button
                type="button"
                data-testid={`btn-close-tab-${fileId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(fileId);
                }}
                className="ml-1 rounded p-0.5 text-neutral-500 opacity-60 hover:opacity-100 hover:bg-neutral-800 hover:text-white transition"
                title="Close tab"
              >
                <CloseIcon size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* New File / New Tab Button */}
      {onNewFile && (
        <button
          type="button"
          data-testid="btn-new-tab"
          onClick={onNewFile}
          className="flex h-full items-center justify-center px-2.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition shrink-0 border-l border-neutral-800"
          title="New Script File"
        >
          <PlusIcon size={14} />
        </button>
      )}
    </div>
  );
};
