import { describe, it, expect } from 'vitest';
import type { AssetRef, ProjectTitleSettings } from '@vn-engine/shared-types';
import type { TitleScreenConfig } from '../src/core/contracts';
import { resolveTitleConfig } from '../src/adapters/titleConfigResolver';

describe('resolveTitleConfig', () => {
  const sampleAssets: AssetRef[] = [
    {
      id: 'img_logo',
      name: 'logo.png',
      type: 'image',
      storageUrl: 'blob:http://localhost/logo-blob',
      sizeBytes: 1024,
    },
    {
      id: 'img_bg',
      name: 'title_bg.jpg',
      type: 'image',
      storageUrl: 'blob:http://localhost/bg-blob',
      sizeBytes: 2048,
    },
    {
      id: 'aud_bgm',
      name: 'main_theme.mp3',
      type: 'audio',
      storageUrl: 'blob:http://localhost/bgm-blob',
      sizeBytes: 4096,
    },
    {
      id: 'img_empty_url',
      name: 'empty.png',
      type: 'image',
      storageUrl: '',
      sizeBytes: 512,
    },
    {
      id: 'aud_empty_url',
      name: 'empty.mp3',
      type: 'audio',
      storageUrl: '',
      sizeBytes: 512,
    },
  ];

  it('returns empty object when both title and titleSettings are undefined', () => {
    const result = resolveTitleConfig(undefined, undefined, sampleAssets);
    expect(result).toEqual({});
  });

  describe('title resolving', () => {
    it('trims and sets title when provided with non-empty content', () => {
      const result = resolveTitleConfig('  Starfall Echoes  ', undefined, sampleAssets);
      expect(result.title).toBe('Starfall Echoes');
    });

    it('omits title key when title is undefined', () => {
      const result = resolveTitleConfig(undefined, undefined, sampleAssets);
      expect(result).not.toHaveProperty('title');
    });

    it('omits title key when title is an empty string', () => {
      const result = resolveTitleConfig('', undefined, sampleAssets);
      expect(result).not.toHaveProperty('title');
    });

    it('omits title key when title is whitespace-only', () => {
      const result = resolveTitleConfig('   \t\n  ', undefined, sampleAssets);
      expect(result).not.toHaveProperty('title');
    });
  });

  describe('asset resolving', () => {
    it('resolves image assets to logoUrl and backgroundUrl, and audio asset to bgmTrack', () => {
      const titleSettings: ProjectTitleSettings = {
        logoAssetId: 'img_logo',
        backgroundAssetId: 'img_bg',
        bgmAssetId: 'aud_bgm',
      };

      const result: Partial<TitleScreenConfig> = resolveTitleConfig(
        'My Game',
        titleSettings,
        sampleAssets,
      );

      expect(result).toEqual({
        title: 'My Game',
        logoUrl: 'blob:http://localhost/logo-blob',
        backgroundUrl: 'blob:http://localhost/bg-blob',
        bgmTrack: 'blob:http://localhost/bgm-blob',
      });
    });

    it('omits keys if asset ids are not found in assets list', () => {
      const titleSettings: ProjectTitleSettings = {
        logoAssetId: 'non_existent_logo',
        backgroundAssetId: 'non_existent_bg',
        bgmAssetId: 'non_existent_bgm',
      };

      const result = resolveTitleConfig('Title', titleSettings, sampleAssets);

      expect(result).toEqual({ title: 'Title' });
      expect(result).not.toHaveProperty('logoUrl');
      expect(result).not.toHaveProperty('backgroundUrl');
      expect(result).not.toHaveProperty('bgmTrack');
    });

    it('omits logoUrl and backgroundUrl if referenced asset is not of type image', () => {
      const titleSettings: ProjectTitleSettings = {
        logoAssetId: 'aud_bgm',
        backgroundAssetId: 'aud_bgm',
      };

      const result = resolveTitleConfig(undefined, titleSettings, sampleAssets);

      expect(result).not.toHaveProperty('logoUrl');
      expect(result).not.toHaveProperty('backgroundUrl');
    });

    it('omits bgmTrack if referenced asset is not of type audio', () => {
      const titleSettings: ProjectTitleSettings = {
        bgmAssetId: 'img_bg',
      };

      const result = resolveTitleConfig(undefined, titleSettings, sampleAssets);

      expect(result).not.toHaveProperty('bgmTrack');
    });

    it('omits keys when asset has an empty storageUrl', () => {
      const titleSettings: ProjectTitleSettings = {
        logoAssetId: 'img_empty_url',
        backgroundAssetId: 'img_empty_url',
        bgmAssetId: 'aud_empty_url',
      };

      const result = resolveTitleConfig(undefined, titleSettings, sampleAssets);

      expect(result).not.toHaveProperty('logoUrl');
      expect(result).not.toHaveProperty('backgroundUrl');
      expect(result).not.toHaveProperty('bgmTrack');
    });
  });
});
