// @ts-check
/**
 * Chép bản build của runtime player (`apps/runtime-player/dist`) vào `apps/editor/public/runtime/`
 * và sinh `manifest.json` liệt kê file. Editor đọc manifest này lúc Export → Web để ghép runtime
 * vào ZIP cùng origin (không cần CORS, chạy offline, luôn cùng commit với editor).
 *
 * Chạy tự động trước `vite build` của editor. `@vn-engine/runtime-player` là devDependency của
 * editor chỉ để `pnpm -r run build` build player trước; editor không import code của player.
 *
 * Bản `index.html` được chép sang có sẵn thẻ meta published, nên bản runtime deploy cùng editor
 * (`/runtime/index.html`) cũng luôn chạy standalone và không mở kênh preview, kể cả khi bị trang
 * khác nhúng. Bản build gốc của player (dùng cho preview trong editor) không bị đổi.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_MANIFEST_FORMAT_VERSION = 1;
export const RUNTIME_MANIFEST_FILE = 'manifest.json';

/**
 * Phải giống `PUBLISHED_MARKER_META` trong `src/core/services/runtimePackage.ts` (script này chạy
 * bằng Node trước khi build nên không import được file TypeScript của editor).
 */
export const PUBLISHED_MARKER_META = '<meta name="taleforge-mode" content="published">';

/**
 * Chèn thẻ meta published làm phần tử đầu tiên của `<head>`; không chèn lần hai.
 * @param {string} html
 * @returns {string}
 */
export function injectPublishedMarker(html) {
  if (html.includes(PUBLISHED_MARKER_META)) return html;
  const headOpen = /<head(\s[^>]*)?>/i.exec(html);
  if (!headOpen) {
    throw new Error('Runtime index.html has no <head> element.');
  }
  const insertAt = headOpen.index + headOpen[0].length;
  return html.slice(0, insertAt) + PUBLISHED_MARKER_META + html.slice(insertAt);
}

/**
 * Liệt kê mọi file trong thư mục dưới dạng đường dẫn POSIX tương đối, đã sắp xếp.
 * @param {string} dir
 * @returns {string[]}
 */
export function collectRuntimeFiles(dir) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} current */
  const walk = current => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(relative(dir, full).split(sep).join('/'));
      }
    }
  };
  walk(dir);
  return files.sort();
}

/**
 * @param {{ sourceDir: string, targetDir: string }} options
 * @returns {{ files: string[] }}
 */
export function bundleRuntime({ sourceDir, targetDir }) {
  if (!existsSync(sourceDir)) {
    throw new Error(
      `Runtime player build not found at ${sourceDir}. Run "pnpm --filter @vn-engine/runtime-player build" first.`,
    );
  }
  if (!existsSync(join(sourceDir, 'index.html'))) {
    throw new Error(`Runtime player build at ${sourceDir} has no index.html.`);
  }

  const files = collectRuntimeFiles(sourceDir).filter(file => file !== RUNTIME_MANIFEST_FILE);

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  for (const file of files) {
    const destination = join(targetDir, ...file.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    const source = join(sourceDir, ...file.split('/'));
    if (file === 'index.html') {
      writeFileSync(destination, injectPublishedMarker(readFileSync(source, 'utf-8')));
    } else {
      cpSync(source, destination);
    }
  }

  const manifest = { formatVersion: RUNTIME_MANIFEST_FORMAT_VERSION, files };
  writeFileSync(join(targetDir, RUNTIME_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return { files };
}

const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { files } = bundleRuntime({
    sourceDir: resolve(editorRoot, '../runtime-player/dist'),
    targetDir: resolve(editorRoot, 'public/runtime'),
  });
  console.log(`[bundle-runtime] Copied ${files.length} runtime player files into public/runtime/`);
}
