import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';
import {
  BackIcon,
  AutoIcon,
  SkipIcon,
  SaveIcon,
  HistoryIcon,
  EyeOffIcon,
  SettingsIcon,
} from './common/Icons';

export function ControlBar(): JSX.Element {
  const { isControlsHidden, playbackMode } = usePlayerState();
  const actions = usePlayerActions();

  const isAutoActive = playbackMode === 'AUTO';
  const isSkipActive = playbackMode === 'SKIP';

  return (
    <div
      id="control-bar"
      className={`control-bar ${isControlsHidden ? 'hidden' : ''}`}
      style={isControlsHidden ? { display: 'none' } : undefined}
    >
      <button
        id="btn-back"
        className="control-bar-btn"
        onClick={() => actions.rollback()}
        aria-label="Rollback to previous dialogue"
        title="Rollback (Back)"
      >
        <BackIcon size={16} />
        <span>Back</span>
      </button>
      <button
        id="btn-auto"
        className={`control-bar-btn ${isAutoActive ? 'active' : ''}`}
        aria-pressed={isAutoActive ? 'true' : 'false'}
        onClick={() => actions.toggleAuto()}
        aria-label="Toggle Auto-forward mode"
        title="Auto Forward"
      >
        <AutoIcon size={16} />
        <span>Auto</span>
      </button>
      <button
        id="btn-skip"
        className={`control-bar-btn ${isSkipActive ? 'active' : ''}`}
        aria-pressed={isSkipActive ? 'true' : 'false'}
        onClick={() => actions.toggleSkip()}
        aria-label="Toggle Skip mode"
        title="Skip"
      >
        <SkipIcon size={16} />
        <span>Skip</span>
      </button>
      <button
        id="btn-qsave"
        className="control-bar-btn"
        onClick={() => void actions.quickSave()}
        aria-label="Quick Save"
        title="Quick Save"
      >
        <SaveIcon size={16} />
        <span>Q.Save</span>
      </button>
      <button
        id="btn-qload"
        className="control-bar-btn"
        onClick={() => void actions.quickLoad()}
        aria-label="Quick Load"
        title="Quick Load"
      >
        <SaveIcon size={16} />
        <span>Q.Load</span>
      </button>
      <button
        id="btn-log"
        className="control-bar-btn"
        onClick={() => actions.openModal('backlog')}
        aria-label="Open Dialogue History Log"
        title="Backlog"
      >
        <HistoryIcon size={16} />
        <span>Log</span>
      </button>
      <button
        id="btn-hide-ui"
        className="control-bar-btn"
        onClick={() => actions.toggleHideControls()}
        aria-label="Hide UI Overlay"
        title="Hide UI"
      >
        <EyeOffIcon size={16} />
        <span>Hide</span>
      </button>
      <button
        id="btn-menu"
        className="control-bar-btn"
        onClick={() => actions.openModal('settings')}
        aria-label="Open Settings Menu"
        title="Menu"
      >
        <SettingsIcon size={16} />
        <span>Menu</span>
      </button>
    </div>
  );
}
