// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project, AssetRef, Character, ScriptFile } from '@vn-engine/shared-types';
import { SafeDeleteModal } from '../../src/components/studio/SafeDeleteModal';
import {
  CharacterManagerPane,
  type CharacterManagerPaneProps,
} from '../../src/components/characters/CharacterManagerPane';
import * as reconciliationModule from '../../src/core/services/reconciliation';
import {
  checkAssetDeletionSafety,
  type DeletionSafetyResult,
} from '../../src/core/services/reconciliation';

// Dynamically resolve checkCharacterDeletionSafety to allow clean module loading
// in RED phase before the function is exported in Phase 2.2 GREEN.
const checkCharacterDeletionSafety = (
  reconciliationModule as unknown as {
    checkCharacterDeletionSafety?: (
      characterId: string,
      project: Project,
    ) => DeletionSafetyResult;
  }
).checkCharacterDeletionSafety;

// Helper type to accommodate upcoming 'project' prop on CharacterManagerPane in Phase 2.2
type CharacterManagerPaneWithProject = React.ComponentType<
  CharacterManagerPaneProps & { project?: Project }
>;
const CharacterManagerPaneComponent =
  CharacterManagerPane as unknown as CharacterManagerPaneWithProject;

function createMockProject(options?: {
  assets?: AssetRef[];
  characters?: Character[];
  files?: ScriptFile[];
}): Project {
  return {
    id: 'test-proj-safe-delete',
    title: 'Safe Delete Unblock Test Project',
    version: 1,
    ownerId: 'test-user',
    defaultLanguage: 'vi',
    files: options?.files ?? [
      {
        id: 'file-chap1',
        name: 'chapter1.vns',
        order: 0,
        version: 1,
        content: `
scene "bg_classroom.png"
show alice.happy
"Alice" "Xin chào buổi sáng!"
`,
      },
      {
        id: 'file-chap2',
        name: 'chapter2.vns',
        order: 1,
        version: 1,
        content: `
scene "bg_school.png"
show alice.smile
show bob.default
"Alice" "Lại mưa rồi."
`,
      },
    ],
    characters: options?.characters ?? [
      {
        id: 'alice',
        name: 'Alice Carroll',
        colorHex: '#e91e63',
        defaultExpression: 'happy',
        sprites: {
          happy: 'char_alice_happy.png',
          smile: 'char_alice_smile.png',
        },
      },
      {
        id: 'bob',
        name: 'Bob Smith',
        colorHex: '#3b82f6',
        defaultExpression: 'default',
        sprites: {
          default: 'char_bob_default.png',
        },
      },
      {
        id: 'charlie',
        name: 'Charlie Unused',
        colorHex: '#10b981',
        defaultExpression: 'neutral',
        sprites: {
          neutral: 'char_charlie_neutral.png',
        },
      },
    ],
    assets: options?.assets ?? [
      {
        id: 'ast-bg-class',
        name: 'bg_classroom.png',
        type: 'image',
        category: 'background',
        storageUrl: 'blob:bg-classroom',
        sizeBytes: 102400,
      },
      {
        id: 'ast-bg-school',
        name: 'bg_school.png',
        type: 'image',
        category: 'background',
        storageUrl: 'blob:bg-school',
        sizeBytes: 204800,
      },
      {
        id: 'ast-char-alice-happy',
        name: 'char_alice_happy.png',
        type: 'image',
        category: 'sprite',
        storageUrl: 'blob:char-alice-happy',
        sizeBytes: 81920,
      },
      {
        id: 'ast-char-alice-smile',
        name: 'char_alice_smile.png',
        type: 'image',
        category: 'sprite',
        storageUrl: 'blob:char-alice-smile',
        sizeBytes: 81920,
      },
      {
        id: 'ast-unused',
        name: 'unused_bg.png',
        type: 'image',
        category: 'background',
        storageUrl: 'blob:unused',
        sizeBytes: 65536,
      },
    ],
    variables: [],
    uiScreens: [],
    customScripts: [],
  };
}

describe('Phase 2.2: Safe Delete Unblock (RED)', () => {
  let sampleProject: Project;

  beforeEach(() => {
    sampleProject = createMockProject();
  });

  // ========================================================================
  // TC-DEL-01: Asset Safe Delete Unblocked (SafeDeleteModal)
  // ========================================================================
  describe('TC-DEL-01: Asset Safe Delete Unblocked', () => {
    it('renders "Delete Anyway" label and is NOT disabled when asset has script references (isBlocked = true)', () => {
      const targetAsset = sampleProject.assets.find(a => a.name === 'bg_school.png')!;
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={targetAsset}
          project={sampleProject}
          onClose={handleClose}
          onConfirmDelete={handleConfirm}
        />,
      );

      // Modal container should be in document
      expect(screen.getByTestId('safe-delete-modal')).toBeInTheDocument();

      // Script reference list must be displayed
      expect(screen.getByText(/chapter2.vns/i)).toBeInTheDocument();

      // Confirm button must NOT be disabled and have label "Delete Anyway"
      const confirmBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(confirmBtn).toHaveTextContent(/Delete Anyway/i);
      expect(confirmBtn).not.toBeDisabled();
    });

    it('renders "Cancel" button and displays warning state', () => {
      const targetAsset = sampleProject.assets.find(a => a.name === 'bg_school.png')!;
      const handleClose = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={targetAsset}
          project={sampleProject}
          onClose={handleClose}
          onConfirmDelete={vi.fn()}
        />,
      );

      const cancelBtn = screen.getByTestId('btn-cancel-safe-delete');
      expect(cancelBtn).toBeInTheDocument();
      expect(cancelBtn).toHaveTextContent(/Cancel/i);
    });
  });

  // ========================================================================
  // TC-DEL-02: Asset Delete Anyway Click
  // ========================================================================
  describe('TC-DEL-02: Asset Delete Anyway Click', () => {
    it('calls onConfirmDelete with target asset when clicking "Delete Anyway"', () => {
      const targetAsset = sampleProject.assets.find(a => a.name === 'bg_school.png')!;
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={targetAsset}
          project={sampleProject}
          onClose={handleClose}
          onConfirmDelete={handleConfirm}
        />,
      );

      const confirmBtn = screen.getByTestId('btn-confirm-delete-asset');
      fireEvent.click(confirmBtn);

      expect(handleConfirm).toHaveBeenCalledTimes(1);
      expect(handleConfirm).toHaveBeenCalledWith(targetAsset);
    });
  });

  // ========================================================================
  // TC-DEL-03: Character Safety Check Function (checkCharacterDeletionSafety)
  // ========================================================================
  describe('TC-DEL-03: Character Safety Check Function', () => {
    it('is exported as a function from reconciliation service', () => {
      expect(typeof checkCharacterDeletionSafety).toBe('function');
    });

    it('returns { safe: false, references } when character is referenced in script ("show alice")', () => {
      expect(typeof checkCharacterDeletionSafety).toBe('function');
      const result = checkCharacterDeletionSafety!('alice', sampleProject);

      expect(result.safe).toBe(false);
      expect(result.references.length).toBeGreaterThanOrEqual(1);
      expect(result.references.some(r => r.file === 'chapter1.vns' || r.file === 'chapter2.vns')).toBe(true);
    });

    it('handles case-insensitivity and whitespace trimming for character id', () => {
      expect(typeof checkCharacterDeletionSafety).toBe('function');
      const result = checkCharacterDeletionSafety!('  ALICE  ', sampleProject);

      expect(result.safe).toBe(false);
      expect(result.references.length).toBeGreaterThanOrEqual(1);
    });

    it('returns { safe: true, references: [] } when character is not referenced in scripts', () => {
      expect(typeof checkCharacterDeletionSafety).toBe('function');
      // charlie is defined in characters but never used in chapter1.vns or chapter2.vns
      const result = checkCharacterDeletionSafety!('charlie', sampleProject);

      expect(result.safe).toBe(true);
      expect(result.references).toHaveLength(0);
    });

    it('returns { safe: true, references: [] } for empty or whitespace character id', () => {
      expect(typeof checkCharacterDeletionSafety).toBe('function');
      const result = checkCharacterDeletionSafety!('   ', sampleProject);

      expect(result.safe).toBe(true);
      expect(result.references).toHaveLength(0);
    });
  });

  // ========================================================================
  // TC-DEL-04: Character Delete Confirmation Modal in CharacterManagerPane
  // ========================================================================
  describe('TC-DEL-04: Character Delete Confirmation Modal in CharacterManagerPane', () => {
    it('opens safe-delete-character-modal with "Delete Anyway" when deleting character in use', () => {
      const handleDeleteCharacter = vi.fn();

      render(
        <CharacterManagerPaneComponent
          characters={sampleProject.characters}
          assets={sampleProject.assets}
          onCreateCharacter={vi.fn()}
          onEditCharacter={vi.fn()}
          onDeleteCharacter={handleDeleteCharacter}
          project={sampleProject}
        />,
      );

      // alice is used in script
      const deleteAliceBtn = screen.getByTestId('btn-delete-char-alice');
      fireEvent.click(deleteAliceBtn);

      // Deletion should NOT be performed immediately
      expect(handleDeleteCharacter).not.toHaveBeenCalled();

      // Safe delete confirmation modal must open
      const modal = screen.getByTestId('safe-delete-character-modal');
      expect(modal).toBeInTheDocument();

      // Must display reference details
      expect(screen.getByText(/chapter1.vns/i)).toBeInTheDocument();

      // Confirm button must have label "Delete Anyway" and be enabled
      const confirmBtn = screen.getByTestId('btn-confirm-delete-character');
      expect(confirmBtn).toHaveTextContent(/Delete Anyway/i);
      expect(confirmBtn).not.toBeDisabled();
    });

    it('calls onDeleteCharacter when clicking "Delete Anyway" in modal and closes modal', () => {
      const handleDeleteCharacter = vi.fn();

      render(
        <CharacterManagerPaneComponent
          characters={sampleProject.characters}
          assets={sampleProject.assets}
          onCreateCharacter={vi.fn()}
          onEditCharacter={vi.fn()}
          onDeleteCharacter={handleDeleteCharacter}
          project={sampleProject}
        />,
      );

      // Trigger delete on in-use character
      fireEvent.click(screen.getByTestId('btn-delete-char-alice'));

      const confirmBtn = screen.getByTestId('btn-confirm-delete-character');
      fireEvent.click(confirmBtn);

      expect(handleDeleteCharacter).toHaveBeenCalledTimes(1);
      expect(handleDeleteCharacter).toHaveBeenCalledWith('alice');

      // Modal must be closed
      expect(screen.queryByTestId('safe-delete-character-modal')).not.toBeInTheDocument();
    });

    it('cancels deletion and closes modal without calling onDeleteCharacter when clicking Cancel', () => {
      const handleDeleteCharacter = vi.fn();

      render(
        <CharacterManagerPaneComponent
          characters={sampleProject.characters}
          assets={sampleProject.assets}
          onCreateCharacter={vi.fn()}
          onEditCharacter={vi.fn()}
          onDeleteCharacter={handleDeleteCharacter}
          project={sampleProject}
        />,
      );

      fireEvent.click(screen.getByTestId('btn-delete-char-alice'));

      const cancelBtn = screen.getByTestId('btn-cancel-delete-character');
      fireEvent.click(cancelBtn);

      expect(handleDeleteCharacter).not.toHaveBeenCalled();
      expect(screen.queryByTestId('safe-delete-character-modal')).not.toBeInTheDocument();
    });

    it('directly calls onDeleteCharacter without opening modal when character is not referenced', () => {
      const handleDeleteCharacter = vi.fn();

      render(
        <CharacterManagerPaneComponent
          characters={sampleProject.characters}
          assets={sampleProject.assets}
          onCreateCharacter={vi.fn()}
          onEditCharacter={vi.fn()}
          onDeleteCharacter={handleDeleteCharacter}
          project={sampleProject}
        />,
      );

      // charlie is not used in any scripts
      const deleteCharlieBtn = screen.getByTestId('btn-delete-char-charlie');
      fireEvent.click(deleteCharlieBtn);

      expect(handleDeleteCharacter).toHaveBeenCalledTimes(1);
      expect(handleDeleteCharacter).toHaveBeenCalledWith('charlie');
      expect(screen.queryByTestId('safe-delete-character-modal')).not.toBeInTheDocument();
    });
  });

  // ========================================================================
  // TC-DEL-05: Asset Used in Character Sprite Safety Check
  // ========================================================================
  describe('TC-DEL-05: Asset Used in Character Sprite Safety Check', () => {
    it('returns { safe: false, references } when asset is not in script but used in character.sprites', () => {
      // Create project where char_alice_happy.png is in character.sprites.happy,
      // but NOT mentioned anywhere in script files
      const projectWithSpriteOnly = createMockProject({
        files: [
          {
            id: 'file-empty',
            name: 'main.vns',
            order: 0,
            version: 1,
            content: `
scene "bg_classroom.png"
"Narrator" "Chỉ có nền và thoại, không gọi sprite."
`,
          },
        ],
        characters: [
          {
            id: 'alice',
            name: 'Alice Carroll',
            defaultExpression: 'happy',
            sprites: {
              happy: 'char_alice_happy.png',
            },
          },
        ],
        assets: [
          {
            id: 'ast-char-alice-happy',
            name: 'char_alice_happy.png',
            type: 'image',
            category: 'sprite',
          },
        ],
      });

      const result = checkAssetDeletionSafety('char_alice_happy.png', projectWithSpriteOnly);

      expect(result.safe).toBe(false);
      expect(result.references.length).toBeGreaterThanOrEqual(1);
      expect(
        result.references.some(r => r.file.includes('Alice') || r.file.includes('alice')),
      ).toBe(true);
    });

    it('returns { safe: true, references: [] } when asset is neither in scripts nor in character sprites', () => {
      const project = createMockProject({
        files: [
          {
            id: 'file-main',
            name: 'main.vns',
            order: 0,
            version: 1,
            content: 'scene "bg_classroom.png"\n',
          },
        ],
        characters: [],
        assets: [
          {
            id: 'ast-lonely',
            name: 'lonely_asset.png',
            type: 'image',
          },
        ],
      });

      const result = checkAssetDeletionSafety('lonely_asset.png', project);

      expect(result.safe).toBe(true);
      expect(result.references).toHaveLength(0);
    });
  });
});
