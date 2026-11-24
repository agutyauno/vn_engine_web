// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PUBLISHED_MARKER_META as SCRIPT_MARKER,
  bundleRuntime,
  collectRuntimeFiles,
} from '../../scripts/bundle-runtime.mjs';
import { PUBLISHED_MARKER_META as EDITOR_MARKER } from '../../src/core/services/runtimePackage';

describe('bundle-runtime script (TASK-EXP-WEBZIP W3)', () => {
  let root: string;
  let sourceDir: string;
  let targetDir: string;

  const writeSource = (relativePath: string, content: string) => {
    const full = join(sourceDir, ...relativePath.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tf-runtime-'));
    sourceDir = join(root, 'player-dist');
    targetDir = join(root, 'editor-public', 'runtime');
    mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists every file as a sorted relative POSIX path', () => {
    writeSource('index.html', '<html></html>');
    writeSource('assets/index-abc.js', 'console.log(1)');
    writeSource('assets/index-abc.css', 'body{}');
    writeSource('assets/chunks/pixi-x.js', '//');

    expect(collectRuntimeFiles(sourceDir)).toEqual([
      'assets/chunks/pixi-x.js',
      'assets/index-abc.css',
      'assets/index-abc.js',
      'index.html',
    ]);
  });

  it('copies the player build and writes manifest.json with formatVersion 1', () => {
    writeSource('index.html', '<html><head></head><body>player</body></html>');
    writeSource('assets/index-abc.js', 'console.log(1)');

    const result = bundleRuntime({ sourceDir, targetDir });

    expect(result.files).toEqual(['assets/index-abc.js', 'index.html']);
    expect(readFileSync(join(targetDir, 'index.html'), 'utf-8')).toContain('<body>player</body>');
    expect(readFileSync(join(targetDir, 'assets', 'index-abc.js'), 'utf-8')).toBe('console.log(1)');

    const manifest: unknown = JSON.parse(readFileSync(join(targetDir, 'manifest.json'), 'utf-8'));
    expect(manifest).toEqual({
      formatVersion: 1,
      files: ['assets/index-abc.js', 'index.html'],
    });
  });

  it('removes stale files from a previous bundle', () => {
    mkdirSync(join(targetDir, 'assets'), { recursive: true });
    writeFileSync(join(targetDir, 'assets', 'index-OLD.js'), 'old');
    writeSource('index.html', '<html><head></head></html>');

    bundleRuntime({ sourceDir, targetDir });

    expect(existsSync(join(targetDir, 'assets', 'index-OLD.js'))).toBe(false);
  });

  it('fails loudly when the player build has no index.html', () => {
    writeSource('assets/index-abc.js', 'console.log(1)');
    expect(() => bundleRuntime({ sourceDir, targetDir })).toThrow(/index\.html/);
  });

  it('fails loudly when the player build directory does not exist', () => {
    expect(() => bundleRuntime({ sourceDir: join(root, 'missing'), targetDir })).toThrow(
      /runtime-player/,
    );
  });
  describe('published marker in the bundled runtime (TASK-EXP-WEBZIP follow-up)', () => {
    const MARKER = '<meta name="taleforge-mode" content="published">';

    it('inserts the published marker as the first element of <head> in the copied index.html', () => {
      writeSource(
        'index.html',
        '<!DOCTYPE html><html><head>\n  <meta charset="UTF-8" /></head></html>',
      );

      bundleRuntime({ sourceDir, targetDir });

      const copied = readFileSync(join(targetDir, 'index.html'), 'utf-8');
      expect(copied).toContain(`<head>${MARKER}`);
      expect(copied.indexOf(MARKER)).toBeLessThan(copied.indexOf('charset'));
    });

    it('leaves the player build itself untouched', () => {
      const original = '<html><head></head></html>';
      writeSource('index.html', original);

      bundleRuntime({ sourceDir, targetDir });

      expect(readFileSync(join(sourceDir, 'index.html'), 'utf-8')).toBe(original);
    });

    it('does not add a second marker when the build already has one', () => {
      writeSource('index.html', `<html><head>${MARKER}</head></html>`);

      bundleRuntime({ sourceDir, targetDir });

      const copied = readFileSync(join(targetDir, 'index.html'), 'utf-8');
      expect(copied.split(MARKER)).toHaveLength(2);
    });

    it('uses the same marker as the editor export service', () => {
      expect(SCRIPT_MARKER).toBe(EDITOR_MARKER);
    });

    it('fails loudly when index.html has no <head>', () => {
      writeSource('index.html', '<html><body></body></html>');
      expect(() => bundleRuntime({ sourceDir, targetDir })).toThrow(/head/i);
    });
  });
});
