import type { JSX } from 'preact';
import { usePlayerState } from '../context/PlayerUIContext';
import { SpeakerNameplate } from './SpeakerNameplate';
import { DialogueBox } from './DialogueBox';
import { ControlBar } from './ControlBar';

export function DialogueGroup(): JSX.Element {
  const { dialogue, activeChoices } = usePlayerState();
  const hasChoices = Boolean(activeChoices && activeChoices.length > 0);
  const isHidden = hasChoices || !dialogue.isVisible;

  return (
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
      <ControlBar />
    </div>
  );
}
