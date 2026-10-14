import { describe, it, expect } from 'vitest';
import { parseTypewriterTokens, stripControlTags } from '../src/ui/typewriter';

describe('Typewriter Unit Tests', () => {
  it('correctly strips control tags for clean text display', () => {
    const raw = 'Hello {color:#ff0000}world{/color}! {pause: 0.5s}Nice to meet {speed: fast}you{/color}.';
    const clean = stripControlTags(raw);
    expect(clean).toBe('Hello world! Nice to meet you.');
  });

  it('parses text tokens and color changes properly', () => {
    const raw = '{color: #00ff00}Green{/color} normal';
    const tokens = parseTypewriterTokens(raw);

    const greenChars = tokens.filter(t => t.type === 'char' && t.color === '#00ff00');
    expect(greenChars.map(t => (t as { char: string }).char).join('')).toBe('Green');

    const normalChars = tokens.filter(t => t.type === 'char' && !t.color);
    expect(normalChars.map(t => (t as { char: string }).char).join('')).toBe(' normal');
  });

  it('parses pause and speed tokens properly', () => {
    const raw = '{pause: 1s}Wait{speed: slow}Slow';
    const tokens = parseTypewriterTokens(raw, 20);

    expect(tokens[0]).toEqual({ type: 'pause', durationMs: 1000 });
    const speedToken = tokens.find(t => t.type === 'speed');
    expect(speedToken).toBeDefined();
    if (speedToken && speedToken.type === 'speed') {
      expect(speedToken.speedMs).toBeGreaterThan(20);
    }
  });
});
