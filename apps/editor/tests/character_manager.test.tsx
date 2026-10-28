// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Character, Project } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../src/core/contracts/repository';
import { CharacterModal } from '../src/components/characters/CharacterModal';
import { CharacterManagerPane } from '../src/components/characters/CharacterManagerPane';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';

describe('Milestone 4: Character & Sprite Manager', () => {
  const originalFileReader = window.FileReader;

  beforeEach(() => {
    // Setup Mock FileReader for JSDOM
    class MockFileReader {
      result: string | null = null;
      onload: ((e: { target: MockFileReader }) => void) | null = null;
      onerror: ((e: { target: MockFileReader }) => void) | null = null;

      readAsDataURL(file: File) {
        setTimeout(() => {
          this.result = `data:${file.type || 'image/png'};base64,mock_${file.name.replace(/\.[^/.]+$/, '')}`;
          if (this.onload) {
            this.onload({ target: this });
          }
        }, 0);
      }
    }
    // @ts-expect-error Mocking FileReader for testing
    window.FileReader = MockFileReader;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.FileReader = originalFileReader;
  });

  // --------------------------------------------------------------------------
  // UT-EDT-02: Separate ID vs Display Name & ID Uniqueness
  // --------------------------------------------------------------------------
  describe('UT-EDT-02: Character ID vs Display Name & Uniqueness', () => {
    it('allows distinct technical ID and Display Name and enforces ID uniqueness', () => {
      const handleSave = vi.fn();
      const existingIds = ['alice', 'bob'];

      render(
        <CharacterModal
          isOpen={true}
          existingIds={existingIds}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const idInput = screen.getByTestId('input-char-id');
      const nameInput = screen.getByTestId('input-char-name');
      const saveBtn = screen.getByTestId('btn-save-character');

      // Attempt duplicate ID
      fireEvent.change(idInput, { target: { value: 'alice' } });
      fireEvent.change(nameInput, { target: { value: 'Alice Carroll' } });

      expect(screen.getByText("Character ID 'alice' already exists")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Check case-insensitive duplicate ID
      fireEvent.change(idInput, { target: { value: 'ALICE' } });
      expect(screen.getByText("Character ID 'alice' already exists")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Enter unique ID
      fireEvent.change(idInput, { target: { value: 'clara' } });
      fireEvent.change(nameInput, { target: { value: 'Clara Oswald' } });

      expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();

      fireEvent.click(saveBtn);
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'clara',
          name: 'Clara Oswald',
        })
      );
    });

    it('validates Character ID format (^[a-zA-Z0-9_]+$)', () => {
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id');
      const saveBtn = screen.getByTestId('btn-save-character');

      fireEvent.change(idInput, { target: { value: 'invalid-id with spaces!' } });
      expect(
        screen.getByText('Character ID must contain only letters, numbers, and underscores')
      ).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();
    });
  });

  // --------------------------------------------------------------------------
  // IT-EDT-06: Character ID Edit Locking
  // --------------------------------------------------------------------------
  describe('IT-EDT-06: Character ID Edit Locking', () => {
    it('locks Character ID field in edit mode to preserve script references', () => {
      const existingChar: Character = {
        id: 'elena',
        name: 'Elena Gilbert',
        colorHex: '#38bdf8',
        defaultExpression: 'smile',
        sprites: { smile: 'data:image/png;base64,smile' },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={existingChar}
          existingIds={['elena']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id') as HTMLInputElement;
      expect(idInput).toBeDisabled();
      expect(idInput.value).toBe('elena');

      // Display name and other fields remain editable
      const nameInput = screen.getByTestId('input-char-name') as HTMLInputElement;
      expect(nameInput).not.toBeDisabled();
      fireEvent.change(nameInput, { target: { value: 'Elena Salvatore' } });
      expect(nameInput.value).toBe('Elena Salvatore');
    });
  });

  // --------------------------------------------------------------------------
  // IT-EDT-03: Two-Way HEX Color Picker Synchronization
  // --------------------------------------------------------------------------
  describe('IT-EDT-03: Two-Way HEX Color Picker Sync', () => {
    it('synchronizes text input, native color picker, swatches, and live nameplate preview', () => {
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const hexInput = screen.getByTestId('input-char-color-hex') as HTMLInputElement;
      const colorPicker = screen.getByTestId('input-char-color-picker') as HTMLInputElement;
      const nameplate = screen.getByTestId('nameplate-preview');

      // 1. Text input -> Native picker & preview
      fireEvent.change(hexInput, { target: { value: '#ec4899' } });
      expect(colorPicker.value).toBe('#ec4899');
      expect(nameplate).toHaveStyle({ color: '#ec4899' });

      // Auto-prepending '#'
      fireEvent.change(hexInput, { target: { value: '10b981' } });
      expect(colorPicker.value).toBe('#10b981');
      expect(nameplate).toHaveStyle({ color: '#10b981' });

      // Shorthand #fff -> #ffffff
      fireEvent.change(hexInput, { target: { value: '#fff' } });
      expect(colorPicker.value).toBe('#ffffff');
      expect(nameplate).toHaveStyle({ color: '#ffffff' });

      // 2. Native picker -> Text input & preview
      fireEvent.change(colorPicker, { target: { value: '#f59e0b' } });
      expect(hexInput.value).toBe('#f59e0b');
      expect(nameplate).toHaveStyle({ color: '#f59e0b' });

      // 3. Preset color swatches
      const swatchPurple = screen.getByTestId('color-swatch-#a855f7');
      fireEvent.click(swatchPurple);
      expect(hexInput.value).toBe('#a855f7');
      expect(colorPicker.value).toBe('#a855f7');
      expect(nameplate).toHaveStyle({ color: '#a855f7' });
    });
  });

  // --------------------------------------------------------------------------
  // UT-EDT-09: Bulk Expression Dropzone
  // --------------------------------------------------------------------------
  describe('UT-EDT-09: Bulk Expression Dropzone', () => {
    it('extracts expression keys from file input and strips file extensions & character prefixes', async () => {
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id');
      fireEvent.change(idInput, { target: { value: 'elena' } });

      const fileInput = screen.getByTestId('input-char-sprite-files');

      const file1 = new File(['dummy1'], 'elena_smile.png', { type: 'image/png' });
      const file2 = new File(['dummy2'], 'angry.webp', { type: 'image/webp' });

      fireEvent.change(fileInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('smile')).toBeInTheDocument();
        expect(screen.getByDisplayValue('angry')).toBeInTheDocument();
      });

      // Default radio should automatically be active on the first expression
      const defaultRadio0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      expect(defaultRadio0.checked).toBe(true);
    });

    it('handles dragover, dragleave, and drop on #char-bulk-dropzone', async () => {
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const dropzone = screen.getByTestId('char-bulk-dropzone');

      fireEvent.dragOver(dropzone);
      expect(dropzone.className).toContain('border-neutral-400');

      fireEvent.dragLeave(dropzone);
      expect(dropzone.className).not.toContain('border-neutral-400');

      const file = new File(['dummy'], 'surprised.png', { type: 'image/png' });
      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('surprised')).toBeInTheDocument();
      });
    });

    it('filters out non-image files and displays warning', async () => {
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const fileInput = screen.getByTestId('input-char-sprite-files');
      const nonImage = new File(['text'], 'notes.txt', { type: 'text/plain' });

      fireEvent.change(fileInput, {
        target: { files: [nonImage] },
      });

      await waitFor(() => {
        expect(screen.getByText(/Skipped non-image file: notes.txt/)).toBeInTheDocument();
      });
      expect(screen.queryByDisplayValue('notes')).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // UT-EDT-08: Single File Upload & Row Sprite Management
  // --------------------------------------------------------------------------
  describe('UT-EDT-08: Single File Upload & Row Sprite Management', () => {
    it('allows adding an expression row and uploading a single image to Base64 thumbnail', async () => {
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      // Add empty expression row
      const addRowBtn = screen.getByTestId('btn-add-expr-row');
      fireEvent.click(addRowBtn);

      const keyInput = screen.getByTestId('input-expr-key-0') as HTMLInputElement;
      fireEvent.change(keyInput, { target: { value: 'happy' } });

      // Single file upload on row 0
      const file = new File(['img_content'], 'happy_expression.png', { type: 'image/png' });

      const rowFileInput = screen.getByTestId('input-file-expr-0');
      fireEvent.change(rowFileInput, {
        target: { files: [file] },
      });

      await waitFor(() => {
        const thumbnail = screen.getByTestId('expr-thumbnail-0') as HTMLImageElement;
        expect(thumbnail.src).toContain('data:image/png;base64');
      });
    });
  });

  // --------------------------------------------------------------------------
  // UT-EDT-10: Default Sprite Selection & Fallback Shift
  // --------------------------------------------------------------------------
  describe('UT-EDT-10: Default Sprite Selection & Fallback Shift', () => {
    it('shifts default selection to first remaining row when default expression is deleted', async () => {
      const initialChar: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'smile',
        sprites: {
          smile: 'data:image/png;base64,smile_img',
          angry: 'data:image/png;base64,angry_img',
          sad: 'data:image/png;base64,sad_img',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={initialChar}
          existingIds={['alice']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      // Verify row 0 (smile) is default
      const radio0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      expect(radio0.checked).toBe(true);

      // Delete default row (row 0)
      const deleteBtn0 = screen.getByTestId('btn-delete-expr-0');
      fireEvent.click(deleteBtn0);

      // Now angry should be at index 0 and be default
      const newRadio0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      expect(newRadio0.checked).toBe(true);
      expect((screen.getByTestId('input-expr-key-0') as HTMLInputElement).value).toBe('angry');
    });
  });

  // --------------------------------------------------------------------------
  // UT-EDT-11: Expression Key Validation & Duplicate Detection
  // --------------------------------------------------------------------------
  describe('UT-EDT-11: Expression Key Validation', () => {
    it('disables Save button and displays error when expression keys are duplicates or invalid', () => {
      const initialChar: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'smile',
        sprites: {
          smile: 'data:image/png;base64,smile_img',
          angry: 'data:image/png;base64,angry_img',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={initialChar}
          existingIds={['alice']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const saveBtn = screen.getByTestId('btn-save-character');
      expect(saveBtn).not.toBeDisabled();

      // Change angry to smile -> duplicate
      const keyInput1 = screen.getByTestId('input-expr-key-1');
      fireEvent.change(keyInput1, { target: { value: 'smile' } });

      expect(screen.getAllByText("Expression key 'smile' already exists").length).toBeGreaterThanOrEqual(1);
      expect(saveBtn).toBeDisabled();

      // Change to invalid characters
      fireEvent.change(keyInput1, { target: { value: 'smile!' } });
      expect(
        screen.getByText('Expression key must contain only letters, numbers, and underscores')
      ).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Fix key
      fireEvent.change(keyInput1, { target: { value: 'cry' } });
      expect(saveBtn).not.toBeDisabled();
    });
  });

  // --------------------------------------------------------------------------
  // CharacterManagerPane Component Tests
  // --------------------------------------------------------------------------
  describe('CharacterManagerPane UI & Actions', () => {
    it('renders empty state when characters array is empty', () => {
      const handleCreate = vi.fn();
      render(
        <CharacterManagerPane
          characters={[]}
          onCreateCharacter={handleCreate}
          onEditCharacter={vi.fn()}
          onDeleteCharacter={vi.fn()}
        />
      );

      expect(screen.getByTestId('pane-character-empty')).toBeInTheDocument();
      expect(screen.getByText('No characters yet')).toBeInTheDocument();

      const emptyAddBtn = screen.getByTestId('btn-add-character-empty');
      fireEvent.click(emptyAddBtn);
      expect(handleCreate).toHaveBeenCalledTimes(1);
    });

    it('renders character cards with avatar thumbnail, color badge, expression count, and action buttons', () => {
      const mockChars: Character[] = [
        {
          id: 'alice',
          name: 'Alice Margatroid',
          colorHex: '#38bdf8',
          defaultExpression: 'smile',
          sprites: {
            smile: 'data:image/png;base64,smile_thumb',
            sad: 'data:image/png;base64,sad_thumb',
          },
        },
        {
          id: 'marisa',
          name: 'Marisa Kirisame',
          colorHex: '#f59e0b',
          defaultExpression: 'default',
          sprites: {},
        },
      ];

      const handleEdit = vi.fn();
      const handleDelete = vi.fn();

      render(
        <CharacterManagerPane
          characters={mockChars}
          uncreatedIds={['reimu']}
          onCreateCharacter={vi.fn()}
          onEditCharacter={handleEdit}
          onDeleteCharacter={handleDelete}
        />
      );

      // Alice card with thumbnail avatar
      expect(screen.getByTestId('character-card-alice')).toBeInTheDocument();
      expect(screen.getByTestId('char-avatar-alice')).toBeInTheDocument();
      expect(screen.getByText('Alice Margatroid')).toBeInTheDocument();
      expect(screen.getByText('2 expressions')).toBeInTheDocument();

      // Marisa card with fallback initial avatar
      expect(screen.getByTestId('character-card-marisa')).toBeInTheDocument();
      expect(screen.getByTestId('char-avatar-fallback-marisa')).toBeInTheDocument();
      expect(screen.getByText('0 expressions')).toBeInTheDocument();

      // Uncreated badge / card
      expect(screen.getByTestId('uncreated-character-reimu')).toBeInTheDocument();

      // Click Edit
      fireEvent.click(screen.getByTestId('btn-edit-char-alice'));
      expect(handleEdit).toHaveBeenCalledWith(mockChars[0]);

      // Click Delete
      fireEvent.click(screen.getByTestId('btn-delete-char-alice'));
      expect(handleDelete).toHaveBeenCalledWith('alice');
    });
  });

  // --------------------------------------------------------------------------
  // StudioWorkspacePage Full Integration Test
  // --------------------------------------------------------------------------
  describe('StudioWorkspacePage Integration', () => {
    it('switches to characters tab, opens create modal, and saves character to repository', async () => {
      const mockRepo: ProjectRepository = {
        listProjects: vi.fn(),
        getProject: vi.fn(),
        createProject: vi.fn(),
        updateProject: vi.fn().mockResolvedValue(undefined),
        deleteProject: vi.fn(),
        duplicateProject: vi.fn(),
        exportProjectZip: vi.fn(),
        importProjectZip: vi.fn(),
        getStorageUsage: vi.fn(),
        getAssetBlob: vi.fn(),
        saveAssetBlob: vi.fn(),
        deleteAssetBlob: vi.fn(),
      };

      const mockProject: Project = {
        id: 'proj-test',
        title: 'VN Story',
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        files: [{ id: 'f-1', name: 'main.vns', content: 'say "Hi"', order: 0, version: 1 }],
        characters: [],
        assets: [],
        variables: [],
        displaySettings: { width: 1920, height: 1080, orientation: 'landscape' },
      };

      render(
        <StudioWorkspacePage
          projectId="proj-test"
          repository={mockRepo}
          initialProject={mockProject}
        />
      );

      // Switch to characters tab
      const charTabBtn = screen.getByTestId('tab-characters');
      fireEvent.click(charTabBtn);

      // CharacterManagerPane empty state should be rendered
      expect(screen.getByTestId('pane-character-empty')).toBeInTheDocument();

      // Open new character modal
      const addBtn = screen.getByTestId('btn-add-character-empty');
      fireEvent.click(addBtn);

      expect(screen.getByTestId('modal-character-form')).toBeInTheDocument();

      // Fill character data
      fireEvent.change(screen.getByTestId('input-char-id'), { target: { value: 'hero' } });
      fireEvent.change(screen.getByTestId('input-char-name'), { target: { value: 'The Hero' } });

      // Save
      const saveBtn = screen.getByTestId('btn-save-character');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockRepo.updateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            characters: [
              expect.objectContaining({
                id: 'hero',
                name: 'The Hero',
              }),
            ],
          })
        );
      });
    });
  });
});
