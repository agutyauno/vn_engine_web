import type { JSX } from 'preact';
import { usePlayerState } from '../context/PlayerUIContext';
import { SpeakerNameplate } from './SpeakerNameplate';
import { DialogueBox } from './DialogueBox';
import { ControlBar } from './ControlBar';

export function DialogueGroup(): JSX.Element {
  const { dialogue, activeChoices } = usePlayerState();
  const hasChoices = Boolean(activeChoices && activeChoices.length > 0);

  return (
    <div
      id="dialogue-group"
      className={`dialogue-group ${hasChoices ? 'hidden' : ''}`}
      style={hasChoices ? { display: 'none' } : undefined}
    >
      <SpeakerNameplate
        speakerName={dialogue.speakerName}
        speakerColorHex={dialogue.speakerColorHex}
      />
      <DialogueBox
        rawText={dialogue.rawText}
        isComplete={dialogue.isComplete}
      />
      <ControlBar />
    </div>
  );
}
