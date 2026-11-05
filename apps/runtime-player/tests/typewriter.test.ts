import { describe, it, expect } from 'vitest';
import {
  parseTypewriterSegments,
  stripControlTags,
  parseBacklogSegments,
} from '../src/core/typewriter';

describe('Typewriter & Inline Tag Parser (TASK-player-typewriter-and-colors)', () => {
  describe('TC-TW-01: Color Tag Lexing & Closing Tag Handling', () => {
    it('should parse closing {/color} tag to reset color to undefined', () => {
      const raw = '{color:#ef4444}red{/color} normal';
      const segments = parseTypewriterSegments(raw);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: 'red',
        color: '#ef4444',
      });
      expect(segments[1]).toEqual({
        text: ' normal',
        color: undefined,
      });
    });

    it('should handle {color:reset} and {color:default} tags to clear active color', () => {
      const rawReset = '{color:#38bdf8}blue {color:reset}plain';
      const segsReset = parseTypewriterSegments(rawReset);
      expect(segsReset).toHaveLength(2);
      expect(segsReset[0]).toEqual({ text: 'blue ', color: '#38bdf8' });
      expect(segsReset[1]).toEqual({ text: 'plain', color: undefined });

      const rawDefault = '{color:#22c55e}green {color:default}normal';
      const segsDefault = parseTypewriterSegments(rawDefault);
      expect(segsDefault).toHaveLength(2);
      expect(segsDefault[0]).toEqual({ text: 'green ', color: '#22c55e' });
      expect(segsDefault[1]).toEqual({ text: 'normal', color: undefined });
    });

    it('should support multiple consecutive color transitions', () => {
      const raw = '{color:red}Red {color:blue}Blue{/color} None';
      const segments = parseTypewriterSegments(raw);
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'Red ', color: 'red' });
      expect(segments[1]).toEqual({ text: 'Blue', color: 'blue' });
      expect(segments[2]).toEqual({ text: ' None', color: undefined });
    });
  });

  describe('TC-TW-02: Speed, Pause, and Wait Integration', () => {
    it('should integrate speed presets and pause durations into typewriter segments', () => {
      const raw = '{speed:slow}Slow{pause:0.5s} {speed:fast}Fast';
      const segments = parseTypewriterSegments(raw);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: 'Slow',
        speedMultiplier: 0.5,
        pauseAfterMs: 500,
      });
      expect(segments[1]).toEqual({
        text: ' Fast',
        speedMultiplier: 2.0,
      });
    });

    it('should support {wait:<duration>} alias identically to {pause:<duration>}', () => {
      const raw = 'Wait here{wait:300ms} and go{wait:1.5s}!';
      const segments = parseTypewriterSegments(raw);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        text: 'Wait here',
        pauseAfterMs: 300,
      });
      expect(segments[1]).toEqual({
        text: ' and go!',
        pauseAfterMs: 1500,
      });
    });

    it('should support numeric speed multipliers like {speed:1.5} and {speed:0.75}', () => {
      const raw = '{speed:1.5}Rapid {speed:0.75}Gentle';
      const segments = parseTypewriterSegments(raw);

      expect(segments).toHaveLength(2);
      expect(segments[0]?.speedMultiplier).toBe(1.5);
      expect(segments[1]?.speedMultiplier).toBe(0.75);
    });

    it('should handle pause with raw numeric seconds {pause:2}', () => {
      const raw = 'Thinking...{pause:2} done!';
      const segments = parseTypewriterSegments(raw);
      expect(segments[0]?.pauseAfterMs).toBe(2000);
    });
  });

  describe('TC-TW-03: Strip Control Tags Sanitizer', () => {
    it('should strip all control tags including closing {/color} and {wait:...}', () => {
      const raw = '{speed:slow}Hello {pause:200ms}{color:#fff}world{/color}!';
      const stripped = stripControlTags(raw);
      expect(stripped).toBe('Hello world!');
    });

    it('should strip wait and color reset tags', () => {
      const raw = '{wait:1s}Welcome {color:reset}back{speed:normal}!';
      expect(stripControlTags(raw)).toBe('Welcome back!');
    });

    it('should return empty string for empty input', () => {
      expect(stripControlTags('')).toBe('');
    });

    it('should return unmodified text when no tags are present', () => {
      expect(stripControlTags('Just plain text without tags.')).toBe(
        'Just plain text without tags.',
      );
    });
  });

  describe('TC-TW-04: Backlog Segments Parser', () => {
    it('should preserve colored spans while stripping rhythm tags (pause, wait, speed)', () => {
      const raw = '{speed:slow}{color:#38bdf8}Hero{/color} attacks{pause:1s}!';
      const segments = parseBacklogSegments(raw);

      expect(segments).toEqual([
        { text: 'Hero', color: '#38bdf8' },
        { text: ' attacks!', color: undefined },
      ]);
    });

    it('should return single segment with undefined color for plain text', () => {
      const segments = parseBacklogSegments('Simple dialogue line');
      expect(segments).toEqual([{ text: 'Simple dialogue line', color: undefined }]);
    });

    it('should handle multiple color spans with intervening rhythm tags', () => {
      const raw = '{pause:0.5s}{color:#ef4444}Warning:{/color} {speed:fast}{color:#fbbf24}Low HP{/color}!';
      const segments = parseBacklogSegments(raw);

      expect(segments).toEqual([
        { text: 'Warning:', color: '#ef4444' },
        { text: ' ', color: undefined },
        { text: 'Low HP', color: '#fbbf24' },
        { text: '!', color: undefined },
      ]);
    });

    it('should return empty array for empty input', () => {
      expect(parseBacklogSegments('')).toEqual([]);
    });
  });
});

