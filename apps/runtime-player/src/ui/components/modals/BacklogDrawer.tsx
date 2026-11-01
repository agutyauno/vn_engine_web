import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import { CloseIcon, VolumeIcon } from '../common/Icons';

export function BacklogDrawer(): JSX.Element {
  const { backlog } = usePlayerState();
  const actions = usePlayerActions();

  return (
    <div id="modal-backlog" className="modal-backlog-drawer">
      <div className="backlog-header">
        <h2>Dialogue History</h2>
        <button
          id="btn-close-backlog"
          className="btn-close-backlog"
          onClick={() => actions.closeModal()}
          aria-label="Close backlog"
          title="Close"
        >
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="backlog-list">
        {backlog.map((entry) => (
          <div key={entry.id} className="backlog-entry">
            {entry.speakerName && (
              <span
                className="backlog-speaker"
                style={entry.speakerColorHex ? { color: entry.speakerColorHex } : undefined}
              >
                {entry.speakerName}
              </span>
            )}
            <span className="backlog-text">{entry.text}</span>
            {entry.voiceAssetId && (
              <button
                type="button"
                className="btn-replay-voice"
                onClick={() => actions.replayVoice(entry.voiceAssetId!)}
                aria-label={`Replay voice for ${entry.speakerName ?? 'dialogue'}`}
                title="Replay Voice"
              >
                <VolumeIcon size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
