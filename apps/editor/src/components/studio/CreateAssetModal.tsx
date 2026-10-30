import React, { useState, useEffect, useRef } from 'react';
import type { AssetRef, AssetCategory } from '@vn-engine/shared-types';
import { validateAssetFile, slugifyAssetId } from '../../core/utils/assetValidation';
import { CloseIcon, ImageIcon } from '../common/Icons';

export interface CreateAssetModalProps {
  isOpen: boolean;
  initialFile: File | null;
  initialCategory?: AssetCategory;
  existingAssetIds: string[];
  onClose: () => void;
  onSave: (asset: AssetRef, fileBlob: Blob) => void;
}

const CATEGORY_OPTIONS: { value: AssetCategory; label: string }[] = [
  { value: 'background', label: 'Hình nền (Background)' },
  { value: 'sprite', label: 'Nhân vật (Sprite)' },
  { value: 'bgm', label: 'Nhạc nền (BGM)' },
  { value: 'sfx', label: 'Hiệu ứng âm thanh (SFX)' },
  { value: 'voice', label: 'Lồng tiếng (Voice)' },
  { value: 'ui', label: 'Giao diện (UI)' },
  { value: 'other', label: 'Khác (Other)' },
];

const VNS_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const CreateAssetModal: React.FC<CreateAssetModalProps> = ({
  isOpen,
  initialFile,
  initialCategory,
  existingAssetIds,
  onClose,
  onSave,
}) => {
  const [currentFile, setCurrentFile] = useState<File | null>(initialFile);
  const [assetId, setAssetId] = useState<string>('');
  const [assetName, setAssetName] = useState<string>('');
  const [category, setCategory] = useState<AssetCategory>(initialCategory || 'background');
  const [detectedType, setDetectedType] = useState<'image' | 'audio'>('image');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentFile(initialFile);
  }, [initialFile]);

  useEffect(() => {
    if (!currentFile) {
      setAssetId('');
      setAssetName('');
      setPreviewUrl('');
      setValidationError(null);
      return;
    }

    const validation = validateAssetFile(currentFile, initialCategory);
    if (!validation.valid) {
      setValidationError(validation.error || 'Tệp không hợp lệ');
      return;
    }

    setValidationError(null);
    setAssetId(validation.suggestedId || slugifyAssetId(currentFile.name));
    setAssetName(currentFile.name);
    setCategory(initialCategory || validation.suggestedCategory || 'background');
    setDetectedType(validation.detectedType || 'image');

    const objectUrl =
      typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(currentFile)
        : 'blob:mock-asset-url';

    setPreviewUrl(objectUrl);

    return () => {
      if (typeof URL.revokeObjectURL === 'function' && objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [currentFile, initialCategory]);

  if (!isOpen) return null;

  const isDuplicate = existingAssetIds.includes(assetId.trim());
  const isValidIdentifier = VNS_IDENTIFIER_REGEX.test(assetId.trim());
  const canSave =
    Boolean(currentFile) &&
    !validationError &&
    Boolean(assetId.trim()) &&
    isValidIdentifier &&
    !isDuplicate;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentFile(file);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !currentFile) return;

    const newAsset: AssetRef = {
      id: assetId.trim(),
      name: assetName.trim() || currentFile.name,
      type: detectedType,
      category,
      storageUrl: previewUrl,
      sizeBytes: currentFile.size,
    };

    onSave(newAsset, currentFile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-xl rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-100">Thêm Tài Nguyên Mới</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 transition-colors p-1 rounded-md"
            aria-label="Đóng"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* File Picker / Replacement */}
          <div className="flex items-center justify-between text-xs text-neutral-400 border border-neutral-800 rounded-md p-3 bg-neutral-950">
            <span className="truncate max-w-xs">{currentFile?.name || 'Chưa chọn tệp'}</span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
            >
              Đổi file
            </button>
          </div>

          {validationError && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 p-2.5 rounded">
              {validationError}
            </div>
          )}

          {/* Preview Container */}
          <div
            data-testid="asset-preview-container"
            className="relative flex items-center justify-center min-h-[160px] max-h-64 rounded-md border border-neutral-800 bg-neutral-950 checkerboard overflow-hidden p-2"
          >
            {detectedType === 'image' && previewUrl ? (
              <img
                data-testid="asset-preview-image"
                src={previewUrl}
                alt={assetName || 'Preview'}
                onClick={() => setIsZoomed(true)}
                className="max-h-56 max-w-full object-contain cursor-zoom-in transition-transform hover:scale-[1.02]"
              />
            ) : detectedType === 'audio' && previewUrl ? (
              <div className="w-full px-4 py-2 flex flex-col items-center gap-2">
                <audio
                  data-testid="asset-preview-audio"
                  controls
                  src={previewUrl}
                  className="w-full"
                />
              </div>
            ) : (
              <span className="text-xs text-neutral-500">Không có bản xem trước</span>
            )}
          </div>

          {/* Asset ID */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Asset ID (định danh script) <span className="text-red-400">*</span>
            </label>
            <input
              data-testid="input-asset-id"
              type="text"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              placeholder="e.g. bg_classroom, bgm_theme"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-neutral-500"
            />
            {isDuplicate && (
              <p
                data-testid="asset-id-duplicate-error"
                className="mt-1 text-xs text-red-400"
              >
                Asset ID này đã tồn tại trong dự án.
              </p>
            )}
            {!isValidIdentifier && assetId.trim().length > 0 && !isDuplicate && (
              <p className="mt-1 text-xs text-amber-400">
                Asset ID phải bắt đầu bằng chữ cái hoặc dấu gạch dưới, chỉ chứa chữ cái, số và dấu gạch dưới.
              </p>
            )}
          </div>

          {/* Asset Name */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Tên hiển thị (Asset Name)
            </label>
            <input
              data-testid="input-asset-name"
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="Tên hiển thị hoặc tên tệp"
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-neutral-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Phân loại (Category)
            </label>
            <select
              data-testid="select-asset-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-md text-neutral-100 focus:outline-hidden focus:border-neutral-500"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Hủy
            </button>
            <button
              data-testid="btn-save-asset"
              type="submit"
              disabled={!canSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-neutral-100 text-neutral-900 rounded-md hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Lưu tài nguyên
            </button>
          </div>
        </form>
      </div>

      {/* Lightbox Overlay */}
      {isZoomed && previewUrl && (
        <div
          data-testid="asset-lightbox-overlay"
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 cursor-zoom-out"
        >
          <div
            className="relative max-w-full max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewUrl}
              alt={assetName}
              className="max-h-[85vh] max-w-[85vw] object-contain rounded shadow-2xl"
            />
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute -top-3 -right-3 p-1.5 bg-neutral-800 text-neutral-200 rounded-full hover:bg-neutral-700 transition-colors shadow-lg"
              aria-label="Đóng phóng to"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
