// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleRuntime, collectRuntimeFiles } from '../../scripts/bundle-runtime.mjs';

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
    writeSource('index.html', '<html>player</html>');
    writeSource('assets/index-abc.js', 'console.log(1)');

    const result = bundleRuntime({ sourceDir, targetDir });

    expect(result.files).toEqual(['assets/index-abc.js', 'index.html']);
    expect(readFileSync(join(targetDir, 'index.html'), 'utf-8')).toBe('<html>player</html>');
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
    writeSource('index.html', '<html></html>');

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
});
