import React, { useState, useEffect } from 'react';
import { TrashIcon, CloseIcon } from '../common/Icons';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  projectName?: string;
  project?: { id?: string; title: string } | null;
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  projectName = '',
  project,
  isDeleting = false,
  onClose,
  onConfirm,
}) => {
  const [typedTitle, setTypedTitle] = useState('');
  const [deleting, setDeleting] = useState(false);

  const targetTitle = (project?.title ?? projectName).trim();

  useEffect(() => {
    if (isOpen) {
      setTypedTitle('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatched = typedTitle.trim() === targetTitle && targetTitle.length > 0;
  const isBusy = deleting || isDeleting;

  const handleConfirm = async () => {
    if (!isMatched || isBusy) return;
    try {
      setDeleting(true);
      await onConfirm();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      data-testid="modal-delete-project"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center space-x-2 text-red-400">
            <TrashIcon size={18} />
            <h2 className="text-lg font-semibold tracking-wide text-white">Delete Project</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-neutral-300">
          <p>
            Are you sure you want to delete <span className="font-semibold text-white">"{targetTitle}"</span>?
          </p>
          <p className="text-xs text-neutral-400">
            This action cannot be undone. All project scripts, assets, and settings stored locally will be permanently removed.
          </p>

          <div className="mt-4">
            <label
              htmlFor="confirm-delete-title-input"
              className="block text-xs font-medium text-neutral-400 mb-1"
            >
              Please type <span className="font-semibold text-white">{targetTitle}</span> to confirm:
            </label>
            <input
              id="confirm-delete-title-input"
              data-testid="confirm-delete-title-input"
              type="text"
              value={typedTitle}
              onChange={(e) => setTypedTitle(e.target.value)}
              placeholder={targetTitle}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-red-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3 border-t border-neutral-800 pt-3">
          <button
            type="button"
            data-testid="btn-cancel-delete-project"
            onClick={onClose}
            disabled={isBusy}
            className="rounded px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="btn-confirm-delete-project"
            onClick={handleConfirm}
            disabled={isBusy || !isMatched}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBusy ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
};
