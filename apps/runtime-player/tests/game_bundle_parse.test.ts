import { describe, it, expect, expectTypeOf } from 'vitest';
import type { PublishedGameBundle } from '@vn-engine/shared-types';
import { parseGameBundle, type GameBundleError } from '../src/adapters/gameBundleLoader';

function createValidBundleRaw(): Record<string, unknown> {
  return {
    formatVersion: 1,
    projectId: 'demo-project-id',
    title: 'Demo Project Title',
    titleSettings: {
      backgroundAssetId: 'bg_asset_1',
      logoAssetId: 'logo_asset_1',
      bgmAssetId: 'bgm_asset_1',
    },
    entryScene: 'start_scene',
    program: [
      { type: 'SCENE', name: 'start_scene' },
      { type: 'DIALOGUE', character: 'Alice', text: 'Hello, world!' },
    ],
    assets: [
      {
        id: 'asset_bg',
        name: 'bg.png',
        type: 'image',
        category: 'background',
        storageUrl: 'assets/bg.png',
        sizeBytes: 1024,
      },
    ],
    publishedAt: 1774345200000,
  };
}

describe('parseGameBundle', () => {
  describe('type contract', () => {
    it('exports GameBundleError with expected error codes', () => {
      expectTypeOf<GameBundleError>().toEqualTypeOf<
        'not_object' | 'unsupported_version' | 'invalid_field'
      >();
    });

    it('returns PublishedGameBundle and string warnings on success', () => {
      const raw = createValidBundleRaw();
      const result = parseGameBundle(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expectTypeOf(result.bundle).toEqualTypeOf<PublishedGameBundle>();
        expectTypeOf(result.warnings).toEqualTypeOf<string[]>();
      }
    });
  });

  describe('valid bundle parsing', () => {
    it('successfully parses full bundle, preserves fields with deep-equal program and empty warnings', () => {
      const raw = createValidBundleRaw();
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.formatVersion).toBe(1);
        expect(result.bundle.projectId).toBe('demo-project-id');
        expect(result.bundle.title).toBe('Demo Project Title');
        expect(result.bundle.entryScene).toBe('start_scene');
        expect(result.bundle.titleSettings).toEqual({
          backgroundAssetId: 'bg_asset_1',
          logoAssetId: 'logo_asset_1',
          bgmAssetId: 'bgm_asset_1',
        });
        expect(result.bundle.program).toEqual([
          { type: 'SCENE', name: 'start_scene' },
          { type: 'DIALOGUE', character: 'Alice', text: 'Hello, world!' },
        ]);
        expect(result.bundle.publishedAt).toBe(1774345200000);
        expect(result.warnings).toEqual([]);
      }
    });

    it('successfully parses minimal bundle without optional fields', () => {
      const raw: Record<string, unknown> = {
        formatVersion: 1,
        projectId: 'minimal-project-id',
        title: 'Minimal Title',
        program: [],
        assets: [],
        publishedAt: 1774345200000,
      };
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.titleSettings).toBeUndefined();
        expect(result.bundle.entryScene).toBeUndefined();
        expect(result.bundle.program).toEqual([]);
        expect(result.bundle.assets).toEqual([]);
        expect(result.warnings).toEqual([]);
      }
    });
  });

  describe('non-object input validation (not_object)', () => {
    it('returns not_object when raw is null', () => {
      expect(parseGameBundle(null)).toEqual({ ok: false, error: 'not_object' });
    });

    it('returns not_object when raw is undefined', () => {
      expect(parseGameBundle(undefined)).toEqual({ ok: false, error: 'not_object' });
    });

    it('returns not_object when raw is an array', () => {
      expect(parseGameBundle([])).toEqual({ ok: false, error: 'not_object' });
      expect(parseGameBundle([1, 2, 3])).toEqual({ ok: false, error: 'not_object' });
    });

    it('returns not_object when raw is a number', () => {
      expect(parseGameBundle(123)).toEqual({ ok: false, error: 'not_object' });
      expect(parseGameBundle(0)).toEqual({ ok: false, error: 'not_object' });
    });

    it('returns not_object when raw is a string', () => {
      expect(parseGameBundle('')).toEqual({ ok: false, error: 'not_object' });
      expect(parseGameBundle('{"formatVersion":1}')).toEqual({ ok: false, error: 'not_object' });
    });

    it('returns not_object when raw is a boolean', () => {
      expect(parseGameBundle(true)).toEqual({ ok: false, error: 'not_object' });
      expect(parseGameBundle(false)).toEqual({ ok: false, error: 'not_object' });
    });
  });

  describe('formatVersion validation (unsupported_version)', () => {
    it('returns unsupported_version when formatVersion is missing', () => {
      const raw = createValidBundleRaw();
      delete raw.formatVersion;
      expect(parseGameBundle(raw)).toEqual({ ok: false, error: 'unsupported_version' });
    });

    it('returns unsupported_version when formatVersion is 2', () => {
      const raw = { ...createValidBundleRaw(), formatVersion: 2 };
      expect(parseGameBundle(raw)).toEqual({ ok: false, error: 'unsupported_version' });
    });

    it('returns unsupported_version when formatVersion is not 1 (0, negative, float)', () => {
      expect(parseGameBundle({ ...createValidBundleRaw(), formatVersion: 0 })).toEqual({
        ok: false,
        error: 'unsupported_version',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), formatVersion: -1 })).toEqual({
        ok: false,
        error: 'unsupported_version',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), formatVersion: 1.5 })).toEqual({
        ok: false,
        error: 'unsupported_version',
      });
    });

    it('returns unsupported_version when formatVersion is not a number', () => {
      expect(parseGameBundle({ ...createValidBundleRaw(), formatVersion: '1' })).toEqual({
        ok: false,
        error: 'unsupported_version',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), formatVersion: null })).toEqual({
        ok: false,
        error: 'unsupported_version',
      });
    });
  });

  describe('required fields validation (invalid_field)', () => {
    it('returns invalid_field when projectId is missing, empty, or not a string', () => {
      const rawMissing = createValidBundleRaw();
      delete rawMissing.projectId;
      expect(parseGameBundle(rawMissing)).toEqual({ ok: false, error: 'invalid_field' });

      expect(parseGameBundle({ ...createValidBundleRaw(), projectId: '' })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), projectId: 12345 })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), projectId: null })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
    });

    it('returns invalid_field when title is missing, empty, or not a string', () => {
      const rawMissing = createValidBundleRaw();
      delete rawMissing.title;
      expect(parseGameBundle(rawMissing)).toEqual({ ok: false, error: 'invalid_field' });

      expect(parseGameBundle({ ...createValidBundleRaw(), title: '' })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), title: 12345 })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), title: null })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
    });

    it('returns invalid_field when program is not an array', () => {
      expect(parseGameBundle({ ...createValidBundleRaw(), program: null })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: 'not_an_array' })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: {} })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
    });

    it('returns invalid_field when an element of program is not an object or lacks string type', () => {
      expect(parseGameBundle({ ...createValidBundleRaw(), program: [null] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: [123] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: ['HALT'] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: [{}] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: [{ type: 123 }] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), program: [{ type: '' }] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
    });

    it('returns invalid_field when assets is not an array', () => {
      expect(parseGameBundle({ ...createValidBundleRaw(), assets: null })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), assets: 'assets' })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), assets: {} })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
    });

    it('returns invalid_field when asset element is not an object, lacks id/name, or has invalid type', () => {
      expect(parseGameBundle({ ...createValidBundleRaw(), assets: [null] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), assets: ['asset_1'] })).toEqual({
        ok: false,
        error: 'invalid_field',
      });

      // Missing or non-string id
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ name: 'bg.png', type: 'image', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: '', name: 'bg.png', type: 'image', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: 123, name: 'bg.png', type: 'image', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });

      // Missing or non-string name
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: 'a1', type: 'image', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: 'a1', name: 123, type: 'image', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });

      // Missing or invalid type (outside image|audio|video|font)
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: 'a1', name: 'bg.png', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: 'a1', name: 'bg.png', type: 'script', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });
      expect(
        parseGameBundle({
          ...createValidBundleRaw(),
          assets: [{ id: 'a1', name: 'bg.png', type: 'unknown', storageUrl: 'bg.png' }],
        }),
      ).toEqual({ ok: false, error: 'invalid_field' });
    });

    it('returns invalid_field when publishedAt is missing or not a finite number', () => {
      const rawMissing = createValidBundleRaw();
      delete rawMissing.publishedAt;
      expect(parseGameBundle(rawMissing)).toEqual({ ok: false, error: 'invalid_field' });

      expect(parseGameBundle({ ...createValidBundleRaw(), publishedAt: '2026-11-24' })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), publishedAt: NaN })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), publishedAt: Infinity })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), publishedAt: -Infinity })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
      expect(parseGameBundle({ ...createValidBundleRaw(), publishedAt: null })).toEqual({
        ok: false,
        error: 'invalid_field',
      });
    });
  });

  describe('storageUrl resolution and URL safety', () => {
    it('resolves relative storageUrl against baseUrl when baseUrl is provided', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'asset_a',
          name: 'a.png',
          type: 'image',
          storageUrl: 'assets/a.png',
          sizeBytes: 100,
        },
      ];
      const result = parseGameBundle(raw, 'https://game.example.com/play/');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.assets[0]?.storageUrl).toBe(
          'https://game.example.com/play/assets/a.png',
        );
        expect(result.warnings).toEqual([]);
      }
    });

    it('preserves relative storageUrl when baseUrl is not provided', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'asset_a',
          name: 'a.png',
          type: 'image',
          storageUrl: 'assets/a.png',
          sizeBytes: 100,
        },
      ];
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.assets[0]?.storageUrl).toBe('assets/a.png');
        expect(result.warnings).toEqual([]);
      }
    });

    it('preserves absolute https storageUrl as-is even when baseUrl is provided', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'asset_cdn',
          name: 'a.png',
          type: 'image',
          storageUrl: 'https://cdn.x/a.png',
          sizeBytes: 100,
        },
      ];
      const result = parseGameBundle(raw, 'https://game.example.com/play/');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.assets[0]?.storageUrl).toBe('https://cdn.x/a.png');
        expect(result.warnings).toEqual([]);
      }
    });

    it('accepts valid data URLs for image and audio', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'asset_data_img',
          name: 'icon.png',
          type: 'image',
          storageUrl: 'data:image/png;base64,AAA',
          sizeBytes: 3,
        },
        {
          id: 'asset_data_aud',
          name: 'sfx.mp3',
          type: 'audio',
          storageUrl: 'data:audio/mpeg;base64,AAA',
          sizeBytes: 3,
        },
      ];
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.assets).toHaveLength(2);
        expect(result.bundle.assets[0]?.storageUrl).toBe('data:image/png;base64,AAA');
        expect(result.bundle.assets[1]?.storageUrl).toBe('data:audio/mpeg;base64,AAA');
        expect(result.warnings).toEqual([]);
      }
    });

    it('excludes dangerous/disallowed URLs from assets and warns mentioning the asset id', () => {
      const dangerousList = [
        { id: 'bad_js', url: 'javascript:alert(1)' },
        { id: 'bad_html', url: 'data:text/html,<script>alert(1)</script>' },
        { id: 'bad_file', url: 'file:///c:/x.png' },
        { id: 'bad_blob', url: 'blob:https://editor/123' },
      ];

      for (const item of dangerousList) {
        const raw = createValidBundleRaw();
        raw.assets = [
          {
            id: item.id,
            name: 'bad_asset.png',
            type: 'image',
            storageUrl: item.url,
            sizeBytes: 100,
          },
          {
            id: 'safe_asset',
            name: 'safe.png',
            type: 'image',
            storageUrl: 'assets/safe.png',
            sizeBytes: 100,
          },
        ];

        const result = parseGameBundle(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.bundle.assets).toHaveLength(1);
          expect(result.bundle.assets[0]?.id).toBe('safe_asset');
          expect(result.warnings.some(w => w.includes(item.id))).toBe(true);
        }
      }
    });
  });

  describe('prototype pollution protection and known keys filtering', () => {
    it('does not pollute Object.prototype and strips extra unknown keys from bundle', () => {
      const rawWithProto: unknown = JSON.parse(`{
        "formatVersion": 1,
        "projectId": "clean-game",
        "title": "Clean Title",
        "program": [],
        "assets": [],
        "publishedAt": 1774345200000,
        "extra": "unwanted_field",
        "__proto__": { "polluted": true }
      }`);

      const result = parseGameBundle(rawWithProto);
      expect(result.ok).toBe(true);
      expect('polluted' in Object.prototype).toBe(false);
      expect(Object.prototype.hasOwnProperty('polluted')).toBe(false);

      if (result.ok) {
        expect('extra' in result.bundle).toBe(false);
        expect('polluted' in result.bundle).toBe(false);
        // `'__proto__' in obj` luôn true (accessor kế thừa), nên kiểm tra key riêng và prototype.
        expect(Object.prototype.hasOwnProperty.call(result.bundle, '__proto__')).toBe(false);
        expect(Object.getPrototypeOf(result.bundle)).toBe(Object.prototype);
      }
    });

    it('only keeps the 3 known string keys for titleSettings and discards unknown keys or non-strings', () => {
      const raw = createValidBundleRaw();
      raw.titleSettings = {
        backgroundAssetId: 'bg_1',
        logoAssetId: 9999,
        bgmAssetId: 'bgm_1',
        unknownKey: 'discarded',
        extraObj: { nested: true },
      };

      const result = parseGameBundle(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.titleSettings).toEqual({
          backgroundAssetId: 'bg_1',
          bgmAssetId: 'bgm_1',
        });
        expect(result.bundle.titleSettings).not.toHaveProperty('logoAssetId');
        expect(result.bundle.titleSettings).not.toHaveProperty('unknownKey');
        expect(result.bundle.titleSettings).not.toHaveProperty('extraObj');
      }
    });

    it('does not pollute Object.prototype when titleSettings contains __proto__', () => {
      const rawWithProtoSettings: unknown = JSON.parse(`{
        "formatVersion": 1,
        "projectId": "clean-game",
        "title": "Clean Title",
        "program": [],
        "assets": [],
        "publishedAt": 1774345200000,
        "titleSettings": {
          "backgroundAssetId": "bg_1",
          "__proto__": { "pollutedSettings": true }
        }
      }`);

      const result = parseGameBundle(rawWithProtoSettings);
      expect(result.ok).toBe(true);
      expect('pollutedSettings' in Object.prototype).toBe(false);
      if (result.ok) {
        expect(result.bundle.titleSettings).toEqual({
          backgroundAssetId: 'bg_1',
        });
      }
    });
  });

  describe('optional fields edge cases', () => {
    it('omits titleSettings when titleSettings is not an object and bundle remains ok', () => {
      const nonObjectSettings = ['settings_string', 123, true, null, []];

      for (const nonObj of nonObjectSettings) {
        const raw = { ...createValidBundleRaw(), titleSettings: nonObj };
        const result = parseGameBundle(raw);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.bundle.titleSettings).toBeUndefined();
          expect('titleSettings' in result.bundle).toBe(false);
        }
      }
    });

    it('omits entryScene when entryScene is not a string or is empty and bundle remains ok', () => {
      const invalidEntryScenes = ['', 123, null, {}, []];

      for (const invalidScene of invalidEntryScenes) {
        const raw = { ...createValidBundleRaw(), entryScene: invalidScene };
        const result = parseGameBundle(raw);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.bundle.entryScene).toBeUndefined();
          expect('entryScene' in result.bundle).toBe(false);
        }
      }
    });

    it('preserves entryScene when it is a valid non-empty string', () => {
      const raw = { ...createValidBundleRaw(), entryScene: 'scene_prologue' };
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bundle.entryScene).toBe('scene_prologue');
      }
    });
  });

  describe('asset metadata and sizeBytes handling', () => {
    it('preserves category, tag, and variant when they are strings', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'sprite_01',
          name: 'hero_happy.png',
          type: 'image',
          category: 'sprite',
          tag: 'hero',
          variant: 'happy',
          storageUrl: 'assets/hero_happy.png',
          sizeBytes: 2048,
        },
      ];
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const asset = result.bundle.assets[0];
        expect(asset).toBeDefined();
        if (asset) {
          expect(asset.category).toBe('sprite');
          expect(asset.tag).toBe('hero');
          expect(asset.variant).toBe('happy');
          expect(asset.sizeBytes).toBe(2048);
        }
      }
    });

    it('omits category, tag, and variant when they are not strings', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'sprite_02',
          name: 'hero.png',
          type: 'image',
          category: 123,
          tag: null,
          variant: {},
          storageUrl: 'assets/hero.png',
          sizeBytes: 2048,
        },
      ];
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const asset = result.bundle.assets[0];
        expect(asset).toBeDefined();
        if (asset) {
          expect(asset.category).toBeUndefined();
          expect(asset.tag).toBeUndefined();
          expect(asset.variant).toBeUndefined();
        }
      }
    });

    it('defaults sizeBytes to 0 when sizeBytes is not a number or is NaN', () => {
      const invalidSizes = [undefined, null, '1024', NaN, 'large', {}];

      for (const invalidSize of invalidSizes) {
        const raw = createValidBundleRaw();
        raw.assets = [
          {
            id: 'asset_size_test',
            name: 'test.png',
            type: 'image',
            storageUrl: 'assets/test.png',
            sizeBytes: invalidSize,
          },
        ];
        const result = parseGameBundle(raw);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const asset = result.bundle.assets[0];
          expect(asset).toBeDefined();
          if (asset) {
            expect(asset.sizeBytes).toBe(0);
          }
        }
      }
    });

    it('strips extra unknown properties from asset objects', () => {
      const raw = createValidBundleRaw();
      raw.assets = [
        {
          id: 'asset_clean',
          name: 'clean.png',
          type: 'image',
          storageUrl: 'assets/clean.png',
          sizeBytes: 100,
          extraField: 'unauthorized_meta',
        },
      ];
      const result = parseGameBundle(raw);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const asset = result.bundle.assets[0];
        expect(asset).toBeDefined();
        if (asset) {
          expect('extraField' in asset).toBe(false);
        }
      }
    });
  });

  describe('storageUrl hardening (review)', () => {
    const baseUrl = 'https://g.example/play/index.html';

    it('rejects URLs containing control characters (newlines, tabs) with warnings', () => {
      const inputs = [
        { id: 'asset_newline', url: 'java\nscript:alert(1)' },
        { id: 'asset_tab', url: 'jav\tascript:alert(1)' },
      ];

      for (const item of inputs) {
        const raw = createValidBundleRaw();
        raw.assets = [
          {
            id: item.id,
            name: 'test.png',
            type: 'image',
            storageUrl: item.url,
            sizeBytes: 100,
          },
        ];

        const resultWithBase = parseGameBundle(raw, baseUrl);
        expect(resultWithBase.ok).toBe(true);
        if (resultWithBase.ok) {
          expect(resultWithBase.bundle.assets).toHaveLength(0);
          expect(resultWithBase.warnings.some(w => w.includes(item.id))).toBe(true);
        }

        const resultWithoutBase = parseGameBundle(raw);
        expect(resultWithoutBase.ok).toBe(true);
        if (resultWithoutBase.ok) {
          expect(resultWithoutBase.bundle.assets).toHaveLength(0);
          expect(resultWithoutBase.warnings.some(w => w.includes(item.id))).toBe(true);
        }
      }
    });

    it('rejects URLs starting with backslashes or slashes that can escape host (\\\\, /\\, \\/)', () => {
      const inputs = [
        { id: 'asset_backslash_double', url: '\\\\evil.com/a.png' },
        { id: 'asset_slash_backslash', url: '/\\evil.com/a.png' },
        { id: 'asset_backslash_slash', url: '\\/evil.com/a.png' },
      ];

      for (const item of inputs) {
        const raw = createValidBundleRaw();
        raw.assets = [
          {
            id: item.id,
            name: 'test.png',
            type: 'image',
            storageUrl: item.url,
            sizeBytes: 100,
          },
        ];

        const resultWithBase = parseGameBundle(raw, baseUrl);
        expect(resultWithBase.ok).toBe(true);
        if (resultWithBase.ok) {
          expect(resultWithBase.bundle.assets).toHaveLength(0);
          expect(resultWithBase.warnings.some(w => w.includes(item.id))).toBe(true);
        }

        const resultWithoutBase = parseGameBundle(raw);
        expect(resultWithoutBase.ok).toBe(true);
        if (resultWithoutBase.ok) {
          expect(resultWithoutBase.bundle.assets).toHaveLength(0);
          expect(resultWithoutBase.warnings.some(w => w.includes(item.id))).toBe(true);
        }
      }
    });

    it('correctly resolves and preserves valid relative URLs against baseUrl', () => {
      const validCases = [
        { url: 'assets/a b.png', expected: 'https://g.example/play/assets/a%20b.png' },
        { url: '../up/a.png', expected: 'https://g.example/up/a.png' },
        { url: '/abs/a.png', expected: 'https://g.example/abs/a.png' },
      ];

      for (const item of validCases) {
        const raw = createValidBundleRaw();
        raw.assets = [
          {
            id: 'asset_valid',
            name: 'valid.png',
            type: 'image',
            storageUrl: item.url,
            sizeBytes: 100,
          },
        ];

        const result = parseGameBundle(raw, baseUrl);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.bundle.assets).toHaveLength(1);
          expect(result.bundle.assets[0]?.storageUrl).toBe(item.expected);
          expect(result.warnings).toEqual([]);
        }
      }
    });
  });
});
