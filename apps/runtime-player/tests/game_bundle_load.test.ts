import { describe, it, expect, vi, afterEach, expectTypeOf } from 'vitest';
import type { PublishedGameBundle } from '@vn-engine/shared-types';
import {
  loadGameBundle,
  type GameBundleLoadResult,
  type GameBundleError,
} from '../src/adapters/gameBundleLoader';

function createValidBundle(): PublishedGameBundle {
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

function injectEmbeddedScript(
  content: string,
  type = 'application/json',
  id = 'vn-game-bundle',
): HTMLScriptElement {
  const script = document.createElement('script');
  script.id = id;
  script.type = type;
  script.textContent = content;
  document.body.appendChild(script);
  return script;
}

const baseUrl = 'https://g.example/play/index.html';
const expectedProjectUrl = new URL('project.json', baseUrl).href;

afterEach(() => {
  const scripts = document.querySelectorAll('script#vn-game-bundle');
  scripts.forEach(script => script.remove());
  vi.clearAllMocks();
});

describe('loadGameBundle (Phase L2b RED)', () => {
  describe('type contract', () => {
    it('exports GameBundleLoadResult with expected shape', () => {
      expectTypeOf<GameBundleLoadResult>().toEqualTypeOf<
        | {
            kind: 'bundle';
            bundle: PublishedGameBundle;
            warnings: string[];
            source: 'embedded' | 'file';
          }
        | { kind: 'none' }
        | {
            kind: 'error';
            error: GameBundleError | 'invalid_json' | 'fetch_failed';
          }
      >();
    });
  });

  describe('embedded script loading (<script id="vn-game-bundle">)', () => {
    it('loads valid embedded bundle with source "embedded" and does not call fetchFn', async () => {
      const bundle = createValidBundle();
      injectEmbeddedScript(JSON.stringify(bundle));
      const fetchFn = vi.fn((_url: string) => Promise.resolve(new Response('')));

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result.kind).toBe('bundle');
      if (result.kind === 'bundle') {
        expect(result.source).toBe('embedded');
        expect(result.bundle.projectId).toBe('demo-project-id');
        expect(result.bundle.title).toBe('Demo Project Title');
        expect(result.bundle.formatVersion).toBe(1);
        expect(result.bundle.entryScene).toBe('start_scene');
        expect(result.warnings).toEqual([]);
      }
    });

    it('returns error "invalid_json" without calling fetchFn when embedded script contains corrupted JSON', async () => {
      injectEmbeddedScript('{ not a valid json');
      const fetchFn = vi.fn((_url: string) => Promise.resolve(new Response('')));

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'error', error: 'invalid_json' });
    });

    it('returns error "unsupported_version" without calling fetchFn when embedded bundle formatVersion is wrong', async () => {
      const raw = { ...createValidBundle(), formatVersion: 2 };
      injectEmbeddedScript(JSON.stringify(raw));
      const fetchFn = vi.fn((_url: string) => Promise.resolve(new Response('')));

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).not.toHaveBeenCalled();
      expect(result).toEqual({ kind: 'error', error: 'unsupported_version' });
    });

    it('ignores script element when type is not "application/json" and falls back to fetch', async () => {
      const embeddedBundle = { ...createValidBundle(), projectId: 'embedded-id' };
      injectEmbeddedScript(JSON.stringify(embeddedBundle), 'text/javascript');

      const fileBundle = { ...createValidBundle(), projectId: 'file-id' };
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response(JSON.stringify(fileBundle), { status: 200 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result.kind).toBe('bundle');
      if (result.kind === 'bundle') {
        expect(result.source).toBe('file');
        expect(result.bundle.projectId).toBe('file-id');
      }
    });
  });

  describe('file bundle loading (fetch project.json fallback)', () => {
    it('fetches project.json when no script is present and returns bundle with source "file"', async () => {
      const fileBundle = createValidBundle();
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response(JSON.stringify(fileBundle), { status: 200 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith('https://g.example/play/project.json');
      expect(result.kind).toBe('bundle');
      if (result.kind === 'bundle') {
        expect(result.source).toBe('file');
        expect(result.bundle.projectId).toBe('demo-project-id');
        expect(result.bundle.title).toBe('Demo Project Title');
        expect(result.warnings).toEqual([]);
      }
    });

    it('resolves project.json relative to directory baseUrl', async () => {
      const fileBundle = createValidBundle();
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response(JSON.stringify(fileBundle), { status: 200 })),
      );

      await loadGameBundle({
        document,
        fetchFn,
        baseUrl: 'https://g.example/play/sub/index.html',
      });

      expect(fetchFn).toHaveBeenCalledWith('https://g.example/play/sub/project.json');
    });

    it('returns kind "none" when fetch returns 404', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response('Not Found', { status: 404, statusText: 'Not Found' })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'none' });
    });

    it('returns error "invalid_json" when fetch returns 200 but body is not valid JSON', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response('<!DOCTYPE html><html>Not JSON</html>', { status: 200 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'error', error: 'invalid_json' });
    });

    it('returns error "fetch_failed" when fetchFn rejects (network error)', async () => {
      const fetchFn = vi.fn((_url: string) => Promise.reject(new Error('Network disconnected')));

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'error', error: 'fetch_failed' });
    });

    it('returns error "fetch_failed" when fetch returns 500 status', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response('Internal Server Error', { status: 500 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'error', error: 'fetch_failed' });
    });

    it('returns error "fetch_failed" for other HTTP errors (e.g. 403)', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response('Forbidden', { status: 403 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'error', error: 'fetch_failed' });
    });

    it('returns schema validation error when fetched JSON is invalid according to parseGameBundle', async () => {
      const raw = { ...createValidBundle(), formatVersion: 99 };
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response(JSON.stringify(raw), { status: 200 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(result).toEqual({ kind: 'error', error: 'unsupported_version' });
    });
  });

  describe('asset storageUrl resolution and warnings handling', () => {
    it('resolves relative asset storageUrl against baseUrl and returns warnings from parseGameBundle', async () => {
      const rawBundle = {
        ...createValidBundle(),
        assets: [
          {
            id: 'asset_rel',
            name: 'a.png',
            type: 'image',
            storageUrl: 'assets/a.png',
            sizeBytes: 1024,
          },
          {
            id: 'asset_danger',
            name: 'evil.png',
            type: 'image',
            storageUrl: 'javascript:alert(1)',
            sizeBytes: 100,
          },
        ],
      };

      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(new Response(JSON.stringify(rawBundle), { status: 200 })),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(result.kind).toBe('bundle');
      if (result.kind === 'bundle') {
        expect(result.bundle.assets).toHaveLength(1);
        const firstAsset = result.bundle.assets[0];
        expect(firstAsset).toBeDefined();
        expect(firstAsset?.id).toBe('asset_rel');
        expect(firstAsset?.storageUrl).toBe('https://g.example/play/assets/a.png');
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('asset_danger'))).toBe(true);
      }
    });

    it('resolves relative asset storageUrl for embedded bundle against baseUrl', async () => {
      const rawBundle = {
        ...createValidBundle(),
        assets: [
          {
            id: 'asset_emb',
            name: 'bg.png',
            type: 'image',
            storageUrl: 'assets/bg.png',
            sizeBytes: 2048,
          },
        ],
      };
      injectEmbeddedScript(JSON.stringify(rawBundle));
      const fetchFn = vi.fn((_url: string) => Promise.resolve(new Response('')));

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(result.kind).toBe('bundle');
      if (result.kind === 'bundle') {
        const firstAsset = result.bundle.assets[0];
        expect(firstAsset).toBeDefined();
        expect(firstAsset?.storageUrl).toBe('https://g.example/play/assets/bg.png');
        expect(result.warnings).toEqual([]);
      }
    });
  });

  describe('SPA fallback (review)', () => {
    it('returns kind "none" when fetch returns 200 with content-type containing text/html (SPA fallback)', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(
          new Response('<!doctype html><html><body>SPA fallback</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
        ),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'none' });
    });

    it('returns kind "none" when fetch returns 200 with uppercase TEXT/HTML content-type', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(
          new Response('<!DOCTYPE HTML><html>SPA fallback</html>', {
            status: 200,
            headers: { 'content-type': 'TEXT/HTML' },
          }),
        ),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'none' });
    });

    it('returns error "invalid_json" when fetch returns 200 with application/json but corrupted body', async () => {
      const fetchFn = vi.fn((_url: string) =>
        Promise.resolve(
          new Response('{ corrupted json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result).toEqual({ kind: 'error', error: 'invalid_json' });
    });

    it('returns bundle when fetch returns 200 with no content-type and valid bundle', async () => {
      const validBundle = createValidBundle();
      const res = new Response(JSON.stringify(validBundle), { status: 200 });
      res.headers.delete('content-type');
      const fetchFn = vi.fn((_url: string) => Promise.resolve(res));

      const result = await loadGameBundle({
        document,
        fetchFn,
        baseUrl,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(expectedProjectUrl);
      expect(result.kind).toBe('bundle');
      if (result.kind === 'bundle') {
        expect(result.source).toBe('file');
        expect(result.bundle.projectId).toBe('demo-project-id');
      }
    });
  });
});
