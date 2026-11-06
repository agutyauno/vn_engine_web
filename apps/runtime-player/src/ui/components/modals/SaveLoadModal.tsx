import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import { CloseIcon } from '../common/Icons';

export interface SaveLoadModalProps {
  mode: 'save' | 'load';
}

export function SaveLoadModal({ mode }: SaveLoadModalProps): JSX.Element {
  const state = usePlayerState();
  const actions = usePlayerActions();
  const slots = Array.from({ length: 6 }, (_, i) => state.saveSlots[i] ?? null);

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
                onClick={() => {
                  if (mode === 'save') {
                    void actions.saveSlot(slotNumber);
                  } else if (mode === 'load' && slotData !== null) {
                    void actions.loadSlot(slotNumber);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Slot ${slotNumber} ${isEmpty ? 'Empty' : slotData.previewText}`}
              >
                <div className="slot-number">Slot {slotNumber}</div>
                {slotData ? (
                  <div className="slot-details">
                    <div className="slot-scene">{slotData.currentScene}</div>
                    <div className="slot-preview">{slotData.previewText}</div>
                    <div className="slot-date">{new Date(slotData.timestamp).toLocaleString()}</div>
                  </div>
                ) : (
                  <div className="slot-empty-label">Empty Slot</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
