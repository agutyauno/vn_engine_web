import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Character } from '@vn-engine/shared-types';
import { CharacterManagerPane } from '../src/components/studio/CharacterManagerPane';
import { CharacterModal } from '../src/components/studio/CharacterModal';

describe('Character & Sprite Upload Manager (E-Phase 4 TDD)', () => {
  const mockCharacters: Character[] = [
    {
      id: 'alice',
      name: 'Alice Henderson',
      colorHex: '#e06c75',
      defaultExpression: 'neutral',
      sprites: {
        neutral: 'asset-alice-neutral',
        happy: 'asset-alice-happy',
      },
    },
    {
      id: 'bob',
      name: 'Detective Bob',
      colorHex: '#61afef',
      defaultExpression: 'serious',
      sprites: {
        serious: 'asset-bob-serious',
      },
    },
  ];

  describe('CharacterManagerPane', () => {
    it('renders list of characters with expressions count and color badge', () => {
      render(
        <CharacterManagerPane
          characters={mockCharacters}
          onAddCharacter={vi.fn()}
          onEditCharacter={vi.fn()}
          onDeleteCharacter={vi.fn()}
        />
      );

      expect(screen.getByText('Alice Henderson')).toBeInTheDocument();
      expect(screen.getByText('Detective Bob')).toBeInTheDocument();
      expect(screen.getByText('2 expressions')).toBeInTheDocument();
      expect(screen.getByText('1 expression')).toBeInTheDocument();
      expect(screen.getByTestId('btn-add-character')).toBeInTheDocument();
    });

    it('triggers edit and delete callbacks for character', () => {
      const handleEdit = vi.fn();
      const handleDelete = vi.fn();

      render(
        <CharacterManagerPane
          characters={mockCharacters}
          onAddCharacter={vi.fn()}
          onEditCharacter={handleEdit}
          onDeleteCharacter={handleDelete}
        />
      );

      fireEvent.click(screen.getByTestId('btn-edit-char-alice'));
      expect(handleEdit).toHaveBeenCalledWith(mockCharacters[0]);

      fireEvent.click(screen.getByTestId('btn-delete-char-bob'));
      expect(handleDelete).toHaveBeenCalledWith('bob');
    });
  });

  describe('CharacterModal', () => {
    it('UT-EDT-10: validates required fields (ID and Display Name)', () => {
      const handleSave = vi.fn();
      render(
        <CharacterModal
          isOpen={true}
          character={null}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      // Submit empty
      fireEvent.click(screen.getByTestId('btn-save-character'));

      expect(screen.getByTestId('error-char-id')).toBeInTheDocument();
      expect(screen.getByTestId('error-char-name')).toBeInTheDocument();
      expect(handleSave).not.toHaveBeenCalled();
    });

    it('UT-EDT-08: locks Character ID when editing existing character', () => {
      render(
        <CharacterModal
          isOpen={true}
          character={mockCharacters[0]} // Alice
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id');
      expect(idInput).toBeDisabled();
      expect(idInput).toHaveValue('alice');

      const nameInput = screen.getByTestId('input-char-name');
      expect(nameInput).not.toBeDisabled();
      expect(nameInput).toHaveValue('Alice Henderson');
    });

    it('UT-EDT-11: 2-way color picker synchronizes hex text input and color swatch', () => {
      render(
        <CharacterModal
          isOpen={true}
          character={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const hexInput = screen.getByTestId('input-char-color-hex');
      const colorPicker = screen.getByTestId('input-char-color-picker');

      // Change hex text input
      fireEvent.change(hexInput, { target: { value: '#98c379' } });
      expect(colorPicker).toHaveValue('#98c379');

      // Change color picker input
      fireEvent.change(colorPicker, { target: { value: '#e5c07b' } });
      expect(hexInput).toHaveValue('#e5c07b');
    });

    it('UT-EDT-09: derives expression keys from bulk uploaded file names', async () => {
      const handleSave = vi.fn();
      render(
        <CharacterModal
          isOpen={true}
          character={null}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const fileInput = screen.getByTestId('input-char-sprite-files');

      // Create fake mock files: 'alice_smile.png' and 'blushing.webp'
      const file1 = new File(['fake-png-content'], 'alice_smile.png', { type: 'image/png' });
      const file2 = new File(['fake-webp-content'], 'blushing.webp', { type: 'image/webp' });

      const originalCreateObjectURL = window.URL.createObjectURL;
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(screen.getByDisplayValue('smile')).toBeInTheDocument();
        expect(screen.getByDisplayValue('blushing')).toBeInTheDocument();
      });

      window.URL.createObjectURL = originalCreateObjectURL;
    });
  });
});
