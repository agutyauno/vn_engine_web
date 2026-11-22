import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SaveSlotData } from '../../../core/contracts';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import { CloseIcon, TrashIcon } from '../common/Icons';

export interface SaveLoadModalProps {
  mode: 'save' | 'load';
}

interface ConfirmState {
  kind: 'overwrite' | 'progress_loss' | 'delete';
  slot: number;
}

export function SaveLoadModal({ mode }: SaveLoadModalProps): JSX.Element {
  const state = usePlayerState();
  const actions = usePlayerActions();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const confirmRef = useRef<ConfirmState | null>(confirm);
  confirmRef.current = confirm;

  const slots: (SaveSlotData | null)[] = Array.from(
    { length: 6 },
    (_, i) => state.saveSlots[i] ?? null,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (confirmRef.current !== null) {
        setConfirm(null);
      } else {
        actions.closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [actions]);

  const activateSlot = (slotNumber: number, slotData: SaveSlotData | null): void => {
    if (mode === 'save') {
      if (slotData === null) {
        void actions.saveSlot(slotNumber);
      } else {
        setConfirm({ kind: 'overwrite', slot: slotNumber });
      }
    } else {
      if (slotData !== null) {
        if (state.mode === 'GAMEPLAY') {
          setConfirm({ kind: 'progress_loss', slot: slotNumber });
        } else {
          void actions.loadSlot(slotNumber);
        }
      }
    }
  };

  return (
    <div
      id="modal-saveload"
      className="modal-saveload-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) {
          actions.closeModal();
        }
      }}
    >
      <div className="modal-saveload-window">
        <div className="modal-header">
          <h2>{mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
          <button
            id="btn-close-modal"
            className="btn-close-modal"
            onClick={() => actions.closeModal()}
            aria-label="Close modal"
            title="Close"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="save-slots-grid">
          {slots.map((slotData, index) => {
            const slotNumber = index + 1;
            const isEmpty = slotData === null;
            return (
              <div
                key={slotNumber}
                className={`save-slot-card ${isEmpty ? 'empty' : 'occupied'}`}
                role="button"
                tabIndex={0}
                aria-label={`Slot ${slotNumber} ${slotData === null ? 'Empty' : slotData.previewText}`}
                onClick={() => activateSlot(slotNumber, slotData)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateSlot(slotNumber, slotData);
                  }
                }}
              >
                <div className="slot-badge">SLOT {slotNumber}</div>
                {slotData ? (
                  <>
                    <button
                      type="button"
                      className="btn-delete-slot"
                      aria-label={`Delete slot ${slotNumber}`}
                      title="Delete"
                      onClick={e => {
                        e.stopPropagation();
                        setConfirm({ kind: 'delete', slot: slotNumber });
                      }}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setConfirm({ kind: 'delete', slot: slotNumber });
                        }
                      }}
                    >
                      <TrashIcon size={16} />
                    </button>
                    {slotData.thumbnailDataUrl ? (
                      <img
                        className="slot-thumbnail"
                        src={slotData.thumbnailDataUrl}
                        alt={`Slot ${slotNumber} thumbnail`}
                      />
                    ) : (
                      <div className="slot-thumbnail-placeholder" />
                    )}
                    <div className="slot-details">
                      <div className="slot-scene">{slotData.currentScene}</div>
                      <div className="slot-preview">{slotData.previewText}</div>
                      <div className="slot-date">
                        {new Date(slotData.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="slot-empty-label">Empty Slot</div>
                )}
              </div>
            );
          })}
        </div>

        {confirm && (
          <div
            className="saveload-confirm-overlay settings-confirm-overlay"
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <div
              id="saveload-confirm"
              className="saveload-confirm-dialog settings-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="saveload-confirm-message"
              onClick={e => {
                e.stopPropagation();
              }}
            >
              <p id="saveload-confirm-message">
                {confirm.kind === 'overwrite' &&
                  `Overwrite slot ${confirm.slot}? The existing save will be replaced.`}
                {confirm.kind === 'progress_loss' &&
                  `Load slot ${confirm.slot}? Any unsaved progress will be lost.`}
                {confirm.kind === 'delete' && `Delete slot ${confirm.slot}? This cannot be undone.`}
              </p>
              <div className="saveload-confirm-actions settings-confirm-actions">
                <button
                  id="btn-confirm-action"
                  className={`wf-btn ${confirm.kind === 'delete' ? 'wf-btn-danger' : 'wf-btn-primary'}`}
                  onClick={() => {
                    const { kind, slot } = confirm;
                    setConfirm(null);
                    if (kind === 'overwrite') {
                      void actions.saveSlot(slot);
                    } else if (kind === 'progress_loss') {
                      void actions.loadSlot(slot);
                    } else if (kind === 'delete') {
                      void actions.deleteSlot(slot);
                    }
                  }}
                  aria-label={
                    confirm.kind === 'overwrite'
                      ? 'Overwrite'
                      : confirm.kind === 'progress_loss'
                        ? 'Load'
                        : 'Delete'
                  }
                  title={
                    confirm.kind === 'overwrite'
                      ? 'Overwrite'
                      : confirm.kind === 'progress_loss'
                        ? 'Load'
                        : 'Delete'
                  }
                >
                  {confirm.kind === 'overwrite'
                    ? 'Overwrite'
                    : confirm.kind === 'progress_loss'
                      ? 'Load'
                      : 'Delete'}
                </button>
                <button
                  id="btn-cancel-action"
                  className="wf-btn"
                  onClick={() => setConfirm(null)}
                  aria-label="Cancel"
                  title="Cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
