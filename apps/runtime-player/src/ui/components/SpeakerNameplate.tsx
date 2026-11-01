import type { JSX } from 'preact';

export interface SpeakerNameplateProps {
  speakerName?: string;
  speakerColorHex?: string;
}

export function SpeakerNameplate({ speakerName, speakerColorHex }: SpeakerNameplateProps): JSX.Element | null {
  if (!speakerName || speakerName.trim() === '') {
    return null;
  }

  const style: JSX.CSSProperties = speakerColorHex
    ? { color: speakerColorHex, borderColor: speakerColorHex }
    : {};

  return (
    <div id="speaker-nameplate" className="speaker-nameplate" style={style}>
      {speakerName}
    </div>
  );
}

