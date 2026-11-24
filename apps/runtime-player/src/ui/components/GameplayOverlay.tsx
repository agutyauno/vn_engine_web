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
      // F5/F9 vẫn phải chặn mặc định ở Clean Art, nếu không F5 sẽ reload trang và mất tiến trình.
      const handleDismissKey = (e: KeyboardEvent) => {
        if (e.key === 'F5' || e.key === 'F9') e.preventDefault();
        handleDismiss();
      };
      window.addEventListener('pointerdown', handleDismiss);
      window.addEventListener('keydown', handleDismissKey);
      return () => {
        window.removeEventListener('pointerdown', handleDismiss);
        window.removeEventListener('keydown', handleDismissKey);
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
      const pendingConfirm = state?.pendingConfirm ?? null;
      const choices = state?.activeChoices ?? [];
      const isDialogueComplete = state?.dialogue?.isComplete ?? false;

      if (e.key === 'F5') {
        e.preventDefault();
        if (activeModal === 'none' && pendingConfirm === null) {
          void actions.quickSave();
        }
        return;
      }

      if (e.key === 'F9') {
        e.preventDefault();
        if (activeModal === 'none' && pendingConfirm === null) {
          void actions.quickLoad();
        }
        return;
      }

      if (pendingConfirm !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          actions.cancelPending();
        }
        return;
      }

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
        // Đang chờ chọn: không tiến thoại, nhưng vẫn lùi, mở Settings và Backlog được
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          actions.rollback();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          actions.openModal('settings');
        } else if (e.key === 'l' || e.key === 'L') {
          e.preventDefault();
          actions.openModal('backlog');
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
    state?.pendingConfirm,
    state?.activeChoices?.length,
    state?.dialogue?.isComplete,
    actions,
  ]);

  const handleBottomZoneClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    e.stopPropagation();

    if (isCleanArtMode) return;
    if ((state?.pendingConfirm ?? null) !== null) return;

    const activeModal = state?.activeModal ?? 'none';
    if (activeModal !== 'none') return;

    const choices = state?.activeChoices ?? [];
    if (choices.length > 0) return;

    const isVisible = state?.dialogue?.isVisible ?? false;
    const isComplete = state?.dialogue?.isComplete ?? false;

    if (isVisible && !isComplete) {
      actions.completeDialogue();
    } else {
      actions.advance();
    }
  };

  const isAwaitingPauseAdvance = state?.isAwaitingPauseAdvance ?? false;
  const isFullScreenClick = !state?.dialogue?.isVisible || isAwaitingPauseAdvance;

  return (
    <div
      id="gameplay-overlay"
      className={`gameplay-overlay ${isCleanArtMode ? 'clean-art-mode' : ''}`}
      onContextMenu={e => {
        e.preventDefault();
        actions.toggleHideControls();
      }}
    >
      <div
        id="bottom-click-zone"
        className={`bottom-click-zone ${isFullScreenClick ? 'full-screen' : ''}`}
        onClick={handleBottomZoneClick}
      />
      <ChoiceOverlay />
      <DialogueGroup />
      {state?.pendingConfirm === 'quick_load_overwrite' && (
        <div
          id="quickload-confirm"
          className="quickload-confirm-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="quickload-confirm-message"
          onClick={e => e.stopPropagation()}
        >
          <div className="quickload-confirm-dialog">
            <p id="quickload-confirm-message">
              Load your quick save? Any unsaved progress will be lost.
            </p>
            <div className="quickload-confirm-actions">
              <button
                id="btn-quickload-confirm"
                className="wf-btn wf-btn-danger"
                onClick={() => void actions.confirmPending()}
              >
                Load
              </button>
              <button
                id="btn-quickload-cancel"
                className="wf-btn"
                onClick={() => actions.cancelPending()}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
