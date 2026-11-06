import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';
import { DialogueGroup } from './DialogueGroup';
import { ChoiceOverlay } from './ChoiceOverlay';

export function GameplayOverlay(): JSX.Element {
  const state = usePlayerState();
  const { isCleanArtMode } = state;
  const actions = usePlayerActions();

  useEffect(() => {
    if (isCleanArtMode) {
      const handleDismiss = () => actions.toggleCleanArt();
      window.addEventListener('pointerdown', handleDismiss);
      window.addEventListener('keydown', handleDismiss);
      return () => {
        window.removeEventListener('pointerdown', handleDismiss);
        window.removeEventListener('keydown', handleDismiss);
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const activeModal = state?.activeModal ?? 'none';
      const choices = state?.activeChoices ?? [];
      const isDialogueComplete = state?.dialogue?.isComplete ?? false;

      if (activeModal !== 'none') {
        if (e.key === 'Escape') {
          e.preventDefault();
          actions.closeModal();
          return;
        }
        if ((e.key === 'l' || e.key === 'L') && activeModal === 'backlog') {
          e.preventDefault();
          actions.closeModal();
          return;
        }
        return;
      }

      if (choices.length > 0) {
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          actions.rollback();
        }
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
        case 'ArrowRight': {
          e.preventDefault();
          if (!isDialogueComplete) {
            actions.completeDialogue();
          } else {
            actions.advance();
          }
          break;
        }
        case 'ArrowLeft':
        case 'PageUp': {
          e.preventDefault();
          actions.rollback();
          break;
        }
        case 'a':
        case 'A': {
          e.preventDefault();
          actions.toggleAuto();
          break;
        }
        case 's':
        case 'S':
        case 'Tab': {
          e.preventDefault();
          actions.toggleSkip();
          break;
        }
        case 'l':
        case 'L': {
          e.preventDefault();
          actions.openModal('backlog');
          break;
        }
        case 'h':
        case 'H': {
          e.preventDefault();
          actions.toggleHideControls();
          actions.toggleCleanArt?.();
          break;
        }
        case 'Escape': {
          e.preventDefault();
          actions.openModal('settings');
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isCleanArtMode,
    state?.activeModal,
    state?.activeChoices?.length,
    state?.dialogue?.isComplete,
    actions,
  ]);

  return (
    <div
      id="gameplay-overlay"
      className={`gameplay-overlay ${isCleanArtMode ? 'clean-art-mode' : ''}`}
      onContextMenu={e => {
        e.preventDefault();
        actions.toggleHideControls();
      }}
    >
      <ChoiceOverlay />
      <DialogueGroup />
    </div>
  );
}
