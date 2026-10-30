import type { AssetCategory } from '@vn-engine/shared-types';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] as const;

export const ALLOWED_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/svg+xml',
];

export const ALLOWED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
];

export interface AssetFileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: 'image' | 'audio';
  suggestedCategory?: AssetCategory;
  suggestedId?: string;
  fileExtension?: string;
}

export function slugifyAssetId(fileName: string): string {
  const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  let slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!slug) {
    slug = 'asset';
  }

  if (/^[0-9]/.test(slug)) {
    slug = '_' + slug;
  }

  return slug;
}

export function validateAssetFile(file: File, activeTab?: string): AssetFileValidationResult {
  const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : '';

  const isImageExt = (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
  const isAudioExt = (AUDIO_EXTENSIONS as readonly string[]).includes(ext);

  const isImageMime = file.type ? ALLOWED_IMAGE_MIME.includes(file.type) : false;
  const isAudioMime = file.type ? ALLOWED_AUDIO_MIME.includes(file.type) : false;

  const isImage = isImageExt || isImageMime;
  const isAudio = isAudioExt || isAudioMime;

  if (isImage) {
    const slug = slugifyAssetId(file.name);
    let suggestedCategory: AssetCategory = 'background';
    if (activeTab === 'sprites' || slug.startsWith('sprite_') || slug.startsWith('char_')) {
      suggestedCategory = 'sprite';
    } else if (activeTab === 'ui' || slug.startsWith('ui_') || slug.startsWith('icon_')) {
      suggestedCategory = 'ui';
    }

    return {
      valid: true,
      detectedType: 'image',
      suggestedCategory,
      suggestedId: slug,
      fileExtension: ext,
    };
  }

  if (isAudio) {
    const slug = slugifyAssetId(file.name);
    let suggestedCategory: AssetCategory = 'bgm';
    if (slug.startsWith('sfx_') || slug.startsWith('sound_')) {
      suggestedCategory = 'sfx';
    } else if (slug.startsWith('voice_')) {
      suggestedCategory = 'voice';
    }

    return {
      valid: true,
      detectedType: 'audio',
      suggestedCategory,
      suggestedId: slug,
      fileExtension: ext,
    };
  }

  return {
    valid: false,
    error: `Định dạng tệp "${ext || file.type || 'unknown'}" không được hỗ trợ. Vui lòng chọn tệp ảnh hoặc âm thanh hợp lệ.`,
  };
}
