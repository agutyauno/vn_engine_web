import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import type { DesyncModalData } from '../../../core/contracts';

export interface DesyncModalProps {
  data?: DesyncModalData;
}

export function DesyncModal(props: DesyncModalProps): JSX.Element {
  const state = usePlayerState();
  const actions = usePlayerActions();
  const desyncInfo = props.data ?? state.desyncData;

  return (
    <div id="modal-desync" className="modal-desync-backdrop">
      <div className="modal-desync-window">
        <h2>Script Desynchronization Warning</h2>
        <div className="desync-details">
          <div>Scene: {desyncInfo?.sceneName}</div>
          <div>Current Hash: {desyncInfo?.currentHash}</div>
          <div>Saved Hash: {desyncInfo?.saveHash}</div>
        </div>
        <div className="desync-actions">
          <button
            id="btn-desync-continue"
            onClick={() => actions.resolveDesync('continue')}
            aria-label="Continue despite desync"
          >
            Continue
          </button>
          <button
            id="btn-desync-restart"
            onClick={() => actions.resolveDesync('restart')}
            aria-label="Restart Scene"
          >
            Restart
          </button>
          <button
            id="btn-desync-cancel"
            onClick={() => actions.resolveDesync('cancel')}
            aria-label="Cancel Load"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
