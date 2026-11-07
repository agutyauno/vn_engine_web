import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { AssetRef, AssetCategory, Project } from '@vn-engine/shared-types';
import {
  FolderIcon,
  ImageIcon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  EditIcon,
  AlertTriangleIcon,
  PlayIcon,
  PauseIcon,
  RotateCcwIcon,
  XIcon,
  GridIcon,
  ListIcon,
  CheckIcon,
  CopyIcon,
} from '../common/Icons';
import { SafeDeleteModal } from './SafeDeleteModal';
import { CreateAssetModal } from './CreateAssetModal';
import { StickyAudioPlayer } from './StickyAudioPlayer';
import {
  checkAssetDeletionSafety,
  scanActiveReconciliation,
} from '../../core/services/reconciliation';
import { validateAssetFile } from '../../core/utils/assetValidation';
import { generateDslSnippet } from '../../core/utils/dslSnippetGenerator';
import { useEditorUIStore } from '../../core/stores/uiStore';

export interface AssetLibraryPaneProps {
  project: Project;
  quickFixAsset?: { id: string; category?: AssetCategory } | null;
  quickFixAssetName?: string;
  onClearQuickFix?: () => void;
  onAddAsset?: (asset: AssetRef, fileBlob?: Blob) => void;
  onUpdateAsset?: (asset: AssetRef, fileBlob?: Blob) => void;
  onReplaceAsset?: (assetId: string, newBlob: Blob, newFileName?: string) => void;
  onDeleteAsset?: (assetId: string) => void;
  onInsertSnippet?: (snippet: string) => void;
}

type ConsolidatedCategory =
  | 'all'
  | 'backgrounds'
  | 'sprites'
  | 'audio'
  | 'bgm'
  | 'sfx'
  | 'voice'
  | 'ui'
  | 'other';

export type StatusFilter = 'all' | 'in_use' | 'unused';
export type SortOption = 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';

export const AssetLibraryPane: React.FC<AssetLibraryPaneProps> = ({
  project,
  quickFixAsset,
  quickFixAssetName,
  onClearQuickFix,
  onAddAsset,
  onUpdateAsset,
  onReplaceAsset,
  onDeleteAsset,
  onInsertSnippet,
}) => {
  const lastAssetCategory = useEditorUIStore(s => s.lastAssetCategory) as ConsolidatedCategory;
  const setLastAssetCategory = useEditorUIStore(s => s.setLastAssetCategory);
  const assetViewMode = useEditorUIStore(s => s.assetViewMode);
  const setAssetViewMode = useEditorUIStore(s => s.setAssetViewMode);

  const [activeTab, setActiveTab] = useState<ConsolidatedCategory>(lastAssetCategory || 'all');
  const [editingAsset, setEditingAsset] = useState<AssetRef | null>(null);

  useEffect(() => {
    if (lastAssetCategory) {
      setActiveTab(lastAssetCategory as ConsolidatedCategory);
    }
  }, [lastAssetCategory]);

  const handleCategoryFilterChange = (cat: ConsolidatedCategory) => {
    setActiveTab(cat);
    setLastAssetCategory(cat);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [selectedAssetForDelete, setSelectedAssetForDelete] = useState<AssetRef | null>(null);
  const [targetReplaceAssetId, setTargetReplaceAssetId] = useState<string | null>(null);
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);

  // Create Asset Modal & Drag-and-Drop States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [modalPrefillId, setModalPrefillId] = useState<string | undefined>(undefined);
  const [modalPrefillCategory, setModalPrefillCategory] = useState<AssetCategory | undefined>(
    undefined,
  );
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Audio Audition Player State
  const [auditioningAsset, setAuditioningAsset] = useState<AssetRef | null>(null);

  // Image Lightbox State
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [lightboxImageName, setLightboxImageName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Scan reconciliation for unused assets
  const unusedSet = useMemo(() => {
    try {
      const res = scanActiveReconciliation(project);
      return new Set(res.unusedAssets || []);
    } catch {
      return new Set<string>();
    }
  }, [project]);

  const isAssetUnused = (asset: AssetRef) => {
    const cleanName = asset.name.replace(/\.[^/.]+$/, '');
    return (
      unusedSet.has(asset.name) ||
      unusedSet.has(asset.id) ||
      unusedSet.has(cleanName) ||
      checkAssetDeletionSafety(asset.id, project).safe
    );
  };

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    const rawList = (project.assets || []).filter(asset => {
      // 1. Category Filter
      let matchesCategory = false;
      if (activeTab === 'all') {
        matchesCategory = true;
      } else if (activeTab === 'backgrounds') {
        matchesCategory =
          asset.category === 'background' ||
          (!asset.category && asset.type === 'image' && !asset.name.startsWith('char_'));
      } else if (activeTab === 'sprites') {
        matchesCategory =
          asset.category === 'sprite' ||
          (!asset.category && asset.type === 'image' && asset.name.startsWith('char_'));
      } else if (activeTab === 'audio') {
        matchesCategory =
          asset.type === 'audio' || ['bgm', 'sfx', 'voice'].includes(asset.category || '');
      } else if (activeTab === 'bgm') {
        matchesCategory =
          asset.category === 'bgm' ||
          (!asset.category &&
            asset.type === 'audio' &&
            (asset.name.startsWith('bgm_') ||
              asset.name.includes('music') ||
              asset.name.includes('theme')));
      } else if (activeTab === 'sfx') {
        matchesCategory =
          asset.category === 'sfx' ||
          (!asset.category &&
            asset.type === 'audio' &&
            (asset.name.startsWith('sfx_') ||
              asset.name.startsWith('se_') ||
              asset.name.includes('sound') ||
              asset.name.includes('click')));
      } else if (activeTab === 'voice') {
        matchesCategory =
          asset.category === 'voice' ||
          (!asset.category &&
            asset.type === 'audio' &&
            (asset.name.startsWith('voice_') || asset.name.includes('voice')));
      } else if (activeTab === 'ui') {
        matchesCategory = asset.category === 'ui';
      } else if (activeTab === 'other') {
        matchesCategory =
          asset.category === 'other' ||
          (!['background', 'sprite', 'bgm', 'sfx', 'voice', 'ui'].includes(asset.category || '') &&
            asset.type !== 'image' &&
            asset.type !== 'audio');
      }

      if (!matchesCategory) return false;

      // 2. Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          asset.name.toLowerCase().includes(q) ||
          asset.id.toLowerCase().includes(q) ||
          (asset.category && asset.category.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }

      // 3. Status Filter (In Use / Unused)
      const unused = isAssetUnused(asset);
      if (statusFilter === 'in_use' && unused) return false;
      if (statusFilter === 'unused' && !unused) return false;

      return true;
    });

    // 4. Sorting
    return rawList.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'size_desc') return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      if (sortBy === 'size_asc') return (a.sizeBytes || 0) - (b.sizeBytes || 0);
      return 0;
    });
  }, [project.assets, activeTab, searchQuery, statusFilter, sortBy, unusedSet]);

  const stageIncomingFile = (file: File) => {
    const validation = validateAssetFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Unsupported file format');
      setTimeout(() => setUploadError(null), 5000);
      return;
    }
    setUploadError(null);
    setStagedFile(file);
    setIsCreateModalOpen(true);
  };

  const handleOpenCreateModal = () => {
    setStagedFile(null);
    setModalPrefillId(undefined);
    setModalPrefillCategory(
      activeTab === 'backgrounds'
        ? 'background'
        : activeTab === 'sprites'
          ? 'sprite'
          : activeTab === 'bgm' || activeTab === 'audio'
            ? 'bgm'
            : activeTab === 'sfx'
              ? 'sfx'
              : activeTab === 'voice'
                ? 'voice'
                : activeTab === 'ui'
                  ? 'ui'
                  : activeTab === 'other'
                    ? 'other'
                    : undefined,
    );
    setIsCreateModalOpen(true);
  };

  const handleUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stageIncomingFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      stageIncomingFile(file);
    }
  };

  const handleSaveCreatedAsset = (asset: AssetRef, fileBlob?: Blob) => {
    onAddAsset?.(asset, fileBlob);
    setIsCreateModalOpen(false);
    setStagedFile(null);
    setModalPrefillId(undefined);
    setModalPrefillCategory(undefined);
    onClearQuickFix?.();
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

  const handleCopySnippet = (asset: AssetRef, e: React.MouseEvent) => {
    e.stopPropagation();
    const snippet = generateDslSnippet({
      type: 'asset',
      assetName: asset.name,
      category: asset.category,
      assetType: asset.type,
    });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(snippet);
      setCopiedAssetId(asset.id);
      setTimeout(() => {
        setCopiedAssetId(c => (c === asset.id ? null : c));
      }, 1500);
    }
  };

  const handleInsert = (asset: AssetRef, e: React.MouseEvent) => {
    e.stopPropagation();
    const snippet = generateDslSnippet({
      type: 'asset',
      assetName: asset.name,
      category: asset.category,
      assetType: asset.type,
    });
    onInsertSnippet?.(snippet);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      data-testid="pane-asset-library"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex h-full flex-1 min-w-0 w-full flex-col bg-neutral-900 border-r border-neutral-800 text-neutral-200 select-none transition-colors ${
        isDragging ? 'border-sky-500 bg-sky-950/20' : ''
      }`}
    >
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
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <FolderIcon size={16} className="text-neutral-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Asset Library
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded border border-neutral-800 bg-neutral-950/60 p-0.5">
            <button
              type="button"
              aria-label="List view"
              title="List view"
              draggable={false}
              onClick={() => setAssetViewMode('list')}
              className={`flex h-5 w-5 items-center justify-center rounded transition ${
                assetViewMode === 'list'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <ListIcon size={12} />
            </button>
            <button
              type="button"
              aria-label="Grid view"
              title="Grid view"
              draggable={false}
              onClick={() => setAssetViewMode('grid')}
              className={`flex h-5 w-5 items-center justify-center rounded transition ${
                assetViewMode === 'grid'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <GridIcon size={12} />
            </button>
          </div>

          <button
            type="button"
            data-testid="btn-add-asset"
            onClick={handleOpenCreateModal}
            draggable={false}
            className="flex items-center gap-1 rounded bg-neutral-800 hover:bg-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:text-white transition"
            title="Add new asset"
          >
            <PlusIcon size={13} />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {/* Upload Error Banner */}
      {uploadError && (
        <div className="mx-3 mt-3 flex items-center justify-between rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300 shrink-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <AlertTriangleIcon size={14} className="shrink-0 text-red-400" />
            <span className="truncate">{uploadError}</span>
          </div>
          <button
            type="button"
            draggable={false}
            onClick={() => setUploadError(null)}
            className="text-red-400 hover:text-red-200"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Quick Fix Pending Notification */}
      {(quickFixAsset?.id || quickFixAssetName) && (
        <div
          data-testid="quickfix-pending-badge"
          className="mx-3 mt-3 flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300 shrink-0"
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            <AlertTriangleIcon size={14} className="shrink-0 text-amber-400" />
            <span className="truncate">Uncreated: {quickFixAsset?.id || quickFixAssetName}</span>
          </div>
          <button
            type="button"
            data-testid="btn-quickfix-create-asset"
            draggable={false}
            onClick={() => {
              setModalPrefillId(quickFixAsset?.id || quickFixAssetName);
              setModalPrefillCategory(quickFixAsset?.category || 'background');
              setStagedFile(null);
              setIsCreateModalOpen(true);
            }}
            className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/30 transition"
          >
            Create
          </button>
        </div>
      )}

      {/* Category Dropdown & Backward-Compatible Aliases */}
      <div className="border-b border-neutral-800 px-3 py-2 shrink-0">
        <label htmlFor="select-asset-category-filter" className="sr-only">
          Filter by Category
        </label>
        <select
          id="select-asset-category-filter"
          data-testid="select-asset-category-filter"
          value={activeTab}
          onChange={e => handleCategoryFilterChange(e.target.value as ConsolidatedCategory)}
          className="w-full rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 focus:border-neutral-700 focus:outline-none transition cursor-pointer font-sans"
        >
          <option value="all">All Categories</option>
          <option value="backgrounds">Backgrounds</option>
          <option value="sprites">Sprites</option>
          <option value="bgm">BGM</option>
          <option value="sfx">SFX</option>
          <option value="voice">Voice</option>
          <option value="ui">UI</option>
          <option value="other">Other</option>
        </select>
        <div className="hidden" aria-hidden="true">
          <button data-testid="tab-asset-all" type="button" onClick={() => setActiveTab('all')}>
            All
          </button>
          <button
            data-testid="tab-asset-backgrounds"
            type="button"
            onClick={() => setActiveTab('backgrounds')}
          >
            Backgrounds
          </button>
          <button
            data-testid="tab-asset-sprites"
            type="button"
            onClick={() => setActiveTab('sprites')}
          >
            Sprites
          </button>
          <button data-testid="tab-asset-bgm" type="button" onClick={() => setActiveTab('bgm')}>
            BGM
          </button>
          <button data-testid="tab-asset-sfx" type="button" onClick={() => setActiveTab('sfx')}>
            SFX
          </button>
          <button data-testid="tab-asset-voice" type="button" onClick={() => setActiveTab('voice')}>
            Voice
          </button>
          <button data-testid="tab-asset-ui" type="button" onClick={() => setActiveTab('ui')}>
            UI
          </button>
          <button data-testid="tab-asset-other" type="button" onClick={() => setActiveTab('other')}>
            Other
          </button>
          <button data-testid="tab-asset-audio" type="button" onClick={() => setActiveTab('audio')}>
            Audio
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <div className="relative">
          <SearchIcon size={13} className="absolute left-2.5 top-2.5 text-neutral-500" />
          <input
            type="text"
            data-testid="input-asset-search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full rounded border border-neutral-800 bg-neutral-950 pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:border-neutral-700 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Status Filter & Sort Controls */}
      <div className="flex items-center gap-2 px-3 pb-2.5 shrink-0">
        <label htmlFor="select-status-filter" className="sr-only">
          Status Filter
        </label>
        <select
          id="select-status-filter"
          data-testid="select-status-filter"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300 focus:border-neutral-700 focus:outline-none cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="in_use">In Use</option>
          <option value="unused">Unused</option>
        </select>

        <label htmlFor="select-sort-by" className="sr-only">
          Sort by
        </label>
        <select
          id="select-sort-by"
          data-testid="select-sort-by"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortOption)}
          className="flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-[11px] text-neutral-300 focus:border-neutral-700 focus:outline-none cursor-pointer"
        >
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
          <option value="size_desc">Size (Large)</option>
          <option value="size_asc">Size (Small)</option>
        </select>
      </div>

      {/* Asset List / Grid Container */}
      <div className="flex-1 overflow-y-auto">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-500">
            <span>No assets found</span>
          </div>
        ) : (
          <div
            data-testid="asset-list-container"
            data-view-mode={assetViewMode}
            className={
              assetViewMode === 'grid'
                ? 'grid grid-cols-2 gap-2 px-3 pb-3'
                : 'px-3 pb-3 space-y-1.5'
            }
          >
            {filteredAssets.map(asset => {
              const isReferenced = !isAssetUnused(asset);
              const isAuditioning = auditioningAsset?.id === asset.id;
              const isCopied = copiedAssetId === asset.id;
              const snippet = generateDslSnippet({
                type: 'asset',
                assetName: asset.name,
                category: asset.category,
                assetType: asset.type,
              });

              if (assetViewMode === 'grid') {
                return (
                  <div
                    key={asset.id}
                    data-testid={`asset-item-${asset.id}`}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', `${snippet}\n`);
                    }}
                    className="group relative flex flex-col rounded-lg border border-neutral-800/80 bg-neutral-950/50 p-2 hover:border-neutral-700 hover:bg-neutral-850/60 transition cursor-grab active:cursor-grabbing text-xs overflow-hidden"
                  >
                    {/* Thumbnail / Image Preview */}
                    <div
                      onClick={() => {
                        if (asset.type === 'image' && asset.storageUrl) {
                          setLightboxImageUrl(asset.storageUrl);
                          setLightboxImageName(asset.name);
                        }
                      }}
                      className="relative aspect-square w-full rounded bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center mb-2"
                    >
                      {asset.type === 'image' ? (
                        asset.storageUrl ? (
                          <img
                            src={asset.storageUrl}
                            alt={asset.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon size={20} className="text-neutral-500" />
                        )
                      ) : (
                        <MusicIcon size={20} className="text-neutral-500" />
                      )}

                      {/* Status Badge Overlay */}
                      <span
                        data-testid={`badge-asset-status-${asset.id}`}
                        className={`absolute top-1 right-1 rounded px-1 py-0.5 text-[9px] font-mono shrink-0 shadow-sm ${
                          isReferenced
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : 'bg-neutral-900/90 text-neutral-400 border border-neutral-800'
                        }`}
                      >
                        {isReferenced ? '[In Use]' : '[Unused]'}
                      </span>
                    </div>

                    {/* Asset Info */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <p
                        className="truncate text-[11px] font-medium text-neutral-200"
                        title={asset.name}
                      >
                        {asset.name}
                      </p>
                      <p className="text-[10px] text-neutral-500 font-mono">
                        {formatFileSize(asset.sizeBytes || 0)}
                      </p>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="mt-2 flex items-center justify-between border-t border-neutral-800/60 pt-1.5 opacity-80 group-hover:opacity-100 transition">
                      <div className="flex items-center gap-1">
                        {asset.type === 'audio' && (
                          <button
                            type="button"
                            data-testid={`btn-audition-asset-${asset.id}`}
                            onClick={e => {
                              e.stopPropagation();
                              setAuditioningAsset(curr => (curr?.id === asset.id ? null : asset));
                            }}
                            title={isAuditioning ? 'Pause audio' : 'Audition audio'}
                            draggable={false}
                            className={`rounded p-1 transition ${
                              isAuditioning
                                ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                            }`}
                          >
                            {isAuditioning ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid={`btn-copy-asset-${asset.id}`}
                          data-copied={isCopied ? 'true' : 'false'}
                          onClick={e => handleCopySnippet(asset, e)}
                          title="Copy DSL snippet"
                          draggable={false}
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
                        >
                          {isCopied ? (
                            <CheckIcon size={12} className="text-emerald-400" />
                          ) : (
                            <CopyIcon size={12} />
                          )}
                        </button>
                        {onInsertSnippet && (
                          <button
                            type="button"
                            data-testid={`btn-insert-asset-${asset.id}`}
                            onClick={e => handleInsert(asset, e)}
                            title="Insert at cursor"
                            draggable={false}
                            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
                          >
                            <PlusIcon size={12} />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid="btn-edit-asset"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingAsset(asset);
                          }}
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
                          title="Edit asset info"
                          draggable={false}
                        >
                          <EditIcon size={12} />
                        </button>
                        <button
                          type="button"
                          data-testid="btn-replace-asset"
                          onClick={e => {
                            e.stopPropagation();
                            triggerReplace(asset.id);
                          }}
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
                          title="Replace file (preserves ID)"
                          draggable={false}
                        >
                          <RotateCcwIcon size={12} />
                        </button>
                        <button
                          type="button"
                          data-testid="btn-delete-asset"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedAssetForDelete(asset);
                          }}
                          className="rounded p-1 text-neutral-400 hover:bg-red-950/60 hover:text-red-400 transition"
                          title="Delete asset"
                          draggable={false}
                        >
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // List View Card
              return (
                <div
                  key={asset.id}
                  data-testid={`asset-item-${asset.id}`}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', `${snippet}\n`);
                  }}
                  className="group flex items-center justify-between rounded border border-neutral-800/80 bg-neutral-950/40 p-2 hover:border-neutral-700 hover:bg-neutral-800/40 transition cursor-grab active:cursor-grabbing text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Thumbnail / Icon */}
                    <div
                      onClick={() => {
                        if (asset.type === 'image' && asset.storageUrl) {
                          setLightboxImageUrl(asset.storageUrl);
                          setLightboxImageName(asset.name);
                        }
                      }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-900 border border-neutral-800 text-neutral-400 overflow-hidden ${
                        asset.type === 'image' ? 'cursor-pointer hover:border-neutral-500' : ''
                      }`}
                    >
                      {asset.type === 'image' ? (
                        asset.storageUrl ? (
                          <img
                            src={asset.storageUrl}
                            alt={asset.name}
                            loading="lazy"
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
                      <div className="flex items-center gap-1.5">
                        <p
                          className="truncate text-xs font-medium text-neutral-200"
                          title={asset.name}
                        >
                          {asset.name}
                        </p>
                        <span
                          data-testid={`badge-asset-status-${asset.id}`}
                          className={`rounded px-1 py-0.2 text-[9px] font-mono shrink-0 ${
                            isReferenced
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {isReferenced ? '[In Use]' : '[Unused]'}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 font-mono">
                        {formatFileSize(asset.sizeBytes || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition shrink-0">
                    {asset.type === 'audio' && (
                      <button
                        type="button"
                        data-testid={`btn-audition-asset-${asset.id}`}
                        onClick={e => {
                          e.stopPropagation();
                          setAuditioningAsset(curr => (curr?.id === asset.id ? null : asset));
                        }}
                        title={isAuditioning ? 'Pause audio' : 'Audition audio'}
                        draggable={false}
                        className={`rounded p-1 transition ${
                          isAuditioning
                            ? 'bg-sky-950 text-sky-400 border border-sky-800'
                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                        }`}
                      >
                        {isAuditioning ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid={`btn-copy-asset-${asset.id}`}
                      data-copied={isCopied ? 'true' : 'false'}
                      onClick={e => handleCopySnippet(asset, e)}
                      title="Copy DSL snippet"
                      draggable={false}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                    >
                      {isCopied ? (
                        <CheckIcon size={13} className="text-emerald-400" />
                      ) : (
                        <CopyIcon size={13} />
                      )}
                    </button>

                    <button
                      type="button"
                      data-testid={`btn-insert-asset-${asset.id}`}
                      onClick={e => handleInsert(asset, e)}
                      title="Insert at cursor"
                      draggable={false}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                    >
                      <PlusIcon size={13} />
                    </button>

                    <button
                      type="button"
                      data-testid="btn-edit-asset"
                      onClick={e => {
                        e.stopPropagation();
                        setEditingAsset(asset);
                      }}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                      title="Edit asset info"
                      draggable={false}
                    >
                      <EditIcon size={13} />
                    </button>

                    <button
                      type="button"
                      data-testid="btn-replace-asset"
                      onClick={e => {
                        e.stopPropagation();
                        triggerReplace(asset.id);
                      }}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white transition"
                      title="Replace file (preserves ID)"
                      draggable={false}
                    >
                      <RotateCcwIcon size={13} />
                    </button>

                    <button
                      type="button"
                      data-testid="btn-delete-asset"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedAssetForDelete(asset);
                      }}
                      className="rounded p-1 text-neutral-400 hover:bg-red-950/60 hover:text-red-400 transition"
                      title="Delete asset"
                      draggable={false}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Mini Audio Player */}
      {auditioningAsset && (
        <StickyAudioPlayer asset={auditioningAsset} onClose={() => setAuditioningAsset(null)} />
      )}

      {/* Safe Delete Modal */}
      <SafeDeleteModal
        isOpen={selectedAssetForDelete !== null}
        asset={selectedAssetForDelete}
        project={project}
        onClose={() => setSelectedAssetForDelete(null)}
        onConfirmDelete={asset => {
          onDeleteAsset?.(asset.id);
          setSelectedAssetForDelete(null);
        }}
      />

      {/* Image Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          data-testid="modal-image-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImageUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-6 select-none"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative flex flex-col items-center max-w-4xl max-h-[90vh] rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-2xl overflow-hidden"
          >
            <div className="flex w-full items-center justify-between px-3 py-2 border-b border-neutral-800 text-xs text-neutral-300">
              <span className="font-medium truncate">{lightboxImageName}</span>
              <button
                type="button"
                data-testid="btn-close-lightbox"
                draggable={false}
                onClick={() => setLightboxImageUrl(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="flex items-center justify-center p-4 max-h-[80vh] overflow-auto">
              <img
                src={lightboxImageUrl}
                alt={lightboxImageName}
                className="max-h-[75vh] max-w-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Create Asset Modal */}
      <CreateAssetModal
        isOpen={isCreateModalOpen}
        initialFile={stagedFile}
        initialAssetId={modalPrefillId}
        initialCategory={
          modalPrefillCategory ||
          (activeTab === 'backgrounds'
            ? 'background'
            : activeTab === 'sprites'
              ? 'sprite'
              : activeTab === 'audio' || activeTab === 'bgm'
                ? 'bgm'
                : activeTab === 'sfx'
                  ? 'sfx'
                  : activeTab === 'voice'
                    ? 'voice'
                    : activeTab === 'ui'
                      ? 'ui'
                      : activeTab === 'other'
                        ? 'other'
                        : undefined)
        }
        existingAssetIds={(project.assets || []).map(a => a.id)}
        onClose={() => {
          setIsCreateModalOpen(false);
          setStagedFile(null);
          setModalPrefillId(undefined);
          setModalPrefillCategory(undefined);
          onClearQuickFix?.();
        }}
        onSave={handleSaveCreatedAsset}
      />

      {/* Edit Asset Modal */}
      {editingAsset && (
        <CreateAssetModal
          isOpen={true}
          initialFile={null}
          initialAsset={editingAsset}
          isEditMode={true}
          existingAssetIds={(project.assets || []).map(a => a.id)}
          onClose={() => setEditingAsset(null)}
          onSave={(updatedAsset, fileBlob) => {
            (onUpdateAsset || onAddAsset)?.(updatedAsset, fileBlob);
            setEditingAsset(null);
          }}
        />
      )}
    </div>
  );
};
