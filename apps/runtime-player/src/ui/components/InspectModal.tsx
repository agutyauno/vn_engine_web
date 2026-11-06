import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';
import { CloseIcon } from './common/Icons';

export interface InspectModalProps {
  assetUrl?: string;
  title?: string;
}

export function InspectModal(props: InspectModalProps): JSX.Element {
  const state = usePlayerState();
  const actions = usePlayerActions();
  const assetUrl = props.assetUrl ?? state.activeInspectModal?.assetUrl ?? '';
  const title = props.title ?? state.activeInspectModal?.title;

  return (
    <div id="inspect-overlay" className="inspect-overlay">
      <div className="inspect-backdrop" onClick={() => actions.closeInspect()} />
      <div className="inspect-content">
        {title && <div className="inspect-title">{title}</div>}
        <div className="inspect-image-wrapper">
          <button
            id="btn-close-inspect"
            className="inspect-close-btn"
            onClick={() => actions.closeInspect()}
            aria-label="Close inspect view"
            title="Close"
          >
            <CloseIcon size={20} />
          </button>
          <img src={assetUrl} alt={title ?? 'Inspected item'} />
        </div>
      </div>
    </div>
  );
}

