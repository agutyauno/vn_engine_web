import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { usePlayerState } from '../context/PlayerUIContext';
import { PreviewStandbyScreen } from './PreviewStandbyScreen';
import { TitleScreen } from './TitleScreen';
import { GameplayOverlay } from './GameplayOverlay';
import { SaveLoadModal } from './modals/SaveLoadModal';
import { BacklogDrawer } from './modals/BacklogDrawer';
import { GameSettingsModal } from './modals/GameSettingsModal';
import { InspectModal } from './InspectModal';
import { DesyncModal } from './modals/DesyncModal';

export function PlayerApp(): JSX.Element {
  const state = usePlayerState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);

  useEffect(() => {
    const updateScale = () => {
      const parent = containerRef.current?.parentElement || document.body;
      const width = parent?.clientWidth || window.innerWidth || 1920;
      const height = parent?.clientHeight || window.innerHeight || 1080;
      if (width > 0 && height > 0) {
        const newScale = Math.min(width / 1920, height / 1080);
        setScale(newScale);
      } else {
        setScale(1);
      }
    };

    updateScale();

    if (typeof ResizeObserver !== 'undefined' && containerRef.current?.parentElement) {
      const ro = new ResizeObserver(() => updateScale());
      ro.observe(containerRef.current.parentElement);
      return () => ro.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }

    return undefined;
  }, []);

  return (
    <div
      id="player-container"
      ref={containerRef}
      className="player-viewport-container"
      style={{ '--stage-scale': scale.toString() } as JSX.CSSProperties}
    >
      <main
        id="game-stage"
        className="game-stage"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {state.mode === 'STANDBY' && <PreviewStandbyScreen />}
        {state.mode === 'TITLE' && <TitleScreen />}
        {state.mode === 'GAMEPLAY' && (
          <>
            <div id="pixi-canvas-container" className="pixi-canvas-container" />
            <GameplayOverlay />
          </>
        )}

        {state.activeModal === 'save' && <SaveLoadModal mode="save" />}
        {state.activeModal === 'load' && <SaveLoadModal mode="load" />}
        {state.activeModal === 'backlog' && <BacklogDrawer />}
        {state.activeModal === 'settings' && <GameSettingsModal />}
        {state.activeModal === 'inspect' && (
          <InspectModal
            assetUrl={state.activeInspectModal?.assetUrl}
            title={state.activeInspectModal?.title}
          />
        )}
        {state.activeModal === 'desync' && <DesyncModal data={state.desyncData} />}
      </main>
    </div>
  );
}
