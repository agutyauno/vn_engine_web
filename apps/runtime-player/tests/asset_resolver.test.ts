import { describe, it, expect, vi } from 'vitest';
import { AssetResolver } from '../src/controllers/assetResolver';
import type { Character, AssetRef } from '@vn-engine/shared-types';

describe('AssetResolver Unit Tests', () => {
  const characters: Character[] = [
    {
      id: 'alice',
      name: 'Alice',
      colorHex: '#38bdf8',
      sprites: {
        default: 'https://example.com/alice_default.png',
        happy: 'https://example.com/alice_happy.png',
      },
    },
  ];

  const assets: AssetRef[] = [
    {
      id: 'asset_bg_garden',
      name: 'bg_garden',
      type: 'image',
      storageUrl: 'https://example.com/bg_garden.png',
      sizeBytes: 1024,
    },
    {
      id: 'prop_key',
      name: 'golden_key',
      type: 'image',
      storageUrl: 'https://example.com/key.png',
      sizeBytes: 500,
    },
    {
      id: 'music_theme',
      name: 'theme_peaceful',
      type: 'audio',
      storageUrl: 'https://example.com/theme.mp3',
      sizeBytes: 2048,
    },
  ];

  const resolver = new AssetResolver(() => ({
    characters,
    assets,
  }));

  it('correctly distinguishes props from character IDs', () => {
    // alice is a declared character -> not a prop
    expect(resolver.checkIsProp('alice')).toBe(false);
    expect(resolver.checkIsProp('Alice')).toBe(false);

    // golden_key is an asset -> is a prop
    expect(resolver.checkIsProp('golden_key')).toBe(true);
    expect(resolver.checkIsProp('prop_key')).toBe(true);

    // unknown id -> not a prop
    expect(resolver.checkIsProp('unknown_char')).toBe(false);
  });

  it('resolves character sprite graphic URLs and fallbacks', () => {
    const graphicResolver = resolver.getAssetGraphicResolver();

    // Specific sprite
    expect(graphicResolver('alice.happy')).toBe('https://example.com/alice_happy.png');

    // Default sprite fallback
    expect(graphicResolver('alice')).toBe('https://example.com/alice_default.png');
    expect(graphicResolver('alice.unknown_expression')).toBe('https://example.com/alice_default.png');

    // Background asset
    expect(graphicResolver('bg_garden')).toBe('https://example.com/bg_garden.png');
  });

  it('resolves audio asset storage URLs', () => {
    const audioResolver = resolver.getAssetAudioResolver();
    expect(audioResolver('theme_peaceful')).toBe('https://example.com/theme.mp3');
    expect(audioResolver('music_theme')).toBe('https://example.com/theme.mp3');
  });

  it('emits actionable warning when graphic or audio asset cannot be found, and de-duplicates repeated warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const graphicResolver = resolver.getAssetGraphicResolver();
    const audioResolver = resolver.getAssetAudioResolver();

    // Reset warnings state
    resolver.resetWarnedAssets();

    // Unknown graphic
    const res1 = graphicResolver('missing_bg_dungeon');
    expect(res1).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Assets] Missing graphic asset: "missing_bg_dungeon"'),
    );

    // Resolving same missing graphic again should not trigger a second duplicate warning
    warnSpy.mockClear();
    const res2 = graphicResolver('missing_bg_dungeon');
    expect(res2).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();

    // Unknown audio
    warnSpy.mockClear();
    const audioRes = audioResolver('missing_sfx_explosion');
    expect(audioRes).toBe('missing_sfx_explosion');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Assets] Missing audio asset: "missing_sfx_explosion"'),
    );

    // De-duplicated audio warning
    warnSpy.mockClear();
    audioResolver('missing_sfx_explosion');
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
