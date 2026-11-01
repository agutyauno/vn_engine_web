import type { TypewriterSegment } from './contracts';

/**
 * Strips formatting/control tags from dialogue raw text so that clean text is displayed in Backlog.
 */
export function stripControlTags(rawText: string): string {
  if (!rawText) return '';
  return rawText.replace(/\{[a-zA-Z_]+\s*:\s*[^}]+\}/g, '');
}

/**
 * Parses raw dialogue text containing control tags ({pause: 0.5s}, {speed: slow}, {color: #hex})
 * into an array of TypewriterSegments for the Typewriter reveal animation.
 */
export function parseTypewriterSegments(rawText: string): TypewriterSegment[] {
  if (!rawText) return [];

  const segments: TypewriterSegment[] = [];
  const tagRegex = /\{([a-zA-Z_]+)\s*:\s*([^}]+)\}/g;

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let currentSpeedMultiplier: number | undefined = undefined;

  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawText)) !== null) {
    const textBefore = rawText.slice(lastIndex, match.index);
    if (textBefore.length > 0) {
      const seg: TypewriterSegment = { text: textBefore };
      if (currentColor !== undefined) {
        seg.color = currentColor;
      }
      if (currentSpeedMultiplier !== undefined) {
        seg.speedMultiplier = currentSpeedMultiplier;
      }
      segments.push(seg);
    }

    const tagName = match[1]!.toLowerCase();
    const tagValue = match[2]!.trim();

    if (tagName === 'pause') {
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
      if (tagValue === 'reset' || tagValue === 'default') {
        currentColor = undefined;
      } else {
        currentColor = tagValue;
      }
    }

    lastIndex = tagRegex.lastIndex;
  }

  const remainingText = rawText.slice(lastIndex);
  if (remainingText.length > 0) {
    const seg: TypewriterSegment = { text: remainingText };
    if (currentColor !== undefined) {
      seg.color = currentColor;
    }
    if (currentSpeedMultiplier !== undefined) {
      seg.speedMultiplier = currentSpeedMultiplier;
    }
    segments.push(seg);
  }

  if (segments.length === 0 && rawText.length > 0) {
    segments.push({ text: '' });
  }

  return segments;
}
