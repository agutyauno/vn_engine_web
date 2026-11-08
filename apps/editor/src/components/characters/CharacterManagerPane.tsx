import React, { useState, useMemo } from 'react';
import type { AssetRef, Character, Project } from '@vn-engine/shared-types';
import { useEditorUIStore } from '../../core/stores/uiStore';
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  GridIcon,
  ImageIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UserIcon,
} from '../common/Icons';
import { ImageLightboxModal } from '../common/ImageLightboxModal';
import {
  checkCharacterDeletionSafety,
  type ScriptReference,
} from '../../core/services/reconciliation';

export interface CharacterManagerPaneProps {
  characters: Character[];
  assets?: AssetRef[];
  uncreatedIds?: string[];
  project?: Project;
  onCreateCharacter: (prefillId?: string) => void;
  onEditCharacter: (character: Character) => void;
  onDeleteCharacter: (characterId: string) => void;
  onInsertSnippet?: (snippet: string) => void;
}

export const CharacterManagerPane: React.FC<CharacterManagerPaneProps> = ({
  characters = [],
  assets = [],
  uncreatedIds = [],
  project,
  onCreateCharacter,
  onEditCharacter,
  onDeleteCharacter,
  onInsertSnippet,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteChar, setPendingDeleteChar] = useState<{
    char: Character;
    references: ScriptReference[];
  } | null>(null);

  const handleDeleteCharacterClick = (char: Character) => {
    if (project) {
      const safety = checkCharacterDeletionSafety(char.id, project);
      if (!safety.safe) {
        setPendingDeleteChar({ char, references: safety.references });
        return;
      }
    }
    onDeleteCharacter(char.id);
  };
  const [expandedCharIds, setExpandedCharIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  const characterViewMode = useEditorUIStore(s => s.characterViewMode);
  const setCharacterViewMode = useEditorUIStore(s => s.setCharacterViewMode);

  // Map assets by ID and Name for fast sprite resolution
  const assetMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assets) {
      if (a.storageUrl) {
        map.set(a.id, a.storageUrl);
        map.set(a.name, a.storageUrl);
      }
    }
    return map;
  }, [assets]);

  const resolveSpriteUrl = (spriteRef?: string): string | undefined => {
    if (!spriteRef) return undefined;
    if (
      spriteRef.startsWith('data:') ||
      spriteRef.startsWith('http://') ||
      spriteRef.startsWith('https://') ||
      spriteRef.startsWith('/') ||
      spriteRef.startsWith('blob:')
    ) {
      return spriteRef;
    }
    return assetMap.get(spriteRef);
  };

  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const q = searchQuery.toLowerCase();
    return characters.filter(
      c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [characters, searchQuery]);

  const toggleAccordion = (charId: string) => {
    setExpandedCharIds(prev => ({
      ...prev,
      [charId]: !prev[charId],
    }));
  };

  const handleCopy = (key: string, snippet: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(snippet);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey(curr => (curr === key ? null : curr));
      }, 1500);
    }
  };

  const handleInsert = (snippet: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onInsertSnippet?.(snippet);
  };

  return (
    <div
      data-testid="pane-characters"
      className="flex h-full flex-1 min-w-0 w-auto flex-col border-r border-neutral-800 bg-neutral-900/60 select-none overflow-hidden"
    >
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-neutral-800 px-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs tracking-wider uppercase text-neutral-300">
            Characters
          </span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400">
            {characters.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded border border-neutral-800 bg-neutral-950/60 p-0.5">
            <button
              type="button"
              aria-label="List view"
              title="List view"
              draggable={false}
              onClick={() => setCharacterViewMode('list')}
              className={`flex h-5 w-5 items-center justify-center rounded transition ${
                characterViewMode === 'list'
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
              onClick={() => setCharacterViewMode('grid')}
              className={`flex h-5 w-5 items-center justify-center rounded transition ${
                characterViewMode === 'grid'
                  ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <GridIcon size={12} />
            </button>
          </div>

          {/* Add Character Button */}
          <button
            type="button"
            data-testid="btn-add-character"
            onClick={() => onCreateCharacter()}
            title="Create New Character"
            draggable={false}
            className="flex h-6 w-6 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
          >
            <PlusIcon size={12} />
          </button>
        </div>
      </div>

      {/* Search Input (visible if there are characters) */}
      {characters.length > 0 && (
        <div className="p-2 border-b border-neutral-800/80 shrink-0">
          <div className="relative flex items-center">
            <span className="absolute left-2.5 text-neutral-500 pointer-events-none">
              <SearchIcon size={12} />
            </span>
            <input
              type="text"
              data-testid="input-search-characters"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter characters..."
              className="w-full rounded border border-neutral-800 bg-neutral-950/80 py-1 pl-7 pr-2 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-neutral-700 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Uncreated IDs warnings */}
        {uncreatedIds && uncreatedIds.length > 0 && (
          <div className="p-2 space-y-1.5 border-b border-neutral-800/80 bg-amber-500/5 shrink-0">
            <div className="flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              <span>AST Detected Uncreated</span>
            </div>
            {uncreatedIds.map(id => (
              <div
                key={id}
                data-testid={`uncreated-character-${id}`}
                className="flex items-center justify-between rounded border border-amber-500/30 bg-neutral-900/90 p-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-mono text-amber-300 border border-amber-500/30">
                    Uncreated
                  </span>
                  <span className="truncate font-mono text-neutral-200">{id}</span>
                </div>
                <button
                  type="button"
                  data-testid={`btn-quickfix-character-${id}`}
                  onClick={() => onCreateCharacter(id)}
                  title="Quick Fix: Create Character"
                  draggable={false}
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/20 transition shrink-0"
                >
                  Create
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {characters.length === 0 ? (
          <div
            data-testid="pane-character-empty"
            className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-neutral-500"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/80 text-neutral-500 mb-3">
              <UserIcon size={24} />
            </div>
            <span className="font-medium text-neutral-300">No characters yet</span>
            <p className="mt-1 text-[11px] text-neutral-500 max-w-[180px]">
              Create your first character to manage dialogues and sprites.
            </p>
            <button
              type="button"
              data-testid="btn-add-character-empty"
              onClick={() => onCreateCharacter()}
              draggable={false}
              className="mt-4 flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
            >
              <PlusIcon size={12} />
              <span>New Character</span>
            </button>
          </div>
        ) : filteredCharacters.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-500">
            No characters matching "{searchQuery}"
          </div>
        ) : (
          /* Character Cards Container */
          <div
            data-testid="char-list-container"
            data-view-mode={characterViewMode}
            className={
              characterViewMode === 'grid'
                ? 'grid grid-cols-2 gap-2 p-2'
                : 'p-2 space-y-1.5'
            }
          >
            {filteredCharacters.map(char => {
              const defaultKey = char.defaultExpression || 'default';
              const rawAvatarRef =
                char.sprites?.[defaultKey] || Object.values(char.sprites || {})[0];
              const resolvedAvatarUrl = resolveSpriteUrl(rawAvatarRef);
              const spriteCount = Object.keys(char.sprites || {}).length;
              const isExpanded = !!expandedCharIds[char.id];
              const isCharCopied = copiedKey === `char-${char.id}`;

              if (characterViewMode === 'grid') {
                return (
                  <div
                    key={char.id}
                    data-testid={`character-card-${char.id}`}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', `show ${char.id}\n`);
                    }}
                    onClick={() => onEditCharacter(char)}
                    className="group relative flex flex-col rounded-lg border bg-neutral-900/70 p-2 text-xs transition cursor-pointer hover:border-neutral-600 hover:bg-neutral-850"
                    style={{ borderColor: char.colorHex ? `${char.colorHex}66` : '#38bdf844' }}
                  >
                    {/* Large Avatar Thumbnail */}
                    <div className="relative aspect-square w-full rounded overflow-hidden bg-neutral-950 border border-neutral-800 mb-2 flex items-center justify-center">
                      {resolvedAvatarUrl ? (
                        <img
                          src={resolvedAvatarUrl}
                          alt={char.name}
                          data-testid={`char-avatar-${char.id}`}
                          loading="lazy"
                          draggable={false}
                          onClick={e => {
                            e.stopPropagation();
                            setPreviewImage({
                              url: resolvedAvatarUrl,
                              title: `${char.name || char.id} (Default)`,
                              subtitle: char.id,
                            });
                          }}
                          className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition"
                        />
                      ) : (
                        <div
                          data-testid={`char-avatar-fallback-${char.id}`}
                          className="flex h-full w-full items-center justify-center text-xl font-bold text-neutral-300"
                          style={{ color: char.colorHex || '#38bdf8' }}
                        >
                          {(char.name || char.id).charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Expressions badge */}
                      <span
                        data-testid={`char-expressions-count-${char.id}`}
                        className="absolute bottom-1 right-1 rounded bg-neutral-900/90 px-1 py-0.5 text-[9px] font-mono text-neutral-400 border border-neutral-800 pointer-events-none"
                      >
                        {spriteCount} {spriteCount === 1 ? 'expr' : 'exprs'}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1">
                        {char.colorHex && (
                          <span
                            data-testid={`char-color-badge-${char.id}`}
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: char.colorHex }}
                            title={char.colorHex}
                          />
                        )}
                        <span
                          data-testid={`char-name-${char.id}`}
                          className="truncate font-medium text-neutral-200"
                        >
                          {char.name || char.id}
                        </span>
                      </div>
                      <span
                        data-testid={`char-id-${char.id}`}
                        className="truncate text-[10px] text-neutral-500 font-mono"
                      >
                        {char.id}
                      </span>
                    </div>

                    {/* Quick Action Overlay on hover */}
                    <div className="mt-2 flex items-center justify-between border-t border-neutral-800/60 pt-1.5 opacity-80 group-hover:opacity-100 transition">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`btn-copy-char-${char.id}`}
                          data-copied={isCharCopied ? 'true' : 'false'}
                          onClick={e => handleCopy(`char-${char.id}`, `show ${char.id}`, e)}
                          title="Copy DSL snippet"
                          draggable={false}
                          className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                        >
                          {isCharCopied ? (
                            <CheckIcon size={11} className="text-emerald-400" />
                          ) : (
                            <CopyIcon size={11} />
                          )}
                        </button>
                        {onInsertSnippet && (
                          <button
                            type="button"
                            data-testid={`btn-insert-char-${char.id}`}
                            onClick={e => handleInsert(`show ${char.id}`, e)}
                            title="Insert at cursor"
                            draggable={false}
                            className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                          >
                            <PlusIcon size={11} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`btn-edit-char-${char.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            onEditCharacter(char);
                          }}
                          title="Edit Character"
                          draggable={false}
                          className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                        >
                          <EditIcon size={11} />
                        </button>
                        <button
                          type="button"
                          data-testid={`btn-delete-char-${char.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteCharacterClick(char);
                          }}
                          title="Delete Character"
                          draggable={false}
                          className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-red-900/50 hover:bg-red-950/40 hover:text-red-400 transition"
                        >
                          <TrashIcon size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // List View Card (with Accordion)
              return (
                <div
                  key={char.id}
                  className="rounded border border-neutral-800/80 bg-neutral-900/50 text-xs transition hover:border-neutral-700"
                >
                  {/* Card Row */}
                  <div
                    data-testid={`character-card-${char.id}`}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', `show ${char.id}\n`);
                    }}
                    className="group relative flex items-center justify-between p-2 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Accordion Toggle Chevron */}
                      <button
                        type="button"
                        data-testid={`btn-accordion-${char.id}`}
                        onClick={e => {
                          e.stopPropagation();
                          toggleAccordion(char.id);
                        }}
                        title={isExpanded ? 'Collapse expressions' : 'Expand expressions'}
                        draggable={false}
                        className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon size={12} />
                        ) : (
                          <ChevronRightIcon size={12} />
                        )}
                      </button>

                      {/* Avatar Preview */}
                      {resolvedAvatarUrl ? (
                        <img
                          src={resolvedAvatarUrl}
                          alt={char.name}
                          data-testid={`char-avatar-${char.id}`}
                          loading="lazy"
                          draggable={false}
                          onClick={e => {
                            e.stopPropagation();
                            setPreviewImage({
                              url: resolvedAvatarUrl,
                              title: `${char.name || char.id} (Default)`,
                              subtitle: char.id,
                            });
                          }}
                          className="h-8 w-8 rounded border border-neutral-700 bg-neutral-950 object-cover shrink-0 cursor-pointer hover:opacity-90 transition"
                        />
                      ) : (
                        <div
                          data-testid={`char-avatar-fallback-${char.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300 shrink-0"
                          style={{ borderColor: char.colorHex || '#38bdf8' }}
                        >
                          {(char.name || char.id).charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            data-testid={`char-name-${char.id}`}
                            className="truncate font-medium text-neutral-200"
                          >
                            {char.name || char.id}
                          </span>
                          {char.colorHex && (
                            <span
                              data-testid={`char-color-badge-${char.id}`}
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: char.colorHex }}
                              title={char.colorHex}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-mono">
                          <span data-testid={`char-id-${char.id}`}>{char.id}</span>
                          <span>•</span>
                          <span data-testid={`char-expressions-count-${char.id}`}>
                            {spriteCount} {spriteCount === 1 ? 'expression' : 'expressions'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        data-testid={`btn-copy-char-${char.id}`}
                        data-copied={isCharCopied ? 'true' : 'false'}
                        onClick={e => handleCopy(`char-${char.id}`, `show ${char.id}`, e)}
                        title="Copy DSL snippet"
                        draggable={false}
                        className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                      >
                        {isCharCopied ? (
                          <CheckIcon size={12} className="text-emerald-400" />
                        ) : (
                          <CopyIcon size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid={`btn-insert-char-${char.id}`}
                        onClick={e => handleInsert(`show ${char.id}`, e)}
                        title="Insert at cursor"
                        draggable={false}
                        className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                      >
                        <PlusIcon size={12} />
                      </button>
                      <button
                        type="button"
                        data-testid={`btn-edit-char-${char.id}`}
                        onClick={e => {
                          e.stopPropagation();
                          onEditCharacter(char);
                        }}
                        title="Edit Character"
                        draggable={false}
                        className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                      >
                        <EditIcon size={12} />
                      </button>
                      <button
                        type="button"
                        data-testid={`btn-delete-char-${char.id}`}
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteCharacterClick(char);
                        }}
                        title="Delete Character"
                        draggable={false}
                        className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-red-900/50 hover:bg-red-950/40 hover:text-red-400 transition"
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Accordion Content: Child Expressions List */}
                  {isExpanded && (
                    <div
                      data-testid={`accordion-content-${char.id}`}
                      className="border-t border-neutral-800/80 bg-neutral-950/50 p-2 space-y-1"
                    >
                      {spriteCount === 0 ? (
                        <div className="py-1 text-center text-[10px] text-neutral-500 italic">
                          No expressions configured
                        </div>
                      ) : (
                        Object.entries(char.sprites || {}).map(([exprKey, spriteRef]) => {
                          const resolvedExprUrl = resolveSpriteUrl(spriteRef);
                          const isExprCopied = copiedKey === `expr-${char.id}-${exprKey}`;
                          const snippet = `show ${char.id}.${exprKey}`;

                          return (
                            <div
                              key={exprKey}
                              data-testid={`expr-item-${char.id}-${exprKey}`}
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.setData('text/plain', `${snippet}\n`);
                              }}
                              className="group/expr flex items-center justify-between rounded px-2 py-1 bg-neutral-900/40 border border-neutral-850 hover:border-neutral-750 hover:bg-neutral-850/60 transition cursor-grab active:cursor-grabbing"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {resolvedExprUrl ? (
                                  <img
                                    src={resolvedExprUrl}
                                    alt={exprKey}
                                    data-testid={`expr-img-${char.id}-${exprKey}`}
                                    loading="lazy"
                                    draggable={false}
                                    onClick={e => {
                                      e.stopPropagation();
                                      setPreviewImage({
                                        url: resolvedExprUrl,
                                        title: `${char.name || char.id} — ${exprKey}`,
                                        subtitle: exprKey,
                                      });
                                    }}
                                    className="h-6 w-6 rounded border border-neutral-700/80 bg-neutral-950 object-cover shrink-0 cursor-pointer hover:opacity-90 transition"
                                  />
                                ) : (
                                  <div
                                    data-testid={`expr-fallback-${char.id}-${exprKey}`}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-neutral-800 bg-neutral-900 text-neutral-500 shrink-0"
                                  >
                                    <ImageIcon size={12} />
                                  </div>
                                )}
                                <span className="font-mono text-[11px] text-neutral-300 truncate">
                                  {exprKey}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 opacity-70 group/expr:opacity-100 transition">
                                <button
                                  type="button"
                                  data-testid={`btn-copy-expr-${char.id}-${exprKey}`}
                                  data-copied={isExprCopied ? 'true' : 'false'}
                                  onClick={e =>
                                    handleCopy(`expr-${char.id}-${exprKey}`, snippet, e)
                                  }
                                  title="Copy expression snippet"
                                  draggable={false}
                                  className="rounded border border-neutral-800 bg-neutral-800/80 p-0.5 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                                >
                                  {isExprCopied ? (
                                    <CheckIcon size={10} className="text-emerald-400" />
                                  ) : (
                                    <CopyIcon size={10} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  data-testid={`btn-insert-expr-${char.id}-${exprKey}`}
                                  onClick={e => handleInsert(snippet, e)}
                                  title="Insert at cursor"
                                  draggable={false}
                                  className="rounded border border-neutral-800 bg-neutral-800/80 p-0.5 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                                >
                                  <PlusIcon size={10} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal Preview */}
      <ImageLightboxModal
        isOpen={previewImage !== null}
        imageUrl={previewImage?.url || null}
        title={previewImage?.title}
        subtitle={previewImage?.subtitle}
        zIndexClass="z-50"
        onClose={() => setPreviewImage(null)}
      />

      {/* Safe Delete Character Modal */}
      {pendingDeleteChar && (
        <div
          data-testid="safe-delete-character-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none"
        >
          <div className="flex w-full max-w-md flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon size={16} className="text-amber-400" />
                <span className="font-semibold text-sm tracking-wide text-neutral-200">
                  Delete Character (In Use)
                </span>
              </div>
              <button
                type="button"
                data-testid="btn-close-delete-character"
                onClick={() => setPendingDeleteChar(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="space-y-3">
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <p className="font-medium mb-1">
                    Deleting character &apos;{pendingDeleteChar.char.name || pendingDeleteChar.char.id}&apos;
                  </p>
                  <p className="text-neutral-300">
                    This character is currently referenced in script statements. Deleting this
                    character will cause uncreated character warnings.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Script References ({pendingDeleteChar.references.length})
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded border border-neutral-800 bg-neutral-950 p-2 space-y-1">
                    {pendingDeleteChar.references.map((ref, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded px-2 py-1 text-xs text-neutral-300 bg-neutral-900/60"
                      >
                        <span className="font-mono">{ref.file}</span>
                        <span className="font-mono text-neutral-400 text-[11px]">
                          Line {ref.line}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
              <button
                type="button"
                data-testid="btn-cancel-delete-character"
                onClick={() => setPendingDeleteChar(null)}
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-delete-character"
                onClick={() => {
                  onDeleteCharacter(pendingDeleteChar.char.id);
                  setPendingDeleteChar(null);
                }}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition"
              >
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
