import type { JSX } from 'preact';
import { usePlayerState, usePlayerActions } from '../context/PlayerUIContext';

export function ChoiceOverlay(): JSX.Element | null {
  const { activeChoices } = usePlayerState();
  const actions = usePlayerActions();

  if (!activeChoices || activeChoices.length === 0) return null;
  const allUnsatisfied = activeChoices.every((choice) => !choice.isSatisfied);

  return (
    <div id="choice-overlay" className="choice-overlay">
      <div id="choice-buttons-list" className="choice-buttons-list">
        {activeChoices.map((choice, index) => {
          const isDisabled = !choice.isSatisfied;
          return (
            <button
              key={index}
              className={`choice-button ${isDisabled ? 'disabled' : ''}`}
              disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) actions.selectChoice(index);
              }}
              aria-disabled={isDisabled}
            >
              {choice.text}
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

