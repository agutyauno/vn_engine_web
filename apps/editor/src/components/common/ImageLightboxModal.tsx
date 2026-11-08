import React, { useEffect } from 'react';
import { CloseIcon } from './Icons';

export interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  title?: string;
  subtitle?: string;
  zIndexClass?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  title,
  subtitle,
  zIndexClass = 'z-50',
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, imageUrl, onClose]);

  if (!isOpen || !imageUrl) {
    return null;
  }

  return (
    <div
      data-testid="modal-image-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 select-none`}
    >
      <div
        data-testid="lightbox-content"
        onClick={e => e.stopPropagation()}
        className="relative flex flex-col items-center max-w-4xl max-h-[90vh] rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex w-full items-center justify-between px-3 py-2 border-b border-neutral-800 text-xs text-neutral-300 shrink-0">
          <div className="flex flex-col min-w-0 mr-4">
            {title && (
              <span data-testid="lightbox-title" className="font-medium truncate text-neutral-200">
                {title}
              </span>
            )}
            {subtitle && (
              <span data-testid="lightbox-subtitle" className="text-[10px] text-neutral-500 font-mono">
                {subtitle}
              </span>
            )}
          </div>
          <button
            type="button"
            data-testid="btn-close-lightbox"
            aria-label="Close image preview"
            title="Close image preview"
            draggable={false}
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition shrink-0"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Image Preview */}
        <div className="flex items-center justify-center p-4 max-h-[80vh] overflow-auto">
          <img
            src={imageUrl}
            alt={title || 'Image preview'}
            data-testid="lightbox-image"
            className="max-h-[75vh] max-w-full object-contain rounded"
          />
        </div>
      </div>
    </div>
  );
};

