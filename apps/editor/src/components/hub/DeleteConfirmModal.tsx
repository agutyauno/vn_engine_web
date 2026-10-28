import React, { useState } from 'react';
import { TrashIcon, CloseIcon } from '../common/Icons';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  projectName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  projectName,
  onClose,
  onConfirm,
}) => {
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
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
            Are you sure you want to delete <span className="font-semibold text-white">"{projectName}"</span>?
          </p>
          <p className="text-xs text-neutral-400">
            This action cannot be undone. All project scripts, assets, and settings stored locally will be permanently removed.
          </p>
        </div>

        <div className="mt-6 flex justify-end space-x-3 border-t border-neutral-800 pt-3">
          <button
            type="button"
            data-testid="btn-cancel-delete-project"
            onClick={onClose}
            disabled={deleting}
            className="rounded px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="btn-confirm-delete-project"
            onClick={handleConfirm}
            disabled={deleting}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
};
