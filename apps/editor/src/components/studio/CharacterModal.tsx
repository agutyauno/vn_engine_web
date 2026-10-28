import React, { useState, useEffect } from 'react';
import type { Character } from '@vn-engine/shared-types';
import { CloseIcon, TrashIcon, ImageIcon } from '../common/Icons';

export interface ExpressionItem {
  id: string; // unique item id in UI
  key: string; // expression key, e.g. 'smile'
  assetRefOrBlob: string; // asset id or blob: url
  file?: File;
}

interface CharacterModalProps {
  isOpen: boolean;
  character: Character | null; // null if creating, Character if editing
  onClose: () => void;
  onSave: (charData: Character, filesToUpload?: { key: string; file: File }[]) => void;
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  isOpen,
  character,
  onClose,
  onSave,
}) => {
  const [charId, setCharId] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [defaultExpr, setDefaultExpr] = useState('');
  const [expressions, setExpressions] = useState<ExpressionItem[]>([]);
  const [errors, setErrors] = useState<{ id?: string; name?: string }>({});

  const isEditing = !!character;

  useEffect(() => {
    if (character) {
      setCharId(character.id);
      setName(character.name);
      setColor(character.colorHex || '#ffffff');
      setDefaultExpr(character.defaultExpression || 'neutral');
      const exprList: ExpressionItem[] = Object.entries(character.sprites || {}).map(
        ([k, assetId]) => ({
          id: `expr-${k}-${Date.now()}-${Math.random()}`,
          key: k,
          assetRefOrBlob: String(assetId),
        })
      );
      setExpressions(exprList);
    } else {
      setCharId('');
      setName('');
      setColor('#ffffff');
      setDefaultExpr('neutral');
      setExpressions([]);
    }
    setErrors({});
  }, [character, isOpen]);

  if (!isOpen) return null;

  // Derive expression key from file name: e.g. "alice_happy.png" -> "happy", "smile.webp" -> "smile"
  const deriveExpressionKey = (filename: string): string => {
    const base = filename.replace(/\.[^/.]+$/, '');
    const match = base.match(/[_-]([a-zA-Z0-9]+)$/);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    return base.toLowerCase();
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: ExpressionItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      const key = deriveExpressionKey(file.name);
      const url = URL.createObjectURL(file);
      newItems.push({
        id: `expr-upload-${Date.now()}-${i}-${Math.random()}`,
        key,
        assetRefOrBlob: url,
        file,
      });
    }

    setExpressions((prev) => {
      const merged = [...prev, ...newItems];
      if (!defaultExpr && merged.length > 0 && merged[0]) {
        setDefaultExpr(merged[0].key);
      }
      return merged;
    });

    e.target.value = '';
  };

  const handleUpdateExprKey = (id: string, newKey: string) => {
    setExpressions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, key: newKey.toLowerCase().trim() } : item))
    );
  };

  const handleDeleteExpr = (id: string) => {
    setExpressions((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { id?: string; name?: string } = {};

    const trimmedId = charId.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedId) {
      newErrors.id = 'Character ID is required';
    } else if (!/^[a-z0-9_]+$/.test(trimmedId)) {
      newErrors.id = 'Character ID must contain only lowercase letters, numbers, and underscores';
    }

    if (!trimmedName) {
      newErrors.name = 'Display Name is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Build expressions map and pending file uploads
    const spriteMap: Record<string, string> = {};
    const filesToUpload: { key: string; file: File }[] = [];

    expressions.forEach((item) => {
      if (item.key) {
        spriteMap[item.key] = item.assetRefOrBlob;
        if (item.file) {
          filesToUpload.push({ key: item.key, file: item.file });
        }
      }
    });

    const finalDefaultExpr = defaultExpr || Object.keys(spriteMap)[0] || 'neutral';

    const charData: Character = {
      id: trimmedId,
      name: trimmedName,
      colorHex: color || '#ffffff',
      defaultExpression: finalDefaultExpr,
      sprites: spriteMap,
    };

    onSave(charData, filesToUpload);
    onClose();
  };

  return (
    <div
      data-testid="modal-character-form"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-2xl rounded-lg border border-neutral-700 bg-neutral-900 p-6 text-neutral-100 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h2 className="text-lg font-semibold tracking-wide">
            {isEditing ? `Edit Character: ${character?.name}` : 'Add New Character'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-4">
            {/* Character ID */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
                Character ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                data-testid="input-char-id"
                disabled={isEditing}
                value={charId}
                onChange={(e) => {
                  setCharId(e.target.value);
                  if (errors.id) setErrors((prev) => ({ ...prev, id: undefined }));
                }}
                placeholder="e.g. alice"
                className={`mt-1 w-full rounded border px-3 py-2 text-sm font-mono focus:outline-none ${
                  isEditing
                    ? 'cursor-not-allowed border-neutral-800 bg-neutral-950/60 text-neutral-500'
                    : 'border-neutral-700 bg-neutral-950 text-white focus:border-neutral-400'
                }`}
              />
              {errors.id && (
                <p data-testid="error-char-id" className="mt-1 text-xs text-red-400">
                  {errors.id}
                </p>
              )}
              <span className="text-[11px] text-neutral-500">
                Identifier used in scripts (e.g. <code className="text-neutral-400">show alice.happy</code>)
              </span>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
                Display Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                data-testid="input-char-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="e.g. Alice Henderson"
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-neutral-400 focus:outline-none"
              />
              {errors.name && (
                <p data-testid="error-char-name" className="mt-1 text-xs text-red-400">
                  {errors.name}
                </p>
              )}
              <span className="text-[11px] text-neutral-500">Name shown in dialogue box</span>
            </div>
          </div>

          {/* 2-Way Color Picker */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
              Dialogue Name Color
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                data-testid="input-char-color-picker"
                value={color.startsWith('#') ? color : '#ffffff'}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-950 p-0.5"
              />
              <input
                type="text"
                data-testid="input-char-color-hex"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#ffffff"
                className="w-32 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm font-mono text-white focus:border-neutral-400 focus:outline-none"
              />
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded border border-neutral-800"
                style={{ color }}
              >
                {name || 'Preview Name'}
              </span>
            </div>
          </div>

          {/* Expression & Sprite Upload Manager */}
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400">
                Expressions & Sprites ({expressions.length})
              </label>

              {/* Bulk upload file input */}
              <label
                data-testid="char-bulk-dropzone"
                className="cursor-pointer inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 transition"
              >
                <ImageIcon size={14} />
                Bulk Upload Sprites
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  data-testid="input-char-sprite-files"
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </label>
            </div>

            {expressions.length === 0 ? (
              <div className="rounded border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-500">
                No expression sprites added yet. Click "Bulk Upload Sprites" or select files above.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {expressions.map((expr, idx) => (
                  <div
                    key={expr.id}
                    className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/60 p-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center">
                        <img
                          src={expr.assetRefOrBlob}
                          alt={expr.key}
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">Key:</span>
                        <input
                          type="text"
                          data-testid={`input-expr-name-${idx}`}
                          value={expr.key}
                          onChange={(e) => handleUpdateExprKey(expr.id, e.target.value)}
                          placeholder="e.g. smile"
                          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDefaultExpr(expr.key)}
                        className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                          defaultExpr === expr.key
                            ? 'bg-white text-neutral-950 font-bold'
                            : 'border border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {defaultExpr === expr.key ? 'Default' : 'Set Default'}
                      </button>

                      <button
                        type="button"
                        data-testid={`btn-delete-expr-${idx}`}
                        onClick={() => handleDeleteExpr(expr.id)}
                        className="rounded p-1 text-neutral-400 hover:text-red-400 transition"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-800">
            <button
              type="button"
              data-testid="btn-cancel-character"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-save-character"
              className="rounded bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
            >
              {isEditing ? 'Save Changes' : 'Add Character'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
