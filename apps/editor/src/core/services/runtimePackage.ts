/**
 * Ghép runtime player vào gói Export → Web (TASK-EXP-WEBZIP, hướng B').
 *
 * Lúc build, `scripts/bundle-runtime.mjs` chép bản build player vào `public/runtime/` kèm
 * `manifest.json`. Lúc export, editor đọc manifest và từng file trên chính origin của nó.
 * Manifest được coi là dữ liệu không tin cậy: chỉ nhận đường dẫn tương đối an toàn.
 */

export const RUNTIME_MANIFEST_FORMAT_VERSION = 1;

/**
 * Thư mục chứa asset của game trong gói xuất bản. Không dùng `assets/` vì trùng với thư mục
 * JS/CSS mà Vite tạo cho bản build runtime player đi kèm.
 */
export const GAME_ASSETS_DIR = 'game-assets';

/** Thẻ meta mà runtime player dùng để nhận ra gói xuất bản (xem `launchContext.ts` của player). */
export const PUBLISHED_MARKER_META = '<meta name="taleforge-mode" content="published">';

/** Các đường dẫn do editor tự sinh trong gói; runtime không được ghi đè. */
const RESERVED_ROOT_FILES = new Set(['project.json', 'README.txt', 'manifest.json']);
const RESERVED_PREFIXES = [`${GAME_ASSETS_DIR}/`];

/** Giới hạn mặc định của itch.io cho game HTML5 (https://itch.io/docs/creators/html5). */
export const ITCH_HTML5_LIMITS = {
  maxFiles: 1000,
  maxTotalBytes: 500 * 1024 * 1024,
  maxFileBytes: 200 * 1024 * 1024,
  maxPathLength: 240,
} as const;

export interface RuntimeManifest {
  formatVersion: typeof RUNTIME_MANIFEST_FORMAT_VERSION;
  files: string[];
}

export type RuntimeLoadResult =
  | { kind: 'ok'; files: Map<string, Uint8Array> }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export interface PackageLimitWarning {
  code: 'file_count' | 'total_size' | 'file_size' | 'path_length';
  message: string;
}

/** Mỗi đoạn đường dẫn chỉ gồm chữ, số, `.`, `_`, `-` (loại luôn ký tự điều khiển, khoảng trắng). */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isReservedPackagePath(path: string): boolean {
  return RESERVED_ROOT_FILES.has(path) || RESERVED_PREFIXES.some(prefix => path.startsWith(prefix));
}

/** Đường dẫn tương đối dạng POSIX, chỉ gồm các đoạn an toàn, không `.`/`..`, không scheme. */
export function isSafeRuntimePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.includes('\\') || path.includes(':')) return false;
  const segments = path.split('/');
  return segments.every(
    segment => segment !== '.' && segment !== '..' && SAFE_SEGMENT.test(segment),
  );
}

export function parseRuntimeManifest(raw: unknown): RuntimeManifest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if (!('formatVersion' in raw) || raw.formatVersion !== RUNTIME_MANIFEST_FORMAT_VERSION) {
    return null;
  }
  if (!('files' in raw) || !Array.isArray(raw.files)) return null;

  const files: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw.files as unknown[]) {
    if (typeof entry !== 'string' || !isSafeRuntimePath(entry)) return null;
    if (isReservedPackagePath(entry) || seen.has(entry)) return null;
    seen.add(entry);
    files.push(entry);
  }
  if (!seen.has('index.html')) return null;

  return { formatVersion: RUNTIME_MANIFEST_FORMAT_VERSION, files };
}

export interface LoadRuntimeFilesOptions {
  fetchFn: (url: string) => Promise<Response>;
  /** URL tuyệt đối của thư mục runtime, kết thúc bằng `/` (ví dụ `https://editor/runtime/`). */
  baseUrl: string;
}

export async function loadRuntimeFiles({
  fetchFn,
  baseUrl,
}: LoadRuntimeFilesOptions): Promise<RuntimeLoadResult> {
  let manifestResponse: Response;
  try {
    manifestResponse = await fetchFn(new URL('manifest.json', baseUrl).href);
  } catch {
    return { kind: 'missing' };
  }
  if (!manifestResponse.ok) return { kind: 'missing' };
  // Dev server của Vite trả index.html (200, text/html) cho đường dẫn không tồn tại
  const contentType = manifestResponse.headers.get('Content-Type') ?? '';
  if (contentType.toLowerCase().includes('text/html')) return { kind: 'missing' };

  let raw: unknown;
  try {
    raw = JSON.parse(await manifestResponse.text());
  } catch {
    return { kind: 'error', message: 'The bundled runtime manifest is not valid JSON.' };
  }

  const manifest = parseRuntimeManifest(raw);
  if (!manifest) {
    return { kind: 'error', message: 'The bundled runtime manifest is invalid or unsafe.' };
  }

  const files = new Map<string, Uint8Array>();
  for (const path of manifest.files) {
    let response: Response;
    try {
      response = await fetchFn(new URL(path, baseUrl).href);
    } catch {
      return { kind: 'error', message: `Failed to load runtime file "${path}".` };
    }
    if (!response.ok) {
      return { kind: 'error', message: `Failed to load runtime file "${path}".` };
    }
    files.set(path, new Uint8Array(await response.arrayBuffer()));
  }

  return { kind: 'ok', files };
}

/** Chèn thẻ meta published làm phần tử đầu tiên của `<head>` (trước script phát hiện iframe). */
export function injectPublishedMarker(html: string): string {
  if (html.includes(PUBLISHED_MARKER_META)) return html;
  const headOpen = /<head(\s[^>]*)?>/i.exec(html);
  if (!headOpen) {
    throw new Error('Runtime index.html has no <head> element.');
  }
  const insertAt = headOpen.index + headOpen[0].length;
  return html.slice(0, insertAt) + PUBLISHED_MARKER_META + html.slice(insertAt);
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Kiểm tra gói theo giới hạn HTML5 của itch.io, dựa trên kích thước sau giải nén. */
export function checkPublishedPackageLimits(fileSizes: Map<string, number>): PackageLimitWarning[] {
  const warnings: PackageLimitWarning[] = [];
  const limits = ITCH_HTML5_LIMITS;

  if (fileSizes.size > limits.maxFiles) {
    warnings.push({
      code: 'file_count',
      message: `The package has ${fileSizes.size} files; itch.io allows up to ${limits.maxFiles}.`,
    });
  }

  let total = 0;
  for (const size of fileSizes.values()) total += size;
  if (total > limits.maxTotalBytes) {
    warnings.push({
      code: 'total_size',
      message: `The package is ${formatMegabytes(total)} when extracted; itch.io allows up to ${formatMegabytes(limits.maxTotalBytes)}.`,
    });
  }

  for (const [path, size] of fileSizes) {
    if (size > limits.maxFileBytes) {
      warnings.push({
        code: 'file_size',
        message: `"${path}" is ${formatMegabytes(size)}; itch.io allows up to ${formatMegabytes(limits.maxFileBytes)} per file.`,
      });
    }
  }

  for (const path of fileSizes.keys()) {
    if (path.length > limits.maxPathLength) {
      warnings.push({
        code: 'path_length',
        message: `A file path is ${path.length} characters long; itch.io allows up to ${limits.maxPathLength}.`,
      });
    }
  }

  return warnings;
}

export const PUBLISHED_PACKAGE_README = `This folder is a TaleForge web game.

How to play
- Serve this folder with any static web server and open index.html through it,
  for example: npx serve .
- Opening index.html directly from disk (file://) is not supported: browsers
  block loading project.json and the player scripts that way.

Upload to itch.io
- Create a project with Kind of project set to "HTML".
- Upload this ZIP and tick "This file will be played in the browser".
- index.html is already at the root of the ZIP, as itch.io requires.

Contents
- index.html, assets/   : the TaleForge runtime player
- project.json          : the compiled game
- game-assets/          : images and audio used by the game
`;
