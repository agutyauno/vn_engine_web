import React, { useState, useMemo } from 'react';
import type { Character } from '@vn-engine/shared-types';
import {
  EditIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UserIcon,
} from '../common/Icons';

export interface CharacterManagerPaneProps {
  characters: Character[];
  uncreatedIds?: string[];
  onCreateCharacter: (prefillId?: string) => void;
  onEditCharacter: (character: Character) => void;
  onDeleteCharacter: (characterId: string) => void;
}

export const CharacterManagerPane: React.FC<CharacterManagerPaneProps> = ({
  characters = [],
  uncreatedIds = [],
  onCreateCharacter,
  onEditCharacter,
  onDeleteCharacter,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const q = searchQuery.toLowerCase();
    return characters.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [characters, searchQuery]);

  return (
    <div
      data-testid="pane-characters"
      className="flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-900/60 select-none overflow-hidden"
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
        <button
          type="button"
          data-testid="btn-add-character"
          onClick={() => onCreateCharacter()}
          title="Create New Character"
          className="flex h-6 w-6 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
        >
          <PlusIcon size={12} />
        </button>
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {uncreatedIds.map((id) => (
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
          /* Character Cards List */
          <div className="p-2 space-y-1.5">
            {filteredCharacters.map((char) => {
              const defaultKey = char.defaultExpression || 'default';
              const avatarUrl =
                char.sprites?.[defaultKey] || Object.values(char.sprites || {})[0];
              const spriteCount = Object.keys(char.sprites || {}).length;

              return (
                <div
                  key={char.id}
                  data-testid={`character-card-${char.id}`}
                  className="group relative flex items-center justify-between rounded border border-neutral-800/80 bg-neutral-900/50 p-2 text-xs transition hover:border-neutral-700 hover:bg-neutral-800/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Avatar Preview */}
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={char.name}
                        data-testid={`char-avatar-${char.id}`}
                        className="h-8 w-8 rounded border border-neutral-700 bg-neutral-950 object-cover shrink-0"
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
                      data-testid={`btn-edit-char-${char.id}`}
                      onClick={() => onEditCharacter(char)}
                      title="Edit Character"
                      className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-neutral-600 hover:text-white transition"
                    >
                      <EditIcon size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid={`btn-delete-char-${char.id}`}
                      onClick={() => onDeleteCharacter(char.id)}
                      title="Delete Character"
                      className="rounded border border-neutral-800 bg-neutral-800/80 p-1 text-neutral-400 hover:border-red-900/50 hover:bg-red-950/40 hover:text-red-400 transition"
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
  );
};
