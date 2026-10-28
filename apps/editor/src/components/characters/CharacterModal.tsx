import React, { useState, useEffect, useRef } from 'react';
import type { Character } from '@vn-engine/shared-types';
import {
  AlertTriangleIcon,
  CloseIcon,
  ImageIcon,
  PlusIcon,
  TrashIcon,
} from '../common/Icons';

export interface CharacterSpriteRow {
  id: string;
  expressionKey: string;
  imageUrl: string;
  fileName?: string;
  sizeBytes?: number;
  isDefault: boolean;
}

export interface CharacterModalProps {
  isOpen: boolean;
  initialData?: Character | null;
  existingIds?: string[];
  onClose: () => void;
  onSave: (character: Character) => void;
}

export const COLOR_SWATCHES = [
  '#38bdf8',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#ffffff',
];

export function normalizeHex(input: string, fallback: string = '#38bdf8'): string {
  let trimmed = input.trim();
  if (!trimmed.startsWith('#')) trimmed = '#' + trimmed;
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
  }
  return fallback;
}

export function isValidHex(input: string): boolean {
  let trimmed = input.trim();
  if (!trimmed.startsWith('#')) trimmed = '#' + trimmed;
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) || /^#[0-9A-Fa-f]{3}$/.test(trimmed);
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deriveExpressionKey(fileName: string, charId?: string): string {
  // Strip extension
  let base = fileName.replace(/\.[^/.]+$/, '').trim();

  // If filename starts with charId + "_" or "-", strip it
  if (charId) {
    const trimmedId = charId.trim();
    if (trimmedId) {
      const escaped = escapeRegex(trimmedId);
      const prefixRegex = new RegExp(`^${escaped}[_-]`, 'i');
      base = base.replace(prefixRegex, '');
    }
  }

  // Normalize: lower case and keep only valid identifier characters
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'default';
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  isOpen,
  initialData,
  existingIds = [],
  onClose,
  onSave,
}) => {
  const isEditMode = !!initialData;
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [charId, setCharId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [colorHex, setColorHex] = useState('#38bdf8');
  const [nativeColor, setNativeColor] = useState('#38bdf8');
  const [expressions, setExpressions] = useState<CharacterSpriteRow[]>([]);

  const [idError, setIdError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Initialize or reset form when initialData or isOpen changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setCharId(initialData.id);
      setDisplayName(initialData.name);
      const color = initialData.colorHex || '#38bdf8';
      const valid = normalizeHex(color);
      setColorHex(color);
      setNativeColor(valid);

      const defaultExpr = initialData.defaultExpression || 'default';
      const rows: CharacterSpriteRow[] = Object.entries(initialData.sprites || {}).map(
        ([key, url], idx) => ({
          id: `expr-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          expressionKey: key,
          imageUrl: url,
          fileName: `${key}.png`,
          isDefault: key === defaultExpr,
        })
      );

      // If no row is default but rows exist, set first to default
      if (rows.length > 0 && !rows.some((r) => r.isDefault)) {
        rows[0]!.isDefault = true;
      }

      setExpressions(rows);
    } else {
      setCharId('');
      setDisplayName('');
      setColorHex('#38bdf8');
      setNativeColor('#38bdf8');
      setExpressions([]);
    }

    setIdError(null);
    setWarnings([]);
    setIsDragging(false);
  }, [isOpen, initialData]);

  // Validate ID
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = charId.trim();

    if (!trimmed) {
      setIdError('Character ID is required');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setIdError('Character ID must contain only letters, numbers, and underscores');
      return;
    }

    if (!isEditMode && existingIds.map((id) => id.toLowerCase()).includes(trimmed.toLowerCase())) {
      setIdError(`Character ID '${trimmed.toLowerCase()}' already exists`);
      return;
    }

    setIdError(null);
  }, [charId, isEditMode, existingIds, isOpen]);

  if (!isOpen) return null;

  // Validate expression keys
  const getExpressionKeyError = (index: number): string | null => {
    const row = expressions[index];
    if (!row) return null;
    const key = row.expressionKey.trim();

    if (!key) {
      return 'Expression key cannot be empty';
    }

    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      return 'Expression key must contain only letters, numbers, and underscores';
    }

    const normalized = key.toLowerCase();
    const isDuplicate = expressions.some(
      (r, i) => i !== index && r.expressionKey.trim().toLowerCase() === normalized
    );

    if (isDuplicate) {
      return `Expression key '${normalized}' already exists`;
    }

    return null;
  };

  const hasExpressionErrors = expressions.some((_, idx) => getExpressionKeyError(idx) !== null);
  const isSaveDisabled = !!idError || hasExpressionErrors;

  // Handle color text changes
  const handleHexTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setColorHex(val);

    if (isValidHex(val)) {
      setNativeColor(normalizeHex(val));
    }
  };

  // Handle native color picker changes
  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase();
    setNativeColor(val);
    setColorHex(val);
  };

  // Handle swatch click
  const handleSwatchClick = (hex: string) => {
    setColorHex(hex);
    setNativeColor(hex);
  };

  // Read files and convert to Base64
  const processFiles = (files: FileList | File[]) => {
    const newWarnings: string[] = [];
    const validFiles: { file: File; key: string }[] = [];

    Array.from(files).forEach((file) => {
      if (file.type && !file.type.startsWith('image/')) {
        newWarnings.push(`Skipped non-image file: ${file.name}`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        newWarnings.push(`File ${file.name} exceeds 10MB limit`);
      }
      const key = deriveExpressionKey(file.name, charId.trim());
      validFiles.push({ file, key });
    });

    if (newWarnings.length > 0) {
      setWarnings((prev) => [...prev, ...newWarnings]);
    }

    if (validFiles.length === 0) return;

    validFiles.forEach(({ file, key }) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (!result) return;

        setExpressions((prev) => {
          let derivedKey = key;
          let counter = 1;
          while (prev.some((r) => r.expressionKey.toLowerCase() === derivedKey.toLowerCase())) {
            derivedKey = `${key}_${counter++}`;
          }

          const isFirst = prev.length === 0;
          const newRow: CharacterSpriteRow = {
            id: `expr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            expressionKey: derivedKey,
            imageUrl: result,
            fileName: file.name,
            sizeBytes: file.size,
            isDefault: isFirst || derivedKey === 'default',
          };

          // If new row is default, unset previous defaults
          let updated = [...prev];
          if (newRow.isDefault) {
            updated = updated.map((r) => ({ ...r, isDefault: false }));
          }

          const combined = [...updated, newRow];
          if (!combined.some((r) => r.isDefault) && combined.length > 0) {
            combined[0]!.isDefault = true;
          }

          return combined;
        });
      };
      reader.readAsDataURL(file);
    });
  };

  // Single file replacement for an expression row
  const handleSingleFileUpload = (index: number, file: File) => {
    if (file.type && !file.type.startsWith('image/')) {
      setWarnings((prev) => [...prev, `Skipped non-image file: ${file.name}`]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;

      setExpressions((prev) => {
        const next = [...prev];
        const target = next[index];
        if (target) {
          next[index] = {
            ...target,
            imageUrl: result,
            fileName: file.name,
            sizeBytes: file.size,
          };
        }
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  // Add blank expression row
  const handleAddBlankRow = () => {
    setExpressions((prev) => {
      let candidate = prev.length === 0 ? 'default' : `expr_${prev.length}`;
      let counter = 1;
      while (prev.some((r) => r.expressionKey.toLowerCase() === candidate.toLowerCase())) {
        candidate = `expr_${prev.length}_${counter++}`;
      }

      const isFirst = prev.length === 0;
      return [
        ...prev,
        {
          id: `expr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          expressionKey: candidate,
          imageUrl: '',
          isDefault: isFirst,
        },
      ];
    });
  };

  // Set default expression row
  const handleSetDefaultRow = (index: number) => {
    setExpressions((prev) =>
      prev.map((row, i) => ({
        ...row,
        isDefault: i === index,
      }))
    );
  };

  // Delete expression row with fallback shift
  const handleDeleteRow = (index: number) => {
    setExpressions((prev) => {
      const wasDefault = prev[index]?.isDefault;
      const next = prev.filter((_, i) => i !== index);

      if (wasDefault && next.length > 0 && next[0]) {
        next[0].isDefault = true;
      }

      return next;
    });
  };

  // Submit save
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaveDisabled) return;

    const spritesMap: Record<string, string> = {};
    let defaultExpr = '';

    for (const row of expressions) {
      const k = row.expressionKey.trim().toLowerCase();
      if (k) {
        if (row.imageUrl) {
          spritesMap[k] = row.imageUrl;
        }
        if (row.isDefault) {
          defaultExpr = k;
        }
      }
    }

    if (!defaultExpr && expressions.length > 0) {
      const firstWithKey = expressions.find((r) => r.expressionKey.trim());
      defaultExpr = firstWithKey ? firstWithKey.expressionKey.trim().toLowerCase() : 'default';
    }

    const finalId = (isEditMode && initialData ? initialData.id : charId).trim().toLowerCase();
    const savedCharacter: Character = {
      id: finalId,
      name: displayName.trim() || finalId,
      colorHex: normalizeHex(colorHex),
      defaultExpression: defaultExpr || 'default',
      sprites: spritesMap,
    };

    onSave(savedCharacter);
  };

  return (
    <div
      data-testid="modal-character-form"
      id="modal-character-form"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex w-full max-w-2xl flex-col max-h-[90vh] rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-wide uppercase text-neutral-200">
              {isEditMode ? 'Edit Character' : 'Create Character'}
            </span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
              #modal-character-form
            </span>
          </div>
          <button
            type="button"
            data-testid="btn-close-character-modal"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto p-5 space-y-5">
          {/* Section 1: Identity & Color */}
          <div className="space-y-4 rounded-md border border-neutral-800/80 bg-neutral-950/40 p-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Character ID */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Character ID (Script Handle)
                </label>
                <input
                  type="text"
                  data-testid="input-char-id"
                  value={isEditMode && initialData ? initialData.id : charId}
                  disabled={isEditMode}
                  readOnly={isEditMode}
                  onChange={(e) => {
                    if (!isEditMode) {
                      setCharId(e.target.value);
                    }
                  }}
                  placeholder="e.g. elena"
                  className={`w-full rounded border px-3 py-1.5 text-xs font-mono transition focus:outline-none ${
                    isEditMode
                      ? 'border-neutral-800 bg-neutral-950/60 text-neutral-500 cursor-not-allowed'
                      : idError
                      ? 'border-red-500/70 bg-neutral-950 text-white focus:border-red-400'
                      : 'border-neutral-700 bg-neutral-950 text-white focus:border-neutral-400'
                  }`}
                />
                {idError && (
                  <p data-testid="char-id-error" className="mt-1 text-[11px] text-red-400">
                    {idError}
                  </p>
                )}
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Display Name (Tên hộp thoại)
                </label>
                <input
                  type="text"
                  data-testid="input-char-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Elena Gilbert"
                  className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white focus:border-neutral-400 focus:outline-none transition"
                />
              </div>
            </div>

            {/* Nameplate Color Picker & Live Preview */}
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Nameplate Color & Live Preview
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  data-testid="input-char-color-picker"
                  value={nativeColor}
                  onChange={handleNativeColorChange}
                  className="h-8 w-9 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
                />
                <input
                  type="text"
                  data-testid="input-char-color-hex"
                  value={colorHex}
                  onChange={handleHexTextChange}
                  placeholder="#38bdf8"
                  className="w-24 rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs font-mono text-white focus:border-neutral-400 focus:outline-none"
                />

                {/* Swatches */}
                <div className="flex items-center gap-1.5">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      data-testid={`color-swatch-${hex}`}
                      onClick={() => handleSwatchClick(hex)}
                      className={`h-5 w-5 rounded border transition ${
                        nativeColor === hex
                          ? 'border-white scale-110 shadow-xs'
                          : 'border-neutral-700 hover:border-neutral-500'
                      }`}
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>

                {/* Live Nameplate Tag Preview */}
                <div className="ml-auto flex items-center">
                  <span className="text-[11px] text-neutral-500 mr-2">Preview:</span>
                  <span
                    data-testid="nameplate-preview"
                    className="rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-xs font-semibold"
                    style={{ color: isValidHex(colorHex) ? normalizeHex(colorHex) : nativeColor }}
                  >
                    {displayName || (isEditMode && initialData ? initialData.id : charId) || 'Elena Gilbert'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Sprites Manager */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Sprite Expressions
                </h4>
                <p className="text-[11px] text-neutral-500">
                  Manage expression handles and corresponding sprite images.
                </p>
              </div>
              <button
                type="button"
                data-testid="btn-add-expr-row"
                onClick={handleAddBlankRow}
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
              >
                <PlusIcon size={12} />
                <span>Add Expression</span>
              </button>
            </div>

            {/* Warnings list */}
            {warnings.length > 0 && (
              <div
                data-testid="char-warnings-list"
                className="rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300 space-y-1"
              >
                {warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <AlertTriangleIcon size={14} className="shrink-0 text-amber-400" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Bulk Dropzone */}
            <div
              id="char-bulk-dropzone"
              data-testid="char-bulk-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) {
                  processFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => bulkFileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition ${
                isDragging
                  ? 'border-neutral-400 bg-neutral-800/80 text-white'
                  : 'border-neutral-700/80 bg-neutral-950/40 text-neutral-400 hover:border-neutral-600 hover:bg-neutral-900/40'
              }`}
            >
              <ImageIcon size={20} className="mb-1 text-neutral-400" />
              <span className="text-xs font-medium text-neutral-200">
                Drag & drop multiple expression images here
              </span>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Supports PNG, JPG, WebP, AVIF. Automatically strips file extensions & character prefixes.
              </p>
              <input
                ref={bulkFileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/avif"
                data-testid="input-char-sprite-files"
                onChange={(e) => {
                  if (e.target.files) {
                    processFiles(e.target.files);
                  }
                }}
                className="hidden"
              />
            </div>

            {/* Sprites Table */}
            <div
              id="char-sprites-manager-list"
              data-testid="char-sprites-manager-list"
              className="rounded border border-neutral-800 bg-neutral-950/60 overflow-hidden"
            >
              {expressions.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">
                  No expressions added yet. Drop images above or click "Add Expression".
                </div>
              ) : (
                <div className="divide-y divide-neutral-800/60 text-xs">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-2 bg-neutral-900/80 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-wider text-neutral-400">
                    <span className="col-span-2 text-center">Default</span>
                    <span className="col-span-4">Expression Key</span>
                    <span className="col-span-4">Preview & File</span>
                    <span className="col-span-2 text-right">Actions</span>
                  </div>

                  {/* Rows */}
                  {expressions.map((row, idx) => {
                    const error = getExpressionKeyError(idx);
                    const fileInputId = `file-input-${row.id}`;

                    return (
                      <div
                        key={row.id}
                        data-testid={`sprite-row-${row.expressionKey || idx}`}
                        className="grid grid-cols-12 gap-2 items-center px-3 py-2 hover:bg-neutral-900/40 transition"
                      >
                        {/* Default Radio */}
                        <div className="col-span-2 flex items-center justify-center">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="defaultExpressionRadio"
                              data-testid={`radio-default-expr-${idx}`}
                              checked={row.isDefault}
                              onChange={() => handleSetDefaultRow(idx)}
                              className="accent-neutral-300 cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-neutral-400">Def</span>
                          </label>
                        </div>

                        {/* Expression Key */}
                        <div className="col-span-4">
                          <input
                            type="text"
                            data-testid={`input-expr-key-${idx}`}
                            value={row.expressionKey}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExpressions((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, expressionKey: val } : r))
                              );
                            }}
                            placeholder="e.g. smile"
                            className={`w-full rounded border px-2 py-1 text-xs font-mono transition focus:outline-none ${
                              error
                                ? 'border-red-500 bg-neutral-950 text-white'
                                : 'border-neutral-700 bg-neutral-950 text-white focus:border-neutral-400'
                            }`}
                          />
                          {error && (
                            <p data-testid="expr-key-error" className="mt-0.5 text-[10px] text-red-400">
                              {error}
                            </p>
                          )}
                        </div>

                        {/* Preview & File Info */}
                        <div className="col-span-4 flex items-center gap-2 min-w-0">
                          {row.imageUrl ? (
                            <img
                              src={row.imageUrl}
                              alt={row.expressionKey}
                              data-testid={`expr-thumbnail-${idx}`}
                              className="h-8 w-8 rounded border border-neutral-700 bg-neutral-900 object-cover shrink-0"
                            />
                          ) : (
                            <div
                              data-testid={`expr-thumbnail-empty-${idx}`}
                              className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-neutral-700 bg-neutral-900 text-neutral-600 shrink-0"
                            >
                              <ImageIcon size={14} />
                            </div>
                          )}

                          <div className="flex flex-col min-w-0">
                            <span
                              data-testid={`expr-file-info-${idx}`}
                              className="truncate text-[11px] text-neutral-300 font-mono"
                              title={row.fileName || 'No file selected'}
                            >
                              {row.fileName || (row.imageUrl ? 'Image loaded' : 'No file')}
                            </span>
                            {row.sizeBytes && (
                              <span className="text-[9px] text-neutral-500 font-mono">
                                {(row.sizeBytes / 1024).toFixed(1)} KB
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="col-span-2 flex items-center justify-end gap-1.5">
                          {/* Hidden file input for this row */}
                          <input
                            id={fileInputId}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/avif"
                            data-testid={`input-file-expr-${idx}`}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleSingleFileUpload(idx, f);
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            data-testid={`btn-select-file-${idx}`}
                            onClick={() => document.getElementById(fileInputId)?.click()}
                            title="Upload/Replace Image"
                            className="rounded border border-neutral-700 bg-neutral-800 p-1 text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
                          >
                            <ImageIcon size={12} />
                          </button>
                          <button
                            type="button"
                            data-testid={`btn-delete-expr-${idx}`}
                            onClick={() => handleDeleteRow(idx)}
                            title="Delete Expression"
                            className="rounded border border-neutral-800 p-1 text-neutral-400 hover:border-red-900/50 hover:bg-red-950/40 hover:text-red-400 transition"
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-3 border-t border-neutral-800 pt-4">
            <button
              type="button"
              data-testid="btn-cancel-character"
              onClick={onClose}
              className="rounded border border-neutral-700 px-4 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-save-character"
              disabled={isSaveDisabled}
              className={`rounded px-4 py-1.5 text-xs font-medium transition ${
                isSaveDisabled
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-800'
                  : 'bg-neutral-200 text-neutral-900 hover:bg-white cursor-pointer shadow-xs'
              }`}
            >
              {isEditMode ? 'Update Character' : 'Save Character'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
