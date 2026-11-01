import type { JSX } from 'preact';
import { usePlayerActions } from '../context/PlayerUIContext';

export function TitleScreen(): JSX.Element {
  const actions = usePlayerActions();

  return (
    <div id="title-screen" className="title-screen-container">
      <div className="title-screen-box">
        <h1 className="title-screen-heading">Visual Novel</h1>
        <div className="title-screen-subheading">Web Engine Interactive Story</div>
        <div className="title-screen-menu">
          <button
            id="btn-new-game"
            className="title-screen-btn"
            onClick={() => actions.startNewGame()}
            aria-label="Start New Game"
          >
            New Game
          </button>
          <button
            id="btn-load-game"
            className="title-screen-btn"
            onClick={() => actions.openModal('load')}
            aria-label="Load Game"
          >
            Load Game
          </button>
          <button
            id="btn-settings"
            className="title-screen-btn"
            onClick={() => actions.openModal('settings')}
            aria-label="Open Settings"
          >
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
