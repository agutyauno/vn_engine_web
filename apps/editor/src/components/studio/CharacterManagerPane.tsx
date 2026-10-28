import React from 'react';
import type { Character } from '@vn-engine/shared-types';
import { PlusIcon, TrashIcon } from '../common/Icons';

interface CharacterManagerPaneProps {
  characters: Character[];
  onAddCharacter: () => void;
  onEditCharacter: (character: Character) => void;
  onDeleteCharacter: (characterId: string) => void;
}

export const CharacterManagerPane: React.FC<CharacterManagerPaneProps> = ({
  characters,
  onAddCharacter,
  onEditCharacter,
  onDeleteCharacter,
}) => {
  return (
    <div
      data-testid="pane-character-manager"
      className="flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-900/60 text-neutral-300 select-none shrink-0"
    >
      {/* Pane Header */}
      <div className="flex h-10 items-center justify-between border-b border-neutral-800 px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Characters ({characters.length})
        </span>
        <button
          type="button"
          data-testid="btn-add-character"
          onClick={onAddCharacter}
          title="Add New Character"
          className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Character List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {characters.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            No characters added yet. Click + to add your first character.
          </div>
        ) : (
          characters.map((char) => {
            const exprCount = Object.keys(char.sprites || {}).length;
            const exprLabel = `${exprCount} expression${exprCount === 1 ? '' : 's'}`;

            return (
              <div
                key={char.id}
                data-testid={`char-item-${char.id}`}
                className="group flex flex-col rounded border border-neutral-800 bg-neutral-900/80 p-2.5 transition hover:border-neutral-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-black/40"
                      style={{ backgroundColor: char.colorHex || '#fff' }}
                      title={`Dialogue Color: ${char.colorHex}`}
                    />
                    <span className="truncate text-xs font-semibold text-white">
                      {char.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      data-testid={`btn-edit-char-${char.id}`}
                      onClick={() => onEditCharacter(char)}
                      title="Edit Character"
                      className="rounded p-1 text-neutral-400 hover:text-white"
                    >
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      data-testid={`btn-delete-char-${char.id}`}
                      onClick={() => onDeleteCharacter(char.id)}
                      title="Delete Character"
                      className="rounded p-1 text-neutral-400 hover:text-red-400"
                    >
                      <TrashIcon size={12} />
                    </button>
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                  <span>id: {char.id}</span>
                  <span className="text-neutral-400 font-sans">{exprLabel}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
