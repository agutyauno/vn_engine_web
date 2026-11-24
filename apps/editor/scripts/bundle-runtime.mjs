// @ts-check
/**
 * Chép bản build của runtime player (`apps/runtime-player/dist`) vào `apps/editor/public/runtime/`
 * và sinh `manifest.json` liệt kê file. Editor đọc manifest này lúc Export → Web để ghép runtime
 * vào ZIP cùng origin (không cần CORS, chạy offline, luôn cùng commit với editor).
 *
 * Chạy tự động trước `vite build` của editor. `@vn-engine/runtime-player` là devDependency của
 * editor chỉ để `pnpm -r run build` build player trước; editor không import code của player.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
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
    cpSync(join(sourceDir, ...file.split('/')), destination);
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
