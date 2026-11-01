import type { JSX } from 'preact';
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

  return (
    <main id="game-stage" className="game-stage">
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
  );
}
