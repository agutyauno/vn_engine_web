import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';
import { DialogueGroup } from './DialogueGroup';
import { ChoiceOverlay } from './ChoiceOverlay';

export function GameplayOverlay(): JSX.Element {
  const { isCleanArtMode } = usePlayerState();
  const actions = usePlayerActions();

  useEffect(() => {
    if (!isCleanArtMode) return;
    const handleDismiss = () => actions.toggleCleanArt();
    window.addEventListener('pointerdown', handleDismiss);
    window.addEventListener('keydown', handleDismiss);
    return () => {
      window.removeEventListener('pointerdown', handleDismiss);
      window.removeEventListener('keydown', handleDismiss);
    };
  }, [isCleanArtMode, actions]);

  return (
    <div
      id="gameplay-overlay"
      className={`gameplay-overlay ${isCleanArtMode ? 'clean-art-mode' : ''}`}
    >
      <ChoiceOverlay />
      <DialogueGroup />
    </div>
  );
}
