import { describe, it, expect } from 'vitest';
import {
  generateDslSnippet,
  type DslSnippetEntity,
} from '../../src/core/utils/dslSnippetGenerator';

describe('generateDslSnippet', () => {
  describe('TC-SNIPPET-01: Asset category background', () => {
    it('generates background command from asset with extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'bg_forest.png',
        category: 'background',
      };
      expect(generateDslSnippet(entity)).toBe('background bg_forest');
    });

    it('falls back to background command when category is missing but assetType is image', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'bg_palace.jpg',
        assetType: 'image',
      };
      expect(generateDslSnippet(entity)).toBe('background bg_palace');
    });

    it('handles asset names without extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'bg_city',
        category: 'background',
      };
      expect(generateDslSnippet(entity)).toBe('background bg_city');
    });

    it('strips only the final extension when assetName contains multiple dots', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'bg.sunset.night.png',
        category: 'background',
      };
      expect(generateDslSnippet(entity)).toBe('background bg.sunset.night');
    });
  });

  describe('TC-SNIPPET-02: Asset category sprite', () => {
    it('generates show command from sprite asset name stripping extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'alice_smile.png',
        category: 'sprite',
      };
      expect(generateDslSnippet(entity)).toBe('show alice_smile');
    });

    it('generates show command for webp sprite asset', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'hero_idle.webp',
        category: 'sprite',
      };
      expect(generateDslSnippet(entity)).toBe('show hero_idle');
    });
  });

  describe('TC-SNIPPET-03: Audio categories (bgm, sfx, audio, voice)', () => {
    it('generates play music command for bgm keeping file extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'theme.mp3',
        category: 'bgm',
      };
      expect(generateDslSnippet(entity)).toBe('play music "theme.mp3"');
    });

    it('generates play sound command for sfx keeping file extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'click.ogg',
        category: 'sfx',
      };
      expect(generateDslSnippet(entity)).toBe('play sound "click.ogg"');
    });

    it('generates play sound command for audio category keeping file extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'rain.wav',
        category: 'audio',
      };
      expect(generateDslSnippet(entity)).toBe('play sound "rain.wav"');
    });

    it('generates play voice command for voice keeping file extension', () => {
      const entity: DslSnippetEntity = {
        type: 'asset',
        assetName: 'line01.mp3',
        category: 'voice',
      };
      expect(generateDslSnippet(entity)).toBe('play voice "line01.mp3"');
    });
  });

  describe('TC-SNIPPET-04: Character and expression snippets', () => {
    it('generates show command for character', () => {
      const entity: DslSnippetEntity = {
        type: 'character',
        charId: 'alice',
      };
      expect(generateDslSnippet(entity)).toBe('show alice');
    });

    it('generates show character.expression command for expression', () => {
      const entity: DslSnippetEntity = {
        type: 'expression',
        charId: 'alice',
        expressionKey: 'happy',
      };
      expect(generateDslSnippet(entity)).toBe('show alice.happy');
    });
  });
});
