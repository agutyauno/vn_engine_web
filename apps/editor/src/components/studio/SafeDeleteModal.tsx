import React from 'react';
import type { AssetRef, Project } from '@vn-engine/shared-types';
import { checkAssetDeletionSafety } from '../../core/services/reconciliation';
import { AlertTriangleIcon, CloseIcon, TrashIcon } from '../common/Icons';

export interface SafeDeleteModalProps {
  isOpen: boolean;
  asset: AssetRef | null;
  project: Project;
  onClose: () => void;
  onConfirmDelete: (asset: AssetRef) => void;
}

export const SafeDeleteModal: React.FC<SafeDeleteModalProps> = ({
  isOpen,
  asset,
  project,
  onClose,
  onConfirmDelete,
}) => {
  if (!isOpen || !asset) return null;

  const safety = checkAssetDeletionSafety(asset.id, project);
  const isBlocked = !safety.safe;

  return (
    <div
      data-testid="safe-delete-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex w-full max-w-md flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-2">
            {isBlocked ? (
              <AlertTriangleIcon size={16} className="text-amber-400" />
            ) : (
              <TrashIcon size={16} className="text-red-400" />
            )}
            <span className="font-semibold text-sm tracking-wide text-neutral-200">
              {isBlocked ? 'Cannot Delete Asset' : 'Delete Asset'}
            </span>
          </div>
          <button
            type="button"
            data-testid="btn-close-safe-delete"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {isBlocked ? (
            <div className="space-y-3">
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <p className="font-medium mb-1">
                  Cannot delete asset &apos;{asset.name}&apos;
                </p>
                <p className="text-neutral-300">
                  This asset is currently referenced by your story script. Remove or replace these references before deleting.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Script References ({safety.references.length})
                </label>
                <div className="max-h-36 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-2 space-y-1">
                  {safety.references.map((ref, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs text-neutral-300 bg-neutral-900/60"
                    >
                      <span className="font-mono">{ref.file}</span>
                      <span className="font-mono text-neutral-400 text-[11px]">
                        Line {ref.line}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-neutral-300">
                Are you sure you want to delete <span className="font-semibold text-white">&apos;{asset.name}&apos;</span>?
              </p>
              <p className="text-[11px] text-neutral-500">
                This asset is not referenced in any scripts. Deleting it will remove the asset and its stored file from local project storage.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
          <button
            type="button"
            data-testid="btn-cancel-safe-delete"
            onClick={onClose}
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
          >
            {isBlocked ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            data-testid="btn-confirm-delete-asset"
            disabled={isBlocked}
            onClick={() => {
              if (!isBlocked) {
                onConfirmDelete(asset);
              }
            }}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              isBlocked
                ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-500'
            }`}
          >
            Delete Asset
          </button>
        </div>
      </div>
    </div>
  );
};
