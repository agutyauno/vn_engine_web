// ================================================================
// VN RUNTIME PLAYER - ASSET RESOLVER CONTROLLER
// Ánh xạ asset id/key sang URL hình ảnh, URL âm thanh và phân biệt đạo cụ (props)
// ================================================================

import type { ProjectData } from '../playerContext';
import type { DiagnosticBus } from '../services/diagnosticBus';

export class AssetResolver {
  private getProjectData: () => ProjectData;
  private diagnosticBus?: DiagnosticBus;

  private warnedMissingAssets: Set<string> = new Set();

  constructor(getProjectData: () => ProjectData, diagnosticBus?: DiagnosticBus) {
    this.getProjectData = getProjectData;
    this.diagnosticBus = diagnosticBus;
  }

  public resetWarnedAssets(): void {
    this.warnedMissingAssets.clear();
  }

  public checkIsProp(characterId: string): boolean {
    const projectData = this.getProjectData();
    const isChar = projectData.characters?.some(
      c => c.id.toLowerCase() === characterId.toLowerCase(),
    );
    if (isChar) return false;
    return Boolean(
      projectData.assets?.some(
        a =>
          a.name.toLowerCase() === characterId.toLowerCase() ||
          a.id.toLowerCase() === characterId.toLowerCase(),
      ),
    );
  }

  public getAssetGraphicResolver(): (assetKey: string) => string | undefined {
    return (assetKey: string) => {
      const projectData = this.getProjectData();
      const foundAsset = projectData.assets?.find(
        a =>
          a.name.toLowerCase() === assetKey.toLowerCase() ||
          a.id.toLowerCase() === assetKey.toLowerCase(),
      );
      if (foundAsset?.storageUrl) return foundAsset.storageUrl;

      // Hỗ trợ cả dấu chấm . và dấu gạch dưới _ (VD: alice.happy hoặc alice_happy)
      let charId: string | null = null;
      let spriteId: string | null = null;

      const dotIdx = assetKey.indexOf('.');
      if (dotIdx !== -1) {
        charId = assetKey.slice(0, dotIdx);
        spriteId = assetKey.slice(dotIdx + 1);
      } else {
        const underscoreIdx = assetKey.indexOf('_');
        if (underscoreIdx !== -1) {
          const candidateChar = assetKey.slice(0, underscoreIdx);
          const isChar = projectData.characters?.some(
            c => c.id.toLowerCase() === candidateChar.toLowerCase(),
          );
          if (isChar) {
            charId = candidateChar;
            spriteId = assetKey.slice(underscoreIdx + 1);
          }
        }
      }

      if (charId && spriteId) {
        const charDef = projectData.characters?.find(
          c => c.id.toLowerCase() === charId!.toLowerCase(),
        );
        if (charDef?.sprites) {
          const spriteImg =
            charDef.sprites[spriteId] ||
            charDef.sprites['default'] ||
            Object.values(charDef.sprites)[0];
          if (spriteImg) {
            if (
              spriteImg.startsWith('data:') ||
              spriteImg.startsWith('http') ||
              spriteImg.startsWith('/') ||
              spriteImg.startsWith('.')
            ) {
              return spriteImg;
            }
            const refAsset = projectData.assets?.find(
              a => a.name === spriteImg || a.id === spriteImg,
            );
            if (refAsset?.storageUrl) return refAsset.storageUrl;
          }
        }
      } else {
        const charDef = projectData.characters?.find(
          c => c.id.toLowerCase() === assetKey.toLowerCase(),
        );
        if (charDef?.sprites) {
          const spriteImg = charDef.sprites['default'] || Object.values(charDef.sprites)[0];
          if (spriteImg) {
            if (
              spriteImg.startsWith('data:') ||
              spriteImg.startsWith('http') ||
              spriteImg.startsWith('/') ||
              spriteImg.startsWith('.')
            ) {
              return spriteImg;
            }
            const refAsset = projectData.assets?.find(
              a => a.name === spriteImg || a.id === spriteImg,
            );
            if (refAsset?.storageUrl) return refAsset.storageUrl;
          }
        }
      }

      if (assetKey && assetKey.trim().length > 0) {
        if (this.diagnosticBus) {
          this.diagnosticBus.report({
            category: 'asset',
            severity: 'warning',
            message: `Missing graphic asset: "${assetKey}". Check spelling in script or upload it in Assets tab.`,
            code: 'ERR_MISSING_GRAPHIC',
            assetKey,
          });
        } else if (!this.warnedMissingAssets.has(assetKey)) {
          this.warnedMissingAssets.add(assetKey);
          console.warn(
            `[Assets] Missing graphic asset: "${assetKey}". Check spelling in script or upload it in Assets tab.`,
          );
        }
      }

      return undefined;
    };
  }

  public getAssetAudioResolver(): (assetKey: string) => string | undefined {
    return (assetKey: string) => {
      const projectData = this.getProjectData();
      const found = projectData.assets?.find(
        a =>
          a.name.toLowerCase() === assetKey.toLowerCase() ||
          a.id.toLowerCase() === assetKey.toLowerCase(),
      );
      if (found?.storageUrl) {
        return found.storageUrl;
      }

      // Hỗ trợ nếu assetKey tự nó là một URL hoặc đường dẫn file âm thanh hợp lệ
      if (
        assetKey &&
        (assetKey.startsWith('http://') ||
          assetKey.startsWith('https://') ||
          assetKey.startsWith('data:audio/') ||
          assetKey.startsWith('blob:') ||
          assetKey.startsWith('/') ||
          assetKey.startsWith('./') ||
          /\.(mp3|ogg|wav|m4a|aac|flac|webm)(\?.*)?$/i.test(assetKey))
      ) {
        return assetKey;
      }

      if (!found && assetKey && assetKey.trim().length > 0) {
        if (this.diagnosticBus) {
          this.diagnosticBus.report({
            category: 'asset',
            severity: 'warning',
            message: `Missing audio asset: "${assetKey}". Check Assets tab or script syntax.`,
            code: 'ERR_MISSING_AUDIO',
            assetKey,
          });
        } else if (!this.warnedMissingAssets.has(assetKey)) {
          this.warnedMissingAssets.add(assetKey);
          console.warn(
            `[Assets] Missing audio asset: "${assetKey}". Check Assets tab or script syntax.`,
          );
        }
      }
      return undefined;
    };
  }
}
