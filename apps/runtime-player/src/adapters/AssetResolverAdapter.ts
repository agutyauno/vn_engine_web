// ============================================================================
// ASSET RESOLVER ADAPTER (ADR-020, ADR-025)
// Phân giải tài nguyên đồ họa (Graphic) & âm thanh (Audio) từ Project Data
// Tích hợp cảnh báo lỗi tài nguyên qua DiagnosticBus và phân biệt Character vs Prop
// ============================================================================

import type { DiagnosticBus } from '../services/diagnosticBus';

export interface ProjectDataAsset {
  id: string;
  name?: string;
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
   * Phân biệt nhân vật (character) với đạo cụ (prop/item)
   * - false: nếu nằm trong danh sách characters
   * - true: nếu nằm trong danh sách assets (không phải character)
   * - false: nếu không tìm thấy ở cả hai
   */
  public checkIsProp(characterId: string): boolean {
    if (!characterId || !characterId.trim()) {
      return false;
    }
    const data = this.getProjectData();
    const lower = characterId.trim().toLowerCase();

    const isChar = data.characters?.some(
      c => c.id.toLowerCase() === lower || c.name?.toLowerCase() === lower,
    );
    if (isChar) {
      return false;
    }

    const isAsset = data.assets?.some(
      a => a.id.toLowerCase() === lower || a.name?.toLowerCase() === lower,
    );
    if (isAsset) {
      return true;
    }

    return false;
  }

  /**
   * Trả về resolver đồ họa phân giải asset key thành URL hình ảnh
   */
  public getAssetGraphicResolver(): (assetKey: string) => string | undefined {
    return (assetKey: string): string | undefined => {
      if (!assetKey || !assetKey.trim()) {
        return undefined;
      }

      const trimmedKey = assetKey.trim();
      const lowerKey = trimmedKey.toLowerCase();
      const data = this.getProjectData();

      // 1. Tìm trực tiếp trong danh sách assets theo ID hoặc Name (không phân biệt hoa thường)
      const directAsset = data.assets?.find(
        a => a.id.toLowerCase() === lowerKey || a.name?.toLowerCase() === lowerKey,
      );
      if (directAsset?.storageUrl) {
        return directAsset.storageUrl;
      }

      // Hàm nội bộ phân giải giá trị sprite (nếu trỏ tới asset ID khác hoặc là URL trực tiếp)
      const resolveSpriteValue = (val: string): string => {
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
        const refAsset = data.assets?.find(
          a =>
            a.id.toLowerCase() === val.toLowerCase() || a.name?.toLowerCase() === val.toLowerCase(),
        );
        if (refAsset?.storageUrl) {
          return refAsset.storageUrl;
        }
        return val;
      };

      // Helper tìm sprite key trong sprites map (hỗ trợ case-insensitive)
      const getSpriteFromMap = (
        sprites: Record<string, string | undefined> | undefined,
        expr: string,
      ): string | undefined => {
        if (!sprites) return undefined;
        if (sprites[expr]) return sprites[expr];
        const lowerExpr = expr.toLowerCase();
        for (const [k, v] of Object.entries(sprites)) {
          if (k.toLowerCase() === lowerExpr && typeof v === 'string') {
            return v;
          }
        }
        return undefined;
      };

      // Helper lấy sprite fallback ('default' hoặc sprite đầu tiên)
      const getFallbackSprite = (
        sprites: Record<string, string | undefined> | undefined,
      ): string | undefined => {
        if (!sprites) return undefined;
        const def = getSpriteFromMap(sprites, 'default');
        if (def) return def;
        const vals = Object.values(sprites).filter((v): v is string => typeof v === 'string');
        return vals.length > 0 ? vals[0] : undefined;
      };

      // 2. Phân tích cú pháp dot notation ("alice.happy")
      if (trimmedKey.includes('.')) {
        const dotIndex = trimmedKey.indexOf('.');
        const charPart = trimmedKey.slice(0, dotIndex).toLowerCase();
        const exprPart = trimmedKey.slice(dotIndex + 1);

        const character = data.characters?.find(
          c => c.id.toLowerCase() === charPart || c.name?.toLowerCase() === charPart,
        );

        if (character) {
          const spriteVal =
            getSpriteFromMap(character.sprites, exprPart) ?? getFallbackSprite(character.sprites);
          if (spriteVal) {
            return resolveSpriteValue(spriteVal);
          }
        }
      }

      // 3. Phân tích cú pháp underscore notation ("alice_happy")
      if (trimmedKey.includes('_')) {
        if (data.characters) {
          for (const character of data.characters) {
            const charIdLower = character.id.toLowerCase();
            const charNameLower = character.name?.toLowerCase();

            let expr: string | null = null;
            if (lowerKey.startsWith(charIdLower + '_')) {
              expr = trimmedKey.slice(charIdLower.length + 1);
            } else if (charNameLower && lowerKey.startsWith(charNameLower + '_')) {
              expr = trimmedKey.slice(charNameLower.length + 1);
            }

            if (expr !== null) {
              const spriteVal =
                getSpriteFromMap(character.sprites, expr) ?? getFallbackSprite(character.sprites);
              if (spriteVal) {
                return resolveSpriteValue(spriteVal);
              }
            }
          }
        }
      }

      // 4. Tìm kiếm tên nhân vật trần (fallback về 'default' hoặc sprite đầu tiên)
      const plainChar = data.characters?.find(
        c => c.id.toLowerCase() === lowerKey || c.name?.toLowerCase() === lowerKey,
      );
      if (plainChar) {
        const spriteVal = getFallbackSprite(plainChar.sprites);
        if (spriteVal) {
          return resolveSpriteValue(spriteVal);
        }
      }

      // 5. Không tìm thấy tài nguyên -> Báo cáo cảnh báo qua DiagnosticBus
      if (!this.warnedAssets.has(assetKey)) {
        this.warnedAssets.add(assetKey);
        this.diagnosticBus?.report({
          category: 'asset',
          severity: 'warning',
          code: 'ERR_MISSING_GRAPHIC',
          assetKey,
          message: `Graphic asset not found: "${assetKey}"`,
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
}
