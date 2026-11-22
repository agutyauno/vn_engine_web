import type { JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';

function cssUrl(value: string): string {
  return value.replace(/["\\\r\n]/g, '');
}

export function TitleScreen(): JSX.Element {
  const { titleConfig, hasSaveData } = usePlayerState();
  const actions = usePlayerActions();

  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [titleConfig?.logoUrl]);

  useEffect(() => {
    const handleKeyDown = () => {
      actions.unlockAudio();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [actions]);

  const title = titleConfig?.title || 'Visual Novel';
  const logoUrl = titleConfig?.logoUrl;
  const showLogo = Boolean(logoUrl) && !logoFailed;

  const rawBg = titleConfig?.backgroundUrl;
  const hasBackground = Boolean(rawBg && rawBg.trim().length > 0);
  const bgUrl = hasBackground ? cssUrl(rawBg!.trim()) : '';

  const containerClass = `title-screen-container${hasBackground ? ' has-background' : ''}`;
  const containerStyle = hasBackground ? { backgroundImage: `url("${bgUrl}")` } : undefined;

  return (
    <div
      id="title-screen"
      className={containerClass}
      style={containerStyle}
      onPointerDown={() => actions.unlockAudio()}
      onKeyDown={() => actions.unlockAudio()}
    >
      <div id="title-menu-column" className="title-menu-column title-screen-box">
        <h1 className="title-screen-heading">
          {showLogo ? (
            <img id="title-logo" src={logoUrl} alt={title} onError={() => setLogoFailed(true)} />
          ) : (
            title
          )}
        </h1>
        <div className="title-screen-subheading">Web Engine Interactive Story</div>
        <div className="title-screen-menu">
          <button
            id="btn-continue"
            className="title-screen-btn"
            disabled={!hasSaveData}
            onClick={() => {
              if (hasSaveData) {
                actions.continueGame();
              }
            }}
            aria-label="Continue Game"
          >
            Continue
          </button>
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
        {Boolean(titleConfig?.version) && (
          <div id="title-version" className="title-version">
            v{titleConfig.version}
          </div>
        )}
      </div>
    </div>
  );
}
