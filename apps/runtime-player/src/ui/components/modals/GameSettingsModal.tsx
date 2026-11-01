import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import { CloseIcon } from '../common/Icons';

export function GameSettingsModal(): JSX.Element {
  const { audio, settings } = usePlayerState();
  const actions = usePlayerActions();

  const musicVol = audio.channelVolumes.music ?? 1.0;
  const textSpeed = settings.textSpeed;
  const autoDelay = settings.autoDelayMs;

  return (
    <div id="modal-game-settings" className="modal-game-settings">
      <div className="modal-settings-header">
        <h2>Game Settings</h2>
        <button
          id="btn-close-settings"
          className="btn-close-settings"
          onClick={() => actions.closeModal()}
          aria-label="Close settings"
          title="Close"
        >
          <CloseIcon size={20} />
        </button>
      </div>
      <div className="settings-controls">
        <div className="setting-row">
          <label htmlFor="slider-volume-music">Music Volume</label>
          <input
            id="slider-volume-music"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={musicVol}
            onChange={(e) =>
              actions.setAudioVolume('music', parseFloat((e.target as HTMLInputElement).value))
            }
          />
        </div>
        <div className="setting-row">
          <label htmlFor="slider-text-speed">Text Speed</label>
          <input
            id="slider-text-speed"
            type="range"
            min="1"
            max="100"
            step="1"
            value={textSpeed}
            onChange={(e) =>
              actions.setTextSpeed(parseInt((e.target as HTMLInputElement).value, 10))
            }
          />
        </div>
        <div className="setting-row">
          <label htmlFor="slider-auto-delay">Auto Advance Delay</label>
          <input
            id="slider-auto-delay"
            type="range"
            min="500"
            max="5000"
            step="100"
            value={autoDelay}
            onChange={(e) =>
              actions.setAutoDelay(parseInt((e.target as HTMLInputElement).value, 10))
            }
          />
        </div>
      </div>
    </div>
  );
}
