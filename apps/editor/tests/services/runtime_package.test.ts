// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  ITCH_HTML5_LIMITS,
  PUBLISHED_MARKER_META,
  checkPublishedPackageLimits,
  injectPublishedMarker,
  loadRuntimeFiles,
  parseRuntimeManifest,
} from '../../src/core/services/runtimePackage';

const BASE_URL = 'http://localhost:3001/runtime/';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function textResponse(body: string, contentType = 'text/javascript'): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
}

describe('parseRuntimeManifest (TASK-EXP-WEBZIP W4)', () => {
  it('accepts a formatVersion 1 manifest that lists index.html', () => {
    expect(
      parseRuntimeManifest({
        formatVersion: 1,
        files: ['index.html', 'assets/index-abc.js', 'assets/index-abc.css'],
      }),
    ).toEqual({
      formatVersion: 1,
      files: ['index.html', 'assets/index-abc.js', 'assets/index-abc.css'],
    });
  });

  it.each([
    ['not an object', 'runtime'],
    ['null', null],
    ['wrong version', { formatVersion: 2, files: ['index.html'] }],
    ['files not an array', { formatVersion: 1, files: 'index.html' }],
    ['no index.html', { formatVersion: 1, files: ['assets/a.js'] }],
    ['non-string entry', { formatVersion: 1, files: ['index.html', 42] }],
    ['empty entry', { formatVersion: 1, files: ['index.html', ''] }],
    ['duplicate entry', { formatVersion: 1, files: ['index.html', 'index.html'] }],
  ])('rejects a manifest with %s', (_label, raw) => {
    expect(parseRuntimeManifest(raw)).toBeNull();
  });

  it.each([
    '../secret.js',
    'assets/../../secret.js',
    'assets/./a.js',
    '/etc/passwd',
    '\\\\host\\share.js',
    'assets\\a.js',
    'C:/Windows/a.js',
    'https://evil.example/a.js',
    'javascript:alert(1)',
    'assets/a\u0000.js',
    'assets/a\n.js',
    'assets//a.js',
    'assets/',
  ])('rejects the unsafe path %j', unsafePath => {
    expect(
      parseRuntimeManifest({ formatVersion: 1, files: ['index.html', unsafePath] }),
    ).toBeNull();
  });

  it.each(['project.json', 'README.txt', 'game-assets/abc.png', 'manifest.json'])(
    'rejects the reserved path %j',
    reserved => {
      expect(
        parseRuntimeManifest({ formatVersion: 1, files: ['index.html', reserved] }),
      ).toBeNull();
    },
  );
});

describe('loadRuntimeFiles (TASK-EXP-WEBZIP W4)', () => {
  it('fetches the manifest and every listed file relative to the base URL', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url === `${BASE_URL}manifest.json`) {
        return jsonResponse({ formatVersion: 1, files: ['index.html', 'assets/index-abc.js'] });
      }
      if (url === `${BASE_URL}index.html`) return textResponse('<html></html>', 'text/html');
      if (url === `${BASE_URL}assets/index-abc.js`) return textResponse('console.log(1)');
      return new Response('not found', { status: 404 });
    });

    const result = await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect([...result.files.keys()]).toEqual(['index.html', 'assets/index-abc.js']);
    expect(new TextDecoder().decode(result.files.get('assets/index-abc.js'))).toBe(
      'console.log(1)',
    );
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('reports missing when the manifest returns 404', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 }));
    expect(await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL })).toEqual({ kind: 'missing' });
  });

  it('reports missing when the dev server answers with the SPA index.html', async () => {
    const fetchFn = vi.fn(async () => textResponse('<!doctype html>', 'text/html'));
    expect(await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL })).toEqual({ kind: 'missing' });
  });

  it('reports missing when fetching the manifest throws', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL })).toEqual({ kind: 'missing' });
  });

  it('reports an error for an invalid manifest', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ formatVersion: 1, files: ['index.html', '../evil.js'] }),
    );
    const result = await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL });
    expect(result.kind).toBe('error');
  });

  it('reports an error for a manifest that is not valid JSON', async () => {
    const fetchFn = vi.fn(async () => textResponse('{not json', 'application/json'));
    const result = await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL });
    expect(result.kind).toBe('error');
  });

  it('reports an error when a listed file cannot be fetched', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) {
        return jsonResponse({ formatVersion: 1, files: ['index.html', 'assets/gone.js'] });
      }
      if (url.endsWith('index.html')) return textResponse('<html></html>', 'text/html');
      return new Response('gone', { status: 404 });
    });
    const result = await loadRuntimeFiles({ fetchFn, baseUrl: BASE_URL });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('assets/gone.js');
    }
  });
});

describe('injectPublishedMarker (TASK-EXP-WEBZIP W4)', () => {
  it('inserts the published meta tag as the first element of <head>', () => {
    const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n</head>';
    const result = injectPublishedMarker(html);
    expect(result).toContain(`<head>${PUBLISHED_MARKER_META}`);
    expect(result.indexOf(PUBLISHED_MARKER_META)).toBeLessThan(result.indexOf('charset'));
  });

  it('handles a <head> tag with attributes and different casing', () => {
    const result = injectPublishedMarker('<html><HEAD data-x="1"><title>x</title></HEAD></html>');
    expect(result).toContain(`<HEAD data-x="1">${PUBLISHED_MARKER_META}`);
  });

  it('does not add a second marker', () => {
    const once = injectPublishedMarker('<html><head></head></html>');
    expect(injectPublishedMarker(once)).toBe(once);
  });

  it('throws when the document has no <head>', () => {
    expect(() => injectPublishedMarker('<html><body></body></html>')).toThrow(/head/i);
  });

  it('uses the marker the runtime player looks for', () => {
    expect(PUBLISHED_MARKER_META).toBe('<meta name="taleforge-mode" content="published">');
  });
});

describe('checkPublishedPackageLimits (TASK-EXP-WEBZIP W4)', () => {
  it('uses the itch.io HTML5 defaults', () => {
    expect(ITCH_HTML5_LIMITS).toEqual({
      maxFiles: 1000,
      maxTotalBytes: 500 * 1024 * 1024,
      maxFileBytes: 200 * 1024 * 1024,
      maxPathLength: 240,
    });
  });

  it('returns no warnings for a small package', () => {
    const sizes = new Map([
      ['index.html', 800],
      ['project.json', 2048],
    ]);
    expect(checkPublishedPackageLimits(sizes)).toEqual([]);
  });

  it('warns about each exceeded limit', () => {
    const sizes = new Map<string, number>();
    for (let i = 0; i < 1001; i++) sizes.set(`game-assets/${i}.png`, 1);
    sizes.set('game-assets/huge.mp4', 200 * 1024 * 1024 + 1);
    sizes.set('game-assets/big1.bin', 160 * 1024 * 1024);
    sizes.set('game-assets/big2.bin', 160 * 1024 * 1024);
    sizes.set(`game-assets/${'a'.repeat(240)}.png`, 1);

    const codes = checkPublishedPackageLimits(sizes).map(w => w.code);
    expect(codes).toEqual(['file_count', 'total_size', 'file_size', 'path_length']);
  });

  it('names the offending file for per-file warnings', () => {
    const sizes = new Map([['game-assets/huge.mp4', 200 * 1024 * 1024 + 1]]);
    const [warning] = checkPublishedPackageLimits(sizes);
    expect(warning?.code).toBe('file_size');
    expect(warning?.message).toContain('game-assets/huge.mp4');
  });
});
