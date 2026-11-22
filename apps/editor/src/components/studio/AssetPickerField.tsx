import React, { useState } from 'react';
import type { AssetRef } from '@vn-engine/shared-types';
import { AssetSelectorModal } from './AssetSelectorModal';
import { CloseIcon } from '../common/Icons';

export interface AssetPickerFieldProps {
  label: string;
  accept: 'image' | 'audio';
  assets: AssetRef[];
  value?: string;
  onChange: (assetId: string | undefined) => void;
}

export const AssetPickerField: React.FC<AssetPickerFieldProps> = ({
  label,
  accept,
  assets,
  value,
  onChange,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const selectedAsset = value ? assets.find(a => a.id === value) : undefined;
  const isMissing = value !== undefined && !selectedAsset;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-neutral-300">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 min-w-0 rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-300">
          {value === undefined ? (
            <span className="text-neutral-500">None</span>
          ) : isMissing ? (
            <span className="text-amber-400">Missing asset</span>
          ) : selectedAsset ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {selectedAsset.type === 'image' && (
                <img
                  src={selectedAsset.storageUrl}
                  alt={selectedAsset.name}
                  className="h-6 w-6 rounded object-cover border border-neutral-700 shrink-0"
                />
              )}
              <span className="truncate text-neutral-200">{selectedAsset.name}</span>
            </div>
          ) : null}
        </div>

        {value !== undefined && (
          <button
            type="button"
            data-testid="asset-picker-clear"
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
            onClick={() => onChange(undefined)}
            className="rounded border border-neutral-700 bg-neutral-800 p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-white transition shrink-0"
          >
            <CloseIcon size={14} />
          </button>
        )}

        <button
          type="button"
          data-testid="asset-picker-select"
          onClick={() => setIsModalOpen(true)}
          className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition shrink-0"
        >
          Select
        </button>
      </div>

      <AssetSelectorModal
        isOpen={isModalOpen}
        assets={assets}
        accept={accept}
        title={`Select ${label}`}
        selectedId={value}
        onSelect={asset => {
          onChange(asset.id);
          setIsModalOpen(false);
        }}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
