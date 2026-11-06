import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../../context/PlayerUIContext';
import { CloseIcon } from '../common/Icons';

export function GameSettingsModal(): JSX.Element {
  const { audio, settings } = usePlayerState();
  const actions = usePlayerActions();

  const masterVol = audio?.masterVolume ?? 1.0;
  const musicVol = audio?.channelVolumes?.music ?? 0.8;
  const soundVol = audio?.channelVolumes?.sound ?? 0.8;
  const voiceVol = audio?.channelVolumes?.voice ?? 1.0;
  const textSpeed = settings?.textSpeed ?? 40;
  const autoDelay = settings?.autoDelayMs ?? 1500;

  const toggleFullscreen = () => {
    if (typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  };

  return (
    <div
      id="modal-game-settings"
      className="modal-game-settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          actions.closeModal();
        }
      }}
    >
      <div className="modal-settings-window">
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
          <label htmlFor="slider-volume-master">Master Volume</label>
          <input
            id="slider-volume-master"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={masterVol}
            onChange={(e) =>
              actions.setAudioVolume('master', parseFloat((e.target as HTMLInputElement).value))
            }
          />
        </div>
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
          <label htmlFor="slider-volume-sound">SFX Volume</label>
          <input
            id="slider-volume-sound"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={soundVol}
            onChange={(e) =>
              actions.setAudioVolume('sound', parseFloat((e.target as HTMLInputElement).value))
            }
          />
        </div>
        <div className="setting-row">
          <label htmlFor="slider-volume-voice">Voice Volume</label>
          <input
            id="slider-volume-voice"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={voiceVol}
            onChange={(e) =>
              actions.setAudioVolume('voice', parseFloat((e.target as HTMLInputElement).value))
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
        <div className="setting-row">
          <button
            id="btn-toggle-fullscreen"
            className="settings-fullscreen-btn"
            onClick={toggleFullscreen}
            aria-label="Toggle Fullscreen"
            title="Toggle Fullscreen"
          >
            Toggle Fullscreen
          </button>
        </div>
      </div>
    </div>
  </div>
);
}
