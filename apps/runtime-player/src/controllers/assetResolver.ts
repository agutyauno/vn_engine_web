// ================================================================
// VN RUNTIME PLAYER - ASSET RESOLVER CONTROLLER
// Ánh xạ asset id/key sang URL hình ảnh, URL âm thanh và phân biệt đạo cụ (props)
// ================================================================

import type { ProjectData } from '../playerContext';

export class AssetResolver {
  private getProjectData: () => ProjectData;

  private warnedMissingAssets: Set<string> = new Set();

  constructor(getProjectData: () => ProjectData) {
    this.getProjectData = getProjectData;
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

      if (assetKey && assetKey.trim().length > 0 && !this.warnedMissingAssets.has(assetKey)) {
        this.warnedMissingAssets.add(assetKey);
        console.warn(
          `[Assets] Missing graphic asset: "${assetKey}". Check spelling in script or upload it in Assets tab.`,
        );
      }

      return undefined;
    };
  }

  public getAssetAudioResolver(): (assetKey: string) => string {
    return (assetKey: string) => {
      const projectData = this.getProjectData();
      const found = projectData.assets?.find(
        a =>
          a.name.toLowerCase() === assetKey.toLowerCase() ||
          a.id.toLowerCase() === assetKey.toLowerCase(),
      );
      if (!found && assetKey && assetKey.trim().length > 0 && !this.warnedMissingAssets.has(assetKey)) {
        this.warnedMissingAssets.add(assetKey);
        console.warn(
          `[Assets] Missing audio asset: "${assetKey}". Check Assets tab or script syntax.`,
        );
      }
      return found?.storageUrl || assetKey;
    };
  }
}
