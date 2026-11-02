import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';

export interface DialogueBoxProps {
  rawText?: string;
  isComplete?: boolean;
}

export function DialogueBox(props: DialogueBoxProps): JSX.Element {
  const state = usePlayerState();
  const actions = usePlayerActions();

  const text = props.rawText !== undefined ? props.rawText : state.dialogue.rawText;
  const isComplete = props.isComplete !== undefined ? props.isComplete : state.dialogue.isComplete;

  const handleClick = () => {
    if (!isComplete) {
      actions.completeDialogue();
    } else {
      actions.advance();
    }
  };

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      id="dialogue-box"
      className="dialogue-box"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Dialogue Text Box"
    >
      <div id="dialogue-text" className="dialogue-text">
        {text}
      </div>
      {isComplete && (
        <div id="dialogue-next-indicator" className="dialogue-next-indicator">
          ▼
        </div>
      )}
    </div>
  );
}

