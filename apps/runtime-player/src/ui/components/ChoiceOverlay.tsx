import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';

export function ChoiceOverlay(): JSX.Element | null {
  const { activeChoices, isControlsHidden } = usePlayerState();
  const actions = usePlayerActions();
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  useEffect(() => {
    if (!activeChoices || activeChoices.length === 0) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % activeChoices.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + activeChoices.length) % activeChoices.length);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeChoices[focusedIndex]?.isSatisfied) {
          actions.selectChoice(focusedIndex);
        }
        return;
      }

      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= activeChoices.length) {
        e.preventDefault();
        const choiceIdx = num - 1;
        if (activeChoices[choiceIdx]?.isSatisfied) {
          actions.selectChoice(choiceIdx);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeChoices, focusedIndex, actions]);

  if (!activeChoices || activeChoices.length === 0) return null;
  const allUnsatisfied = activeChoices.every(choice => !choice.isSatisfied);

  return (
    <div id="choice-overlay" className="choice-overlay">
      <div id="choice-buttons-list" className="choice-buttons-list">
        {activeChoices.map((choice, index) => {
          const isDisabled = !choice.isSatisfied;
          const isFocused = index === focusedIndex;
          return (
            <button
              key={index}
              className={`choice-button ${isDisabled ? 'disabled' : ''} ${isFocused ? 'focused' : ''}`}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) actions.selectChoice(index);
              }}
              aria-disabled={isDisabled}
            >
              <span
                className={`choice-badge ${isControlsHidden ? 'hidden' : ''}`}
                style={isControlsHidden ? { display: 'none' } : undefined}
              >
                [{index + 1}]
              </span>
              <span className="choice-text">{choice.text}</span>
            </button>
          );
        })}
      </div>
      {allUnsatisfied && (
        <button
          id="btn-emergency-rollback"
          className="emergency-rollback-btn"
          onClick={() => actions.rollback()}
          aria-label="Rollback to previous state"
        >
          Rollback
        </button>
      )}
    </div>
  );
}
