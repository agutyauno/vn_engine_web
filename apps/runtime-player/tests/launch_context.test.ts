// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import {
  PUBLISHED_MODE_META_NAME,
  PUBLISHED_MODE_META_CONTENT,
  detectLaunchContext,
  readLaunchContextInput,
  type LaunchContextInput,
} from '../src/adapters/launchContext';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseInput: LaunchContextInput = {
  search: '',
  windowName: '',
  isFramed: false,
  publishedMeta: null,
};

describe('detectLaunchContext (TASK-EXP-WEBZIP W2)', () => {
  it('treats a top-level page without hints as standalone with the preview bridge enabled', () => {
    const ctx = detectLaunchContext(baseInput);
    expect(ctx).toEqual({
      isPublished: false,
      isPopout: false,
      isModePreview: false,
      isEmbedded: false,
      enablePreviewBridge: true,
    });
  });

  it('keeps the existing embedded heuristics when there is no published marker', () => {
    expect(detectLaunchContext({ ...baseInput, isFramed: true }).isEmbedded).toBe(true);
    expect(detectLaunchContext({ ...baseInput, search: '?embedded=true' }).isEmbedded).toBe(true);
    expect(detectLaunchContext({ ...baseInput, search: '?popout=true' }).isPopout).toBe(true);
    expect(detectLaunchContext({ ...baseInput, windowName: 'VN_Preview_Popout' }).isPopout).toBe(
      true,
    );
    const preview = detectLaunchContext({ ...baseInput, search: '?mode=preview' });
    expect(preview.isModePreview).toBe(true);
    expect(preview.isEmbedded).toBe(true);
  });

  it('runs a published package standalone even inside an iframe (itch.io)', () => {
    const ctx = detectLaunchContext({
      ...baseInput,
      isFramed: true,
      publishedMeta: PUBLISHED_MODE_META_CONTENT,
    });
    expect(ctx).toEqual({
      isPublished: true,
      isPopout: false,
      isModePreview: false,
      isEmbedded: false,
      enablePreviewBridge: false,
    });
  });

  it('ignores preview query hints and popout window names in a published package', () => {
    const ctx = detectLaunchContext({
      search: '?mode=preview&embedded=true&popout=true',
      windowName: 'VN_Preview_Popout',
      isFramed: true,
      publishedMeta: PUBLISHED_MODE_META_CONTENT,
    });
    expect(ctx.isPublished).toBe(true);
    expect(ctx.isEmbedded).toBe(false);
    expect(ctx.isModePreview).toBe(false);
    expect(ctx.isPopout).toBe(false);
    expect(ctx.enablePreviewBridge).toBe(false);
  });

  it('only accepts the exact published marker value', () => {
    for (const value of ['Published', ' published', 'preview', '']) {
      const ctx = detectLaunchContext({ ...baseInput, isFramed: true, publishedMeta: value });
      expect(ctx.isPublished).toBe(false);
      expect(ctx.isEmbedded).toBe(true);
    }
  });
});

describe('readLaunchContextInput (TASK-EXP-WEBZIP W2)', () => {
  afterEach(() => {
    document.head.querySelectorAll(`meta[name="${PUBLISHED_MODE_META_NAME}"]`).forEach(m => {
      m.remove();
    });
  });

  it('reads the published meta tag content from the document head', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', PUBLISHED_MODE_META_NAME);
    meta.setAttribute('content', PUBLISHED_MODE_META_CONTENT);
    document.head.appendChild(meta);

    const input = readLaunchContextInput(document, window);
    expect(input.publishedMeta).toBe('published');
    expect(input.isFramed).toBe(false);
  });

  it('returns null when the marker is absent', () => {
    expect(readLaunchContextInput(document, window).publishedMeta).toBeNull();
  });
});

describe('runtime player build config (TASK-EXP-WEBZIP W2)', () => {
  it('uses a relative base so the build works from any subfolder', () => {
    // Đọc file cấu hình dạng text: import vite.config.ts vào test sẽ kéo cả kiểu của Vite vào tsc.
    const configSource = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf-8');
    expect(configSource).toMatch(/^\s*base:\s*'\.\/',?\s*$/m);
  });
});
