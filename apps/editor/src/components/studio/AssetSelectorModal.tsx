import React, { useState, useEffect } from 'react';
import type { AssetRef } from '@vn-engine/shared-types';
import { CloseIcon, SearchIcon, MusicIcon } from '../common/Icons';

export interface AssetSelectorModalProps {
  isOpen: boolean;
  assets: AssetRef[];
  accept: 'image' | 'audio';
  title: string;
  selectedId?: string;
  onSelect: (asset: AssetRef) => void;
  onClose: () => void;
}

const formatSizeKb = (sizeBytes: number): string => {
  if (!sizeBytes || sizeBytes <= 0) return '0 KB';
  const kb = sizeBytes / 1024;
  return `${Number(kb.toFixed(1))} KB`;
};

export const AssetSelectorModal: React.FC<AssetSelectorModalProps> = ({
  isOpen,
  assets,
  accept,
  title,
  selectedId,
  onSelect,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredAssets = assets.filter(asset => {
    if (asset.type !== accept) return false;
    if (!trimmedQuery) return true;
    return asset.name.toLowerCase().includes(trimmedQuery);
  });

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      data-testid="asset-selector-modal"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-selector-title"
        onClick={e => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2
            id="asset-selector-title"
            className="font-semibold text-sm tracking-wide text-neutral-200"
          >
            {title}
          </h2>
          <button
            type="button"
            data-testid="asset-selector-close"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-neutral-800 px-5 py-3">
          <div className="relative flex items-center">
            <SearchIcon
              size={16}
              className="absolute left-3 text-neutral-500 pointer-events-none"
            />
            <input
              type="text"
              autoFocus
              data-testid="asset-selector-search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search assets by name..."
              className="w-full rounded border border-neutral-800 bg-neutral-950 pl-9 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:border-neutral-700 focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div role="listbox" className="max-h-80 overflow-y-auto p-3 space-y-1">
          {filteredAssets.length === 0 ? (
            <div
              data-testid="asset-selector-empty"
              className="flex items-center justify-center py-8 text-center text-xs text-neutral-500"
            >
              No matching assets
            </div>
          ) : (
            filteredAssets.map(asset => {
              const isSelected = asset.id === selectedId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  role="option"
                  data-testid={`asset-option-${asset.id}`}
                  aria-selected={isSelected ? 'true' : 'false'}
                  onClick={() => onSelect(asset)}
                  className={`flex w-full items-center gap-3 rounded p-2 text-left text-xs transition ${
                    isSelected
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white'
                  }`}
                >
                  {asset.type === 'image' ? (
                    <>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-950 flex items-center justify-center">
                        <img
                          src={asset.storageUrl}
                          alt={asset.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-neutral-200">{asset.name}</span>
                        <span className="text-[11px] text-neutral-500">
                          {formatSizeKb(asset.sizeBytes)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-8 w-8 shrink-0 rounded border border-neutral-700 bg-neutral-950 flex items-center justify-center text-neutral-400">
                        <MusicIcon size={16} />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate font-medium text-neutral-200">{asset.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                          {formatSizeKb(asset.sizeBytes)}
                        </span>
                      </div>
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
