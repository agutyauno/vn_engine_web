// ============================================================================
// ASSET RESOLVER ADAPTER (ADR-020, ADR-025, ADR-028)
// Phân giải tài nguyên đồ họa (Graphic) & âm thanh (Audio) từ Project Data
// Tích hợp cảnh báo lỗi tài nguyên qua DiagnosticBus và chuẩn Unified Sprite Asset
// ============================================================================

import type { DiagnosticBus } from '../services/diagnosticBus';

export interface ProjectDataAsset {
  id: string;
  name?: string;
  tag?: string;
  variant?: string;
  category?: string;
  storageUrl?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ProjectDataCharacter {
  id: string;
  name?: string;
  sprites?: Record<string, string | undefined>;
  defaultExpression?: string;
  [key: string]: unknown;
}

export interface ProjectData {
  id?: string;
  name?: string;
  /** @deprecated Giữ lại trong Phase 1–6 cho backward compatibility */
  characters?: ProjectDataCharacter[];
  assets?: ProjectDataAsset[];
  [key: string]: unknown;
}

export class AssetResolverAdapter {
  private getProjectData: () => ProjectData;
  private diagnosticBus?: DiagnosticBus;
  private warnedAssets = new Set<string>();

  constructor(getProjectData: () => ProjectData, diagnosticBus?: DiagnosticBus) {
    this.getProjectData = getProjectData;
    this.diagnosticBus = diagnosticBus;
  }

  public resetWarnedAssets(): void {
    this.warnedAssets.clear();
  }

  /**
   * Trả về resolver đồ họa phân giải asset key thành URL hình ảnh
   * Hỗ trợ Unified Sprite Asset (tag + variant) và các asset nền / UI
   */
  public getAssetGraphicResolver(): (targetIdOrKey: string, variant?: string) => string | undefined {
    return (targetIdOrKey: string, variant?: string): string | undefined => {
      if (!targetIdOrKey || !targetIdOrKey.trim()) {
        return undefined;
      }

      const trimmedKey = targetIdOrKey.trim();
      const lowerKey = trimmedKey.toLowerCase();
      const data = this.getProjectData();
      const assets = data.assets ?? [];

      // 1. Phân giải tag & variant nếu targetIdOrKey chứa dot (ví dụ: 'alice.happy' khi gọi 1 đối số)
      let resolvedTag = lowerKey;
      let resolvedVariant = variant ? variant.trim().toLowerCase() : undefined;

      if (!resolvedVariant && trimmedKey.includes('.')) {
        const dotIndex = trimmedKey.indexOf('.');
        resolvedTag = trimmedKey.slice(0, dotIndex).trim().toLowerCase();
        resolvedVariant = trimmedKey.slice(dotIndex + 1).trim().toLowerCase();
      }

      // 2. Tìm kiếm trong data.assets
      // 2a. Khớp chính xác cả tag và variant
      if (resolvedVariant) {
        const exactMatch = assets.find(
          a =>
            a.tag?.toLowerCase() === resolvedTag &&
            (a.variant || 'default').toLowerCase() === resolvedVariant,
        );
        if (exactMatch?.storageUrl) {
          return exactMatch.storageUrl;
        }
      }

      // 2b. Nếu không truyền variant hoặc variant không khớp, fallback về variant 'default'
      const defaultVariantMatch = assets.find(
        a =>
          a.tag?.toLowerCase() === resolvedTag &&
          (a.variant || 'default').toLowerCase() === 'default',
      );
      if (defaultVariantMatch?.storageUrl) {
        return defaultVariantMatch.storageUrl;
      }

      // 2c. Fallback bất kỳ asset nào có cùng tag
      const anyTagMatch = assets.find(a => a.tag?.toLowerCase() === resolvedTag);
      if (anyTagMatch?.storageUrl) {
        return anyTagMatch.storageUrl;
      }

      // 2d. Khớp trực tiếp theo id hoặc name (không phân biệt hoa thường)
      const directIdOrName = assets.find(
        a => a.id.toLowerCase() === lowerKey || a.name?.toLowerCase() === lowerKey,
      );
      if (directIdOrName?.storageUrl) {
        return directIdOrName.storageUrl;
      }

      // 2e. Fallback theo tên file bỏ phần mở rộng (basename match)
      const basenameMatch = assets.find(
        a => a.name?.replace(/\.[^/.]+$/, '').toLowerCase() === lowerKey,
      );
      if (basenameMatch?.storageUrl) {
        return basenameMatch.storageUrl;
      }

      // 2f. Hỗ trợ cú pháp gạch dưới cũ 'alice_happy' khi gọi 1 đối số
      if (!variant && trimmedKey.includes('_')) {
        for (const asset of assets) {
          if (asset.tag && asset.variant) {
            const composite = `${asset.tag}_${asset.variant}`.toLowerCase();
            if (composite === lowerKey && asset.storageUrl) {
              return asset.storageUrl;
            }
          }
        }
      }

      // 2g. Hỗ trợ legacy characters table nếu còn tồn tại
      if (data.characters && data.characters.length > 0) {
        const charPart = resolvedTag;
        const exprPart = resolvedVariant || 'default';
        const character = data.characters.find(
          c => c.id.toLowerCase() === charPart || c.name?.toLowerCase() === charPart,
        );
        if (character?.sprites) {
          const val =
            character.sprites[exprPart] ||
            character.sprites['default'] ||
            Object.values(character.sprites)[0];
          if (val) {
            if (
              val.startsWith('http://') ||
              val.startsWith('https://') ||
              val.startsWith('data:') ||
              val.startsWith('blob:') ||
              val.startsWith('/') ||
              val.startsWith('./')
            ) {
              return val;
            }
            const refAsset = assets.find(
              a =>
                a.id.toLowerCase() === val.toLowerCase() ||
                a.name?.toLowerCase() === val.toLowerCase(),
            );
            if (refAsset?.storageUrl) return refAsset.storageUrl;
            return val;
          }
        }
      }

      // 3. Kiểm tra direct URL (http://, https://, data:, blob:, /, ./)
      if (
        trimmedKey.startsWith('http://') ||
        trimmedKey.startsWith('https://') ||
        trimmedKey.startsWith('data:') ||
        trimmedKey.startsWith('blob:') ||
        trimmedKey.startsWith('/') ||
        trimmedKey.startsWith('./')
      ) {
        return trimmedKey;
      }

      // 4. Không tìm thấy -> Báo cáo cảnh báo qua DiagnosticBus
      if (!this.warnedAssets.has(trimmedKey)) {
        this.warnedAssets.add(trimmedKey);
        this.diagnosticBus?.report({
          category: 'asset',
          severity: 'warning',
          code: 'ERR_MISSING_GRAPHIC',
          assetKey: trimmedKey,
          message: `Graphic asset not found: "${trimmedKey}"`,
        });
      }

      return undefined;
    };
  }

  /**
   * Trả về resolver âm thanh phân giải asset key thành URL âm thanh
   */
  public getAssetAudioResolver(): (assetKey: string) => string | undefined {
    return (assetKey: string): string | undefined => {
      if (!assetKey || !assetKey.trim()) {
        return undefined;
      }

      const trimmedKey = assetKey.trim();

      // 1. Giữ nguyên các direct URLs hoặc file paths
      if (
        trimmedKey.startsWith('http://') ||
        trimmedKey.startsWith('https://') ||
        trimmedKey.startsWith('data:audio/') ||
        trimmedKey.startsWith('blob:') ||
        trimmedKey.startsWith('/') ||
        trimmedKey.startsWith('./')
      ) {
        return trimmedKey;
      }

      const lowerKey = trimmedKey.toLowerCase();
      const data = this.getProjectData();

      // 2. Tìm trong danh sách assets theo ID hoặc Name
      const asset = data.assets?.find(
        a => a.id.toLowerCase() === lowerKey || a.name?.toLowerCase() === lowerKey,
      );
      if (asset?.storageUrl) {
        return asset.storageUrl;
      }

      // 3. Không tìm thấy -> Báo cáo cảnh báo qua DiagnosticBus
      if (!this.warnedAssets.has(assetKey)) {
        this.warnedAssets.add(assetKey);
        this.diagnosticBus?.report({
          category: 'asset',
          severity: 'warning',
          code: 'ERR_MISSING_AUDIO',
          assetKey,
          message: `Audio asset not found: "${assetKey}"`,
        });
      }

      return undefined;
    };
  }

  /**
   * Trả về resolver phân giải asset key thành định dạng âm thanh (format string, ví dụ: 'mp3', 'wav', 'ogg')
   * Ưu tiên trích xuất từ metadata asset (asset.name), sau đó là asset.id hoặc trực tiếp từ key (TASK-audio-format-resolution)
   */
  public getAssetAudioFormatResolver(): (assetKey: string) => string | undefined {
    return (assetKey: string): string | undefined => {
      if (!assetKey || !assetKey.trim()) {
        return undefined;
      }

      const trimmedKey = assetKey.trim();
      const lowerKey = trimmedKey.toLowerCase();
      const data = this.getProjectData();

      // 1. Tìm asset trong danh sách assets theo ID hoặc Name
      const asset = data.assets?.find(
        a => a.id.toLowerCase() === lowerKey || a.name?.toLowerCase() === lowerKey,
      );

      // 2. Ưu tiên trích xuất từ asset.name nếu có đuôi mở rộng file
      if (asset?.name) {
        const match = /\.([a-zA-Z0-9]+)$/.exec(asset.name.trim());
        if (match && match[1]) {
          return match[1].toLowerCase();
        }
      }

      // 3. Fallback trích xuất từ asset.id
      if (asset?.id) {
        const match = /\.([a-zA-Z0-9]+)$/.exec(asset.id.trim());
        if (match && match[1]) {
          return match[1].toLowerCase();
        }
      }

      // 4. Fallback trích xuất trực tiếp từ assetKey
      const keyMatch = /\.([a-zA-Z0-9]+)$/.exec(trimmedKey);
      if (keyMatch && keyMatch[1]) {
        return keyMatch[1].toLowerCase();
      }

      return undefined;
    };
  }
}
