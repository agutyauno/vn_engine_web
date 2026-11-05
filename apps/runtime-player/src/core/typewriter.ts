import type { TypewriterSegment, BacklogTextSegment } from './contracts';

export type { BacklogTextSegment } from './contracts';

/**
 * Strips formatting/control tags from dialogue raw text so that clean text is displayed in Backlog and Save Slots.
 * Matches both {tagName:value} and {/tagName} (closing tags like {/color}).
 */
export function stripControlTags(rawText: string): string {
  if (!rawText) return '';
  return rawText.replace(/\{\s*\/?[a-zA-Z_]+(?:\s*:[^}]*)?\s*\}/g, '');
}

/**
 * Parses raw dialogue text containing control tags ({pause: 0.5s}, {wait: 300ms}, {speed: slow}, {color: #hex}, {/color})
 * into an array of TypewriterSegments for the Typewriter reveal animation.
 */
export function parseTypewriterSegments(rawText: string): TypewriterSegment[] {
  if (!rawText) return [];

  const segments: TypewriterSegment[] = [];
  const tagRegex = /\{\s*(\/?[a-zA-Z_]+)(?:\s*:\s*([^}]+))?\s*\}/g;

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let currentSpeedMultiplier: number | undefined = undefined;
  let pendingPrefix = '';
  let lastTagWasPause = false;

  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawText)) !== null) {
    const rawTagName = match[1]!.trim();
    const isClosing = rawTagName.startsWith('/');
    const tagName = (isClosing ? rawTagName.slice(1) : rawTagName).toLowerCase();
    const tagValue = match[2] ? match[2].trim() : '';

    const textBefore = pendingPrefix + rawText.slice(lastIndex, match.index);
    pendingPrefix = '';

    // If the previous tag was a pause/wait and the text between it and a speed/color tag
    // is purely whitespace, carry it over as prefix to the next segment so it takes the new speed/color.
    if (
      lastTagWasPause &&
      textBefore.length > 0 &&
      textBefore.trim() === '' &&
      (tagName === 'speed' || tagName === 'color')
    ) {
      pendingPrefix = textBefore;
    } else if (textBefore.length > 0) {
      const seg: TypewriterSegment = { text: textBefore };
      if (currentColor !== undefined) {
        seg.color = currentColor;
      }
      if (currentSpeedMultiplier !== undefined) {
        seg.speedMultiplier = currentSpeedMultiplier;
      }
      segments.push(seg);
    }

    lastTagWasPause = false;

    if (isClosing) {
      if (tagName === 'color') {
        currentColor = undefined;
      }
    } else if (tagName === 'pause' || tagName === 'wait') {
      let ms = 0;
      if (tagValue.endsWith('ms')) {
        ms = parseFloat(tagValue.slice(0, -2));
      } else if (tagValue.endsWith('s')) {
        ms = parseFloat(tagValue.slice(0, -1)) * 1000;
      } else {
        const val = parseFloat(tagValue);
        ms = isNaN(val) ? 0 : val * 1000;
      }
      if (segments.length > 0) {
        segments[segments.length - 1]!.pauseAfterMs = ms;
      } else {
        segments.push({ text: '', pauseAfterMs: ms });
      }
      lastTagWasPause = true;
    } else if (tagName === 'speed') {
      if (tagValue === 'slow') {
        currentSpeedMultiplier = 0.5;
      } else if (tagValue === 'normal') {
        currentSpeedMultiplier = 1.0;
      } else if (tagValue === 'fast') {
        currentSpeedMultiplier = 2.0;
      } else {
        const num = parseFloat(tagValue);
        currentSpeedMultiplier = isNaN(num) ? 1.0 : num;
      }
    } else if (tagName === 'color') {
      if (tagValue === 'reset' || tagValue === 'default' || tagValue === '') {
        currentColor = undefined;
      } else {
        currentColor = tagValue;
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  const remainingText = pendingPrefix + rawText.slice(lastIndex);
  if (remainingText.length > 0) {
    // If the remaining text is purely punctuation and immediately follows a pause tag at the end of the text,
    // append it to the last segment rather than creating a trailing segment after the pause.
    if (lastTagWasPause && segments.length > 0 && /^[!?.…,:;~'"\s]+$/.test(remainingText)) {
      segments[segments.length - 1]!.text += remainingText;
    } else {
      const seg: TypewriterSegment = { text: remainingText };
      if (currentColor !== undefined) {
        seg.color = currentColor;
      }
      if (currentSpeedMultiplier !== undefined) {
        seg.speedMultiplier = currentSpeedMultiplier;
      }
      segments.push(seg);
    }
  }

  if (segments.length === 0 && rawText.length > 0) {
    segments.push({ text: '' });
  }

  return segments;
}

/**
 * Parses raw dialogue text into segments for Backlog display.
 * Preserves color spans ({color:...}, {/color}, {color:reset}) while stripping rhythm tags ({pause:...}, {wait:...}, {speed:...}).
 */
export function parseBacklogSegments(rawText: string): BacklogTextSegment[] {
  if (!rawText) return [];

  // Strip rhythm tags ({pause:...}, {wait:...}, {speed:...})
  const textWithoutRhythm = rawText.replace(/\{\s*(?:pause|wait|speed)\s*:[^}]*\}/gi, '');
  if (!textWithoutRhythm) return [];

  const segments: BacklogTextSegment[] = [];
  const tagRegex = /\{\s*(\/?[a-zA-Z_]+)(?:\s*:\s*([^}]+))?\s*\}/g;

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(textWithoutRhythm)) !== null) {
    const textBefore = textWithoutRhythm.slice(lastIndex, match.index);
    if (textBefore.length > 0) {
      if (segments.length > 0 && segments[segments.length - 1]!.color === currentColor) {
        segments[segments.length - 1]!.text += textBefore;
      } else {
        segments.push({ text: textBefore, color: currentColor });
      }
    }

    const rawTagName = match[1]!.trim();
    const isClosing = rawTagName.startsWith('/');
    const tagName = (isClosing ? rawTagName.slice(1) : rawTagName).toLowerCase();
    const tagValue = match[2] ? match[2].trim() : '';

    if (isClosing) {
      if (tagName === 'color') {
        currentColor = undefined;
      }
    } else if (tagName === 'color') {
      if (tagValue === 'reset' || tagValue === 'default' || tagValue === '') {
        currentColor = undefined;
      } else {
        currentColor = tagValue;
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  const remaining = textWithoutRhythm.slice(lastIndex);
  if (remaining.length > 0) {
    if (segments.length > 0 && segments[segments.length - 1]!.color === currentColor) {
      segments[segments.length - 1]!.text += remaining;
    } else {
      segments.push({ text: remaining, color: currentColor });
    }
  }

  return segments;
}
