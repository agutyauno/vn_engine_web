import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';
import { useTypewriter } from '../hooks/useTypewriter';
import { stripControlTags } from '../../core/typewriter';

export interface DialogueBoxProps {
  rawText?: string;
  isComplete?: boolean;
}

export function DialogueBox(props: DialogueBoxProps): JSX.Element {
  const state = usePlayerState();
  const actions = usePlayerActions();

  const text = props.rawText !== undefined ? props.rawText : state.dialogue.rawText;
  const isComplete = props.isComplete !== undefined ? props.isComplete : state.dialogue.isComplete;

  const typewriter = useTypewriter({
    rawText: text,
    isComplete,
    baseCharsPerSecond: state.settings.textSpeed,
    playbackMode: state.playbackMode,
    onComplete: () => {
      actions.completeDialogue();
    },
  });

  const handleClick = () => {
    if (!isComplete && typewriter.isTyping) {
      typewriter.skipTypewriter();
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
      <span className="sr-only" style={{ display: 'none' }} aria-hidden="false">
        {stripControlTags(text)}
      </span>
      <div id="dialogue-text" className="dialogue-text">
        {typewriter.segments.map((seg, index) => {
          if (seg.color) {
            return (
              <span key={index} style={{ color: seg.color }}>
                {seg.text}
              </span>
            );
          }
          return seg.text;
        })}
      </div>
      {isComplete && (
        <div id="dialogue-next-indicator" className="dialogue-next-indicator">
          ▼
        </div>
      )}
    </div>
  );
}
