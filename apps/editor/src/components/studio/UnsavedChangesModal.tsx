import React from 'react';
import { AlertTriangleIcon, XIcon, SaveIcon, TrashIcon } from '../common/Icons';

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onSaveAndContinue: () => void | Promise<void>;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-testid="modal-unsaved-changes"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex w-full max-w-md flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-4 bg-neutral-950">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <AlertTriangleIcon size={16} className="text-amber-400" />
            <span id="unsaved-modal-title">Unsaved Changes</span>
          </div>

          <button
            type="button"
            data-testid="btn-close-unsaved"
            onClick={onCancel}
            title="Close dialog"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 text-xs text-neutral-300 space-y-2">
          <p className="text-sm font-medium text-white">
            There are unsaved modifications in your project.
          </p>
          <p className="text-neutral-400 leading-relaxed">
            Leaving or switching scenes without saving will discard any modifications made since the
            last save point. What would you like to do?
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex h-14 items-center justify-between border-t border-neutral-800 px-4 bg-neutral-950/80">
          <button
            type="button"
            data-testid="btn-cancel-unsaved"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="btn-discard-and-continue"
              onClick={onDiscardAndContinue}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800/80 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-red-950/60 hover:border-red-800 hover:text-red-300 transition"
            >
              <TrashIcon size={13} />
              <span>Don't Save</span>
            </button>

            <button
              type="button"
              data-testid="btn-save-and-continue"
              onClick={onSaveAndContinue}
              className="flex items-center gap-1.5 rounded bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-neutral-200 transition"
            >
              <SaveIcon size={13} />
              <span>Save & Continue</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
