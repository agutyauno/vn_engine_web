import {
  PUBLISHED_BUNDLE_FORMAT_VERSION,
  type AssetRef,
  type Instruction,
  type ProjectTitleSettings,
  type PublishedGameBundle,
} from '@vn-engine/shared-types';

export type GameBundleError = 'not_object' | 'unsupported_version' | 'invalid_field';

export type GameBundleParseResult =
  | { ok: true; bundle: PublishedGameBundle; warnings: string[] }
  | { ok: false; error: GameBundleError };

/**
 * Kiểm tra giá trị có phải là Record (object thông thường, không null, không mảng).
 */
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Kiểm tra giá trị có phải là chuỗi không rỗng.
 */
function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.length > 0;
}

/** Tập hợp các kiểu asset hợp lệ theo hợp đồng AssetRef. */
const VALID_ASSET_TYPES = new Set<string>(['image', 'audio', 'video', 'font']);

/**
 * Phân loại và phân giải storageUrl an toàn theo nguyên tắc Zero-Trust:
 * - Từ chối ngay nếu chứa ký tự điều khiển (< 0x20 hoặc 0x7F).
 * - Từ chối các tiền tố nguy hiểm: //, \, /\, \/.
 * - Cho phép data:image/, data:audio/, http:, https:.
 * - URL tương đối:
 *   + Khi có baseUrl: resolve qua new URL(url, baseUrl), chỉ chấp nhận khi resolved.origin === baseUrl.origin và protocol http:/https:.
 *   + Khi không có baseUrl: giữ nguyên nếu không có tiền tố nguy hiểm và không chứa ký tự điều khiển.
 * - Mọi scheme khác hoặc URL lỗi -> loại bỏ asset và ghi nhận warning kèm asset id.
 */
function resolveSafeStorageUrl(
  rawUrl: unknown,
  assetId: string,
  baseUrl: string | undefined,
  warnings: string[],
): string | null {
  if (typeof rawUrl !== 'string') {
    warnings.push(`Asset '${assetId}' excluded: storageUrl is not a string.`);
    return null;
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    warnings.push(`Asset '${assetId}' excluded: storageUrl is empty.`);
    return null;
  }

  // 1. Từ chối ngay nếu chứa ký tự điều khiển ở bất kỳ vị trí nào
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      warnings.push(`Asset '${assetId}' excluded: storageUrl contains control characters.`);
      return null;
    }
  }

  // 2. Từ chối các URL bắt đầu bằng //, \, /\ (ngăn chặn protocol-relative và backslash authority bypass)
  if (trimmed.startsWith('//') || trimmed.startsWith('\\') || trimmed.startsWith('/\\')) {
    warnings.push(
      `Asset '${assetId}' excluded: disallowed prefix '//', '\\', or '/\\' in storageUrl '${trimmed}'.`,
    );
    return null;
  }

  const lower = trimmed.toLowerCase();

  // 3. Chấp nhận data URL hợp lệ cho hình ảnh và âm thanh
  if (lower.startsWith('data:image/') || lower.startsWith('data:audio/')) {
    return trimmed;
  }

  // 4. Chấp nhận URL tuyệt đối http:// và https://
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return trimmed;
      }
      warnings.push(
        `Asset '${assetId}' excluded: disallowed protocol '${parsed.protocol}' in storageUrl '${trimmed}'.`,
      );
      return null;
    } catch {
      warnings.push(`Asset '${assetId}' excluded: invalid absolute URL '${trimmed}'.`);
      return null;
    }
  }

  // 5. Kiểm tra scheme khác (RFC 3986)
  const schemeMatch = lower.match(/^[a-z][a-z0-9+.-]*:/);
  if (schemeMatch) {
    warnings.push(
      `Asset '${assetId}' excluded: disallowed URL scheme '${schemeMatch[0]}' in storageUrl '${trimmed}'.`,
    );
    return null;
  }

  // 6. URL tương đối (không có scheme, không bắt đầu bằng //, \, /\)
  if (baseUrl !== undefined && baseUrl.trim().length > 0) {
    try {
      const baseParsed = new URL(baseUrl);
      const resolved = new URL(trimmed, baseParsed);
      if (
        resolved.origin === baseParsed.origin &&
        (resolved.protocol === 'http:' || resolved.protocol === 'https:')
      ) {
        return resolved.href;
      }
      warnings.push(
        `Asset '${assetId}' excluded: resolved URL origin '${resolved.origin}' or protocol '${resolved.protocol}' mismatch with baseUrl '${baseUrl}'.`,
      );
      return null;
    } catch {
      warnings.push(
        `Asset '${assetId}' excluded: unable to resolve relative URL '${trimmed}' against baseUrl '${baseUrl}'.`,
      );
      return null;
    }
  }

  return trimmed;
}

/**
 * Phân tích và kiểm tra tính hợp lệ của PublishedGameBundle từ dữ liệu thô (Zero-Trust).
 * Dựng object mới chỉ từ các key đã biết để ngăn chặn prototype pollution.
 */
export function parseGameBundle(raw: unknown, baseUrl?: string): GameBundleParseResult {
  // 1. Kiểm tra đối tượng
  if (!isRecord(raw)) {
    return { ok: false, error: 'not_object' };
  }

  // 2. Kiểm tra phiên bản định dạng
  if (raw.formatVersion !== PUBLISHED_BUNDLE_FORMAT_VERSION) {
    return { ok: false, error: 'unsupported_version' };
  }

  // 3. Kiểm tra các trường bắt buộc cơ bản (projectId, title)
  const projectId = raw.projectId;
  if (!isNonEmptyString(projectId)) {
    return { ok: false, error: 'invalid_field' };
  }

  const title = raw.title;
  if (!isNonEmptyString(title)) {
    return { ok: false, error: 'invalid_field' };
  }

  // 4. Kiểm tra program (mảng các instruction có type chuỗi)
  const rawProgram = raw.program;
  if (!Array.isArray(rawProgram)) {
    return { ok: false, error: 'invalid_field' };
  }

  for (const item of rawProgram) {
    if (!isRecord(item) || !isNonEmptyString(item.type)) {
      return { ok: false, error: 'invalid_field' };
    }
  }
  // Giữ nguyên object gốc của program
  const program = rawProgram as Instruction[];

  // 5. Kiểm tra assets (mảng các asset có id, name chuỗi và type hợp lệ)
  const rawAssets = raw.assets;
  if (!Array.isArray(rawAssets)) {
    return { ok: false, error: 'invalid_field' };
  }

  const warnings: string[] = [];
  const assets: AssetRef[] = [];

  for (const item of rawAssets) {
    if (!isRecord(item)) {
      return { ok: false, error: 'invalid_field' };
    }

    const id = item.id;
    if (!isNonEmptyString(id)) {
      return { ok: false, error: 'invalid_field' };
    }

    const name = item.name;
    if (!isNonEmptyString(name)) {
      return { ok: false, error: 'invalid_field' };
    }

    const assetType = item.type;
    if (typeof assetType !== 'string' || !VALID_ASSET_TYPES.has(assetType)) {
      return { ok: false, error: 'invalid_field' };
    }

    // Phân loại an toàn storageUrl
    const safeUrl = resolveSafeStorageUrl(item.storageUrl, id, baseUrl, warnings);
    if (safeUrl === null) {
      continue;
    }

    const sizeBytes =
      typeof item.sizeBytes === 'number' && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0
        ? item.sizeBytes
        : 0;

    const safeAsset: AssetRef = {
      id,
      name,
      type: assetType as AssetRef['type'],
      storageUrl: safeUrl,
      sizeBytes,
    };

    if (typeof item.category === 'string') {
      safeAsset.category = item.category as AssetRef['category'];
    }
    if (typeof item.tag === 'string') {
      safeAsset.tag = item.tag;
    }
    if (typeof item.variant === 'string') {
      safeAsset.variant = item.variant;
    }
    if (typeof item.version === 'number' && Number.isFinite(item.version)) {
      safeAsset.version = item.version;
    }

    assets.push(safeAsset);
  }

  // 6. Kiểm tra publishedAt (phải là số hữu hạn)
  const publishedAt = raw.publishedAt;
  if (typeof publishedAt !== 'number' || !Number.isFinite(publishedAt)) {
    return { ok: false, error: 'invalid_field' };
  }

  // Dựng PublishedGameBundle mới chỉ từ key đã biết
  const bundle: PublishedGameBundle = {
    formatVersion: 1,
    projectId,
    title,
    program,
    assets,
    publishedAt,
  };

  // 7. titleSettings: chỉ khi là record, chỉ giữ 3 key string; rỗng sau lọc thì bỏ field
  if (isRecord(raw.titleSettings)) {
    const rawSettings = raw.titleSettings;
    const cleaned: ProjectTitleSettings = {};
    if (typeof rawSettings.backgroundAssetId === 'string') {
      cleaned.backgroundAssetId = rawSettings.backgroundAssetId;
    }
    if (typeof rawSettings.logoAssetId === 'string') {
      cleaned.logoAssetId = rawSettings.logoAssetId;
    }
    if (typeof rawSettings.bgmAssetId === 'string') {
      cleaned.bgmAssetId = rawSettings.bgmAssetId;
    }
    if (Object.keys(cleaned).length > 0) {
      bundle.titleSettings = cleaned;
    }
  }

  // 8. entryScene: chỉ khi là chuỗi không rỗng
  if (isNonEmptyString(raw.entryScene)) {
    bundle.entryScene = raw.entryScene;
  }

  return {
    ok: true,
    bundle,
    warnings,
  };
}
