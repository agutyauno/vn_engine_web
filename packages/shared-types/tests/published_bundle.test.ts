import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  PUBLISHED_BUNDLE_FORMAT_VERSION,
  type PublishedGameBundle,
  type ProjectTitleSettings,
  type Instruction,
  type AssetRef,
} from '../src';

describe('PublishedGameBundle contract', () => {
  it('PUBLISHED_BUNDLE_FORMAT_VERSION equals 1', () => {
    expect(PUBLISHED_BUNDLE_FORMAT_VERSION).toBe(1);
    expectTypeOf(PUBLISHED_BUNDLE_FORMAT_VERSION).toEqualTypeOf<1>();
  });

  it('PublishedGameBundle has exactly the expected fields and types', () => {
    expectTypeOf<PublishedGameBundle>().toEqualTypeOf<{
      formatVersion: 1;
      projectId: string;
      title: string;
      titleSettings?: ProjectTitleSettings;
      entryScene?: string;
      program: Instruction[];
      assets: AssetRef[];
      publishedAt: number;
    }>();

    expectTypeOf<PublishedGameBundle['formatVersion']>().toEqualTypeOf<1>();
    expectTypeOf<PublishedGameBundle['projectId']>().toEqualTypeOf<string>();
    expectTypeOf<PublishedGameBundle['title']>().toEqualTypeOf<string>();
    expectTypeOf<PublishedGameBundle['titleSettings']>().toEqualTypeOf<
      ProjectTitleSettings | undefined
    >();
    expectTypeOf<PublishedGameBundle['entryScene']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<PublishedGameBundle['program']>().toEqualTypeOf<Instruction[]>();
    expectTypeOf<PublishedGameBundle['assets']>().toEqualTypeOf<AssetRef[]>();
    expectTypeOf<PublishedGameBundle['publishedAt']>().toEqualTypeOf<number>();
  });

  it('a valid full bundle literal round-trips through JSON without changes', () => {
    const fullBundle: PublishedGameBundle = {
      formatVersion: 1,
      projectId: 'proj_alpha_001',
      title: 'Echoes of the Void',
      titleSettings: {
        backgroundAssetId: 'asset_bg_main',
        logoAssetId: 'asset_logo_title',
        bgmAssetId: 'asset_bgm_theme',
      },
      entryScene: 'scene_intro',
      program: [
        {
          type: 'SCENE',
          name: 'scene_intro',
        },
        {
          type: 'DIALOGUE',
          character: 'Narrator',
          text: 'The journey begins.',
        },
      ],
      assets: [
        {
          id: 'asset_bg_main',
          name: 'main_menu_bg.png',
          type: 'image',
          category: 'background',
          storageUrl: 'assets/main_menu_bg.png',
          sizeBytes: 1048576,
        },
        {
          id: 'asset_bgm_theme',
          name: 'main_theme.mp3',
          type: 'audio',
          category: 'bgm',
          storageUrl: 'assets/main_theme.mp3',
          sizeBytes: 3145728,
        },
      ],
      publishedAt: 1774345200000,
    };

    expect(JSON.parse(JSON.stringify(fullBundle))).toEqual(fullBundle);
  });

  it('a minimal bundle literal (without optional fields) round-trips through JSON', () => {
    const minimalBundle: PublishedGameBundle = {
      formatVersion: 1,
      projectId: 'proj_min_002',
      title: 'Minimal Project',
      program: [],
      assets: [],
      publishedAt: 1774345200000,
    };

    expect(minimalBundle.titleSettings).toBeUndefined();
    expect(minimalBundle.entryScene).toBeUndefined();
    expect(JSON.parse(JSON.stringify(minimalBundle))).toEqual(minimalBundle);
  });
});
