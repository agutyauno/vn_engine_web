import type { JSX } from 'preact';
import { usePlayerState } from '../context/PlayerUIContext';
import { SpeakerNameplate } from './SpeakerNameplate';
import { DialogueBox } from './DialogueBox';
import { ControlBar } from './ControlBar';

export function DialogueGroup(): JSX.Element {
  const { dialogue, activeChoices, isControlsHidden } = usePlayerState();
  const hasChoices = Boolean(activeChoices && activeChoices.length > 0);
  const isHidden = hasChoices || !dialogue.isVisible;

  return (
    <>
      <div
        id="dialogue-group"
        className={`dialogue-group ${isHidden ? 'hidden' : ''}`}
        style={isHidden ? { display: 'none' } : undefined}
      >
        <SpeakerNameplate
          speakerName={dialogue.speakerName}
          speakerColorHex={dialogue.speakerColorHex}
        />
        <DialogueBox rawText={dialogue.rawText} isComplete={dialogue.isComplete} />
        {/* Khi có lựa chọn, ControlBar chuyển sang #choice-controls để không trùng id */}
        {!hasChoices && <ControlBar />}
      </div>
      {hasChoices && !isControlsHidden && (
        <div id="choice-controls" className="choice-controls">
          <ControlBar variant="choice" />
        </div>
      )}
    </>
  );
}
