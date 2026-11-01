import type { JSX } from 'preact';
import { usePlayerState } from '../context/PlayerUIContext';
import { SpeakerNameplate } from './SpeakerNameplate';
import { DialogueBox } from './DialogueBox';
import { ControlBar } from './ControlBar';

export function DialogueGroup(): JSX.Element {
  const { dialogue } = usePlayerState();
  return (
    <div id="dialogue-group" className="dialogue-group">
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

