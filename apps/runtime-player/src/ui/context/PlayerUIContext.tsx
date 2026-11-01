import { createContext } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useContext } from 'preact/hooks';
import type { PlayerViewState, PlayerUIActions } from '../../core/contracts';

const PlayerUIStateContext = createContext<PlayerViewState | null>(null);
const PlayerUIActionsContext = createContext<PlayerUIActions | null>(null);

export interface PlayerUIProviderProps {
  state: PlayerViewState;
  actions: PlayerUIActions;
  children: ComponentChildren;
}

export function PlayerUIProvider({ state, actions, children }: PlayerUIProviderProps): JSX.Element {
  return (
    <PlayerUIStateContext.Provider value={state}>
      <PlayerUIActionsContext.Provider value={actions}>
        {children}
      </PlayerUIActionsContext.Provider>
    </PlayerUIStateContext.Provider>
  );
}

export function usePlayerState(): PlayerViewState {
  const context = useContext(PlayerUIStateContext);
  if (!context) {
    throw new Error('usePlayerState must be used within PlayerUIProvider');
  }
  return context;
}

export function usePlayerActions(): PlayerUIActions {
  const context = useContext(PlayerUIActionsContext);
  if (!context) {
    throw new Error('usePlayerActions must be used within PlayerUIProvider');
  }
  return context;
}
