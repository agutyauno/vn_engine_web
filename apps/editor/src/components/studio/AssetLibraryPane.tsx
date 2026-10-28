import React, { useState, useRef } from 'react';
import type { AssetRef, Project } from '@vn-engine/shared-types';
import {
  FolderIcon,
  ImageIcon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  EditIcon,
  AlertTriangleIcon,
} from '../common/Icons';
import { SafeDeleteModal } from './SafeDeleteModal';

export interface AssetLibraryPaneProps {
  project: Project;
  quickFixAssetName?: string;
  onAddAsset?: (asset: AssetRef, fileBlob: Blob) => void;
  onReplaceAsset?: (assetId: string, newBlob: Blob, newFileName?: string) => void;
  onDeleteAsset?: (assetId: string) => void;
}

type AssetCategory = 'backgrounds' | 'audio' | 'sprites';

export const AssetLibraryPane: React.FC<AssetLibraryPaneProps> = ({
  project,
  quickFixAssetName,
  onAddAsset,
  onReplaceAsset,
  onDeleteAsset,
}) => {
  const [activeTab, setActiveTab] = useState<AssetCategory>('backgrounds');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetForDelete, setSelectedAssetForDelete] = useState<AssetRef | null>(null);
  const [targetReplaceAssetId, setTargetReplaceAssetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Filter assets based on active category and search
  const filteredAssets = (project.assets || []).filter((asset) => {
    let matchesCategory = false;
    if (activeTab === 'backgrounds') {
      matchesCategory = asset.type === 'image' && !asset.name.startsWith('char_');
    } else if (activeTab === 'audio') {
      matchesCategory = asset.type === 'audio';
    } else if (activeTab === 'sprites') {
      matchesCategory = asset.type === 'image' && asset.name.startsWith('char_');
    }

    if (!matchesCategory) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return asset.name.toLowerCase().includes(q) || asset.id.toLowerCase().includes(q);
    }

    return true;
  });

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let assetType: 'image' | 'audio' = 'image';
    if (file.type.startsWith('audio/')) {
      assetType = 'audio';
    }

    const newAsset: AssetRef = {
      id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      type: assetType,
      storageUrl: URL.createObjectURL(file),
      sizeBytes: file.size,
      version: 1,
    };

    onAddAsset?.(newAsset, file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReplaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetReplaceAssetId) return;

    onReplaceAsset?.(targetReplaceAssetId, file, file.name);
    setTargetReplaceAssetId(null);

    if (replaceFileInputRef.current) {
      replaceFileInputRef.current.value = '';
    }
  };

  const triggerReplace = (assetId: string) => {
    setTargetReplaceAssetId(assetId);
    replaceFileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full flex-col bg-neutral-900 border-r border-neutral-800 text-neutral-200 select-none">
      <input
        ref={fileInputRef}
        type="file"
        data-testid="asset-file-input"
        className="hidden"
        onChange={handleUploadFileChange}
      />
      <input
        ref={replaceFileInputRef}
        type="file"
        data-testid="asset-replace-file-input"
        className="hidden"
        onChange={handleReplaceFileChange}
      />

      {/* Pane Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderIcon size={16} className="text-neutral-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Asset Library
          </span>
        </div>
        <button
          type="button"
          data-testid="btn-add-asset"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 rounded bg-neutral-800 hover:bg-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:text-white transition"
          title="Upload new asset"
        >
          <PlusIcon size={14} />
          <span>Upload</span>
        </button>
      </div>

      {/* IT-EDT-02: Quick Fix Pending Notification */}
      {quickFixAssetName && (
        <div
          data-testid="quickfix-pending-badge"
          className="mx-3 mt-3 flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300"
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <AlertTriangleIcon size={14} className="shrink-0 text-amber-400" />
            <span className="truncate">Uncreated: {quickFixAssetName}</span>
          </div>
          <button
            type="button"
            data-testid="btn-quickfix-create-asset"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/30 transition"
          >
            Create
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 px-2 pt-2">
        <button
          type="button"
          data-testid="tab-asset-backgrounds"
          onClick={() => setActiveTab('backgrounds')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition ${
            activeTab === 'backgrounds'
              ? 'border-white text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <ImageIcon size={13} />
          <span>Backgrounds</span>
        </button>
        <button
          type="button"
          data-testid="tab-asset-audio"
          onClick={() => setActiveTab('audio')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition ${
            activeTab === 'audio'
              ? 'border-white text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <MusicIcon size={13} />
          <span>Audio</span>
        </button>
        <button
          type="button"
          data-testid="tab-asset-sprites"
          onClick={() => setActiveTab('sprites')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 transition ${
            activeTab === 'sprites'
              ? 'border-white text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <FolderIcon size={13} />
          <span>Sprites</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3">
        <div className="relative">
          <SearchIcon size={13} className="absolute left-2.5 top-2.5 text-neutral-500" />
          <input
            type="text"
            data-testid="input-asset-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full rounded border border-neutral-800 bg-neutral-950 pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:border-neutral-700 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Asset List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-500">
            <span>No assets found</span>
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <div
              key={asset.id}
              data-testid={`asset-item-${asset.id}`}
              className="group flex items-center justify-between rounded border border-neutral-800/80 bg-neutral-950/40 p-2 hover:border-neutral-700 hover:bg-neutral-800/40 transition"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-900 border border-neutral-800 text-neutral-400 overflow-hidden">
                  {asset.type === 'image' ? (
                    asset.storageUrl ? (
                      <img
                        src={asset.storageUrl}
                        alt={asset.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={14} />
                    )
                  ) : (
                    <MusicIcon size={14} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-neutral-200" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-mono">
                    {formatFileSize(asset.sizeBytes || 0)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                <button
                  type="button"
                  data-testid="btn-replace-asset"
                  onClick={() => triggerReplace(asset.id)}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                  title="Replace file (preserves ID)"
                >
                  <EditIcon size={13} />
                </button>
                <button
                  type="button"
                  data-testid="btn-delete-asset"
                  onClick={() => setSelectedAssetForDelete(asset)}
                  className="rounded p-1 text-neutral-400 hover:bg-red-950/60 hover:text-red-400 transition"
                  title="Delete asset"
                >
                  <TrashIcon size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Safe Delete Modal */}
      <SafeDeleteModal
        isOpen={selectedAssetForDelete !== null}
        asset={selectedAssetForDelete}
        project={project}
        onClose={() => setSelectedAssetForDelete(null)}
        onConfirmDelete={(asset) => {
          onDeleteAsset?.(asset.id);
          setSelectedAssetForDelete(null);
        }}
      />
    </div>
  );
};
