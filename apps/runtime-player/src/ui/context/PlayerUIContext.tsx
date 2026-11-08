import { createContext } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useContext, useState, useEffect, useMemo } from 'preact/hooks';
import type { PlayerViewState, PlayerUIActions } from '../../core/contracts';
import type { VNRuntimeKernel } from '../../core/VNRuntimeKernel';

const PlayerUIStateContext = createContext<PlayerViewState | null>(null);
const PlayerUIActionsContext = createContext<PlayerUIActions | null>(null);

export interface PlayerUIProviderProps {
  kernel?: VNRuntimeKernel;
  state?: PlayerViewState;
  actions?: PlayerUIActions;
  children?: ComponentChildren;
}

export function PlayerUIProvider({
  kernel,
  state: propState,
  actions: propActions,
  children,
}: PlayerUIProviderProps): JSX.Element {
  const [kernelState, setKernelState] = useState<PlayerViewState>(() => {
    return kernel ? kernel.getState() : (propState as PlayerViewState);
  });

  useEffect(() => {
    if (!kernel) return;
    setKernelState(kernel.getState());
    return kernel.subscribe(nextState => {
      setKernelState(nextState);
    });
  }, [kernel]);

  const resolvedState = propState ?? kernelState;

  const resolvedActions: PlayerUIActions = useMemo(() => {
    if (propActions) return propActions;
    if (!kernel) {
      throw new Error('PlayerUIProvider requires either actions or kernel');
    }
    return {
      startNewGame: () => void kernel.startNewGame(),
      returnToTitle: () => kernel.returnToTitle(),
      advance: () => void kernel.advance(),
      completeDialogue: () => kernel.completeDialogue(),
      selectChoice: (index: number) => {
        void kernel.selectChoice(index).catch(err => {
          console.error('[VNRuntimeKernel] selectChoice error:', err);
        });
      },
      rollback: () => kernel.rollback(),
      toggleAuto: () => kernel.toggleAuto(),
      toggleSkip: () => kernel.toggleSkip(),
      toggleHideControls: () => kernel.toggleHideControls(),
      toggleCleanArt: () => kernel.toggleCleanArt(),
      toggleMute: () => kernel.toggleMute(),
      openModal: modal => kernel.openModal(modal),
      closeModal: () => kernel.closeModal(),
      closeInspect: () => kernel.closeInspect(),
      setAudioVolume: (channel, volume) => kernel.setAudioVolume(channel, volume),
      setTextSpeed: charsPerSec => kernel.setTextSpeed(charsPerSec),
      setAutoDelay: delayMs => kernel.setAutoDelay(delayMs),
      showToast: message => kernel.showToast(message),
      saveSlot: slotIndex => kernel.saveSlot(slotIndex),
      loadSlot: slotIndex => kernel.loadSlot(slotIndex),
      quickSave: () => kernel.quickSave(),
      quickLoad: () => kernel.quickLoad(),
      replayVoice: assetId => kernel.replayVoice(assetId),
      resolveDesync: choice => kernel.resolveDesync(choice),
    };
  }, [propActions, kernel]);

  return (
    <PlayerUIStateContext.Provider value={resolvedState}>
      <PlayerUIActionsContext.Provider value={resolvedActions}>
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
