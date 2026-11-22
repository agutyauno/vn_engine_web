import type { AssetRef, ProjectTitleSettings } from '@vn-engine/shared-types';
import type { TitleScreenConfig } from '../core/contracts';

/**
 * Phân giải cấu hình Title Screen từ project title, titleSettings và danh sách asset đã hydrate.
 * Trả về Partial<TitleScreenConfig> chứa các trường hợp lệ.
 */
export function resolveTitleConfig(
  title?: string,
  titleSettings?: ProjectTitleSettings,
  assets: AssetRef[] = [],
): Partial<TitleScreenConfig> {
  const result: Partial<TitleScreenConfig> = {};

  if (typeof title === 'string') {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 0) {
      result.title = trimmedTitle;
    }
  }

  if (titleSettings && assets && assets.length > 0) {
    const assetMap = new Map<string, AssetRef>();
    for (const asset of assets) {
      assetMap.set(asset.id, asset);
    }

    if (titleSettings.logoAssetId) {
      const asset = assetMap.get(titleSettings.logoAssetId);
      if (asset && asset.type === 'image' && asset.storageUrl.trim().length > 0) {
        result.logoUrl = asset.storageUrl;
      }
    }

    if (titleSettings.backgroundAssetId) {
      const asset = assetMap.get(titleSettings.backgroundAssetId);
      if (asset && asset.type === 'image' && asset.storageUrl.trim().length > 0) {
        result.backgroundUrl = asset.storageUrl;
      }
    }

    if (titleSettings.bgmAssetId) {
      const asset = assetMap.get(titleSettings.bgmAssetId);
      if (asset && asset.type === 'audio' && asset.storageUrl.trim().length > 0) {
        result.bgmTrack = asset.storageUrl;
      }
    }
  }

  return result;
}
