// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Character } from '@vn-engine/shared-types';
import {
  CharacterModal,
  deriveExpressionKey,
  isValidHex,
  normalizeHex,
} from '../src/components/characters/CharacterModal';

describe('Adversarial Verification: Milestone 4 (challenger_m4_1)', () => {
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

  // ==========================================================================
  // AREA 1: #char-bulk-dropzone drag-and-drop & Filename Normalization
  // ==========================================================================
  describe('Area 1: Bulk Dropzone & Filename Sanitization Stress', () => {
    describe('1.1 deriveExpressionKey Pure Function Edge Cases', () => {
      it('strips character prefix and extension for alice_happy_2.png -> happy_2', () => {
        expect(deriveExpressionKey('alice_happy_2.png', 'alice')).toBe('happy_2');
      });

      it('strips character prefix with hyphen for char-smile.webp -> smile', () => {
        expect(deriveExpressionKey('char-smile.webp', 'char')).toBe('smile');
      });

      it('lowercases UPPERCASE.JPG to uppercase', () => {
        expect(deriveExpressionKey('UPPERCASE.JPG')).toBe('uppercase');
      });

      it('handles files with no extension raw_sprite -> raw_sprite', () => {
        expect(deriveExpressionKey('raw_sprite')).toBe('raw_sprite');
      });

      it('handles multi-dot filenames alice.pose.v1.0.final.png -> pose_v1_0_final', () => {
        // Base is alice.pose.v1.0.final, stripped prefix alice. is not matched by ^alice[_-],
        // but sanitized replaces dots with underscores: alice_pose_v1_0_final
        expect(deriveExpressionKey('alice.pose.v1.0.final.png', 'alice')).toBe('alice_pose_v1_0_final');
      });

      it('handles filenames with special characters and symbols', () => {
        expect(deriveExpressionKey('!@#$%^&*(smile)+=~.png')).toBe('smile');
      });

      it('falls back to default if filename produces empty string', () => {
        expect(deriveExpressionKey('____.png')).toBe('default');
        expect(deriveExpressionKey('.png')).toBe('default');
        expect(deriveExpressionKey('...')).toBe('default');
        expect(deriveExpressionKey('')).toBe('default');
      });

      it('sanitizes Unicode characters cleanly', () => {
        const derived = deriveExpressionKey('chibi_😊_happy.png');
        expect(derived).toBe('chibi_happy');
        expect(/^[a-zA-Z0-9_]+$/.test(derived)).toBe(true);
      });

      it('safely handles regex metacharacters in charId without crashing', () => {
        expect(() => deriveExpressionKey('test_smile.png', 'bad[id(test+*?^$')).not.toThrow();
        expect(deriveExpressionKey('bad[id_smile.png', 'bad[id')).toBe('smile');
        expect(deriveExpressionKey('special+char_happy.png', 'special+char')).toBe('happy');
      });
    });

    describe('1.2 Bulk Dropzone UI & File Drop Ingestion', () => {
      it('processes edge-case filenames dropped on #char-bulk-dropzone', async () => {
        render(
          <CharacterModal
            isOpen={true}
            existingIds={[]}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );

        const idInput = screen.getByTestId('input-char-id');
        fireEvent.change(idInput, { target: { value: 'alice' } });

        const dropzone = screen.getByTestId('char-bulk-dropzone');

        const files = [
          new File(['content1'], 'alice_happy_2.png', { type: 'image/png' }),
          new File(['content2'], 'char-smile.webp', { type: 'image/webp' }),
          new File(['content3'], 'UPPERCASE.JPG', { type: 'image/jpeg' }),
          new File(['content4'], 'raw_sprite', { type: 'image/png' }),
        ];

        fireEvent.drop(dropzone, {
          dataTransfer: { files },
        });

        await waitFor(() => {
          expect(screen.getByDisplayValue('happy_2')).toBeInTheDocument();
          // char-smile.webp with charId alice -> char_smile
          expect(screen.getByDisplayValue('char_smile')).toBeInTheDocument();
          expect(screen.getByDisplayValue('uppercase')).toBeInTheDocument();
          expect(screen.getByDisplayValue('raw_sprite')).toBeInTheDocument();
        });
      });

      it('skips non-image files (.vns, .mp3, .txt, .exe) and renders explicit warning badges', async () => {
        render(
          <CharacterModal
            isOpen={true}
            existingIds={[]}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );

        const dropzone = screen.getByTestId('char-bulk-dropzone');

        const nonImages = [
          new File(['say "hello"'], 'script.vns', { type: 'text/plain' }),
          new File(['audio binary'], 'bgm.mp3', { type: 'audio/mpeg' }),
          new File(['exe binary'], 'malicious.exe', { type: 'application/octet-stream' }),
        ];

        fireEvent.drop(dropzone, {
          dataTransfer: { files: nonImages },
        });

        await waitFor(() => {
          expect(screen.getByText(/Skipped non-image file: script\.vns/)).toBeInTheDocument();
          expect(screen.getByText(/Skipped non-image file: bgm\.mp3/)).toBeInTheDocument();
          expect(screen.getByText(/Skipped non-image file: malicious\.exe/)).toBeInTheDocument();
        });

        // Ensure no rows were added to table
        expect(screen.queryByTestId('sprite-row-script')).not.toBeInTheDocument();
        expect(screen.queryByTestId('sprite-row-bgm')).not.toBeInTheDocument();
      });

      it('displays warning when dropped file exceeds 10MB limit', async () => {
        render(
          <CharacterModal
            isOpen={true}
            existingIds={[]}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );

        const dropzone = screen.getByTestId('char-bulk-dropzone');

        // 11MB file
        const largeFile = new File(['x'.repeat(100)], 'giant_pose.png', { type: 'image/png' });
        Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

        fireEvent.drop(dropzone, {
          dataTransfer: { files: [largeFile] },
        });

        await waitFor(() => {
          expect(screen.getByText(/File giant_pose\.png exceeds 10MB limit/)).toBeInTheDocument();
        });
      });

      it('auto-disambiguates duplicate filenames in bulk drop (e.g. smile.png, smile.png)', async () => {
        render(
          <CharacterModal
            isOpen={true}
            existingIds={[]}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );

        const dropzone = screen.getByTestId('char-bulk-dropzone');

        const fileA = new File(['img1'], 'smile.png', { type: 'image/png' });
        const fileB = new File(['img2'], 'smile.png', { type: 'image/png' });

        fireEvent.drop(dropzone, {
          dataTransfer: { files: [fileA, fileB] },
        });

        await waitFor(() => {
          expect(screen.getByDisplayValue('smile')).toBeInTheDocument();
          expect(screen.getByDisplayValue('smile_1')).toBeInTheDocument();
        });

        // Save button should NOT be disabled by collision
        const saveBtn = screen.getByTestId('btn-save-character');
        const idInput = screen.getByTestId('input-char-id');
        fireEvent.change(idInput, { target: { value: 'alice' } });
        expect(saveBtn).not.toBeDisabled();
      });

      it('handles dragEnter, dragOver, dragLeave, and empty drop cleanly', () => {
        render(
          <CharacterModal
            isOpen={true}
            existingIds={[]}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );

        const dropzone = screen.getByTestId('char-bulk-dropzone');

        fireEvent.dragEnter(dropzone);
        expect(dropzone.className).toContain('border-neutral-400');

        fireEvent.dragOver(dropzone);
        expect(dropzone.className).toContain('border-neutral-400');

        fireEvent.dragLeave(dropzone);
        expect(dropzone.className).not.toContain('border-neutral-400');

        // Drop with empty dataTransfer
        fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
        expect(dropzone.className).not.toContain('border-neutral-400');
      });
    });
  });

  // ==========================================================================
  // AREA 2: Character ID Edit Locking & Programmatic Mutation Protection
  // ==========================================================================
  describe('Area 2: Character ID Edit Locking & Mutation Protection', () => {
    it('enforces disabled attribute on Character ID input in edit mode', () => {
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
          existingIds={['elena', 'damon']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id') as HTMLInputElement;
      expect(idInput).toBeDisabled();
      expect(idInput.disabled).toBe(true);
      expect(idInput.value).toBe('elena');
      expect(idInput.className).toContain('cursor-not-allowed');
    });

    it('empirically challenges Character ID locking against programmatic mutation', () => {
      const existingChar: Character = {
        id: 'elena',
        name: 'Elena Gilbert',
        colorHex: '#38bdf8',
        defaultExpression: 'smile',
        sprites: { smile: 'data:image/png;base64,smile' },
      };

      const handleSave = vi.fn();

      render(
        <CharacterModal
          isOpen={true}
          initialData={existingChar}
          existingIds={['elena']}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const idInput = screen.getByTestId('input-char-id') as HTMLInputElement;
      expect(idInput).toBeDisabled();

      // Programmatically attempt change on the disabled input element
      fireEvent.change(idInput, { target: { value: 'hacked_id' } });

      // Save form
      const saveBtn = screen.getByTestId('btn-save-character');
      fireEvent.click(saveBtn);

      expect(handleSave).toHaveBeenCalledTimes(1);
      const savedResult = handleSave.mock.calls[0]![0] as Character;

      // The dispatch explicitly commands: "ensure ID cannot be mutated in edit mode"
      // If savedResult.id is 'hacked_id', CharacterModal failed to guard ID integrity in edit mode!
      expect(savedResult.id).toBe('elena');
    });

    it('allows editing in create mode and rejects duplicate IDs', () => {
      const handleSave = vi.fn();
      render(
        <CharacterModal
          isOpen={true}
          initialData={null}
          existingIds={['elena']}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const idInput = screen.getByTestId('input-char-id') as HTMLInputElement;
      expect(idInput).not.toBeDisabled();

      // Attempt duplicate ID
      fireEvent.change(idInput, { target: { value: 'Elena' } });
      expect(screen.getByText("Character ID 'elena' already exists")).toBeInTheDocument();

      const saveBtn = screen.getByTestId('btn-save-character');
      expect(saveBtn).toBeDisabled();

      // Unique ID
      fireEvent.change(idInput, { target: { value: 'stefan' } });
      expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();
    });
  });

  // ==========================================================================
  // AREA 3: Default Sprite Fallback Shift (UT-EDT-10) Multi-Configuration
  // ==========================================================================
  describe('Area 3: Default Sprite Fallback Shift (UT-EDT-10)', () => {
    it('3-Row Configuration: deleting default shifts to new row 0', () => {
      const char: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'expr_a',
        sprites: {
          expr_a: 'data:image/png;base64,a',
          expr_b: 'data:image/png;base64,b',
          expr_c: 'data:image/png;base64,c',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={char}
          existingIds={['alice']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      // 3 rows: row 0 (expr_a) is default
      const radio0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      const radio1 = screen.getByTestId('radio-default-expr-1') as HTMLInputElement;
      const radio2 = screen.getByTestId('radio-default-expr-2') as HTMLInputElement;

      expect(radio0.checked).toBe(true);
      expect(radio1.checked).toBe(false);
      expect(radio2.checked).toBe(false);

      // Delete default row (row 0: expr_a)
      const deleteBtn0 = screen.getByTestId('btn-delete-expr-0');
      fireEvent.click(deleteBtn0);

      // Now 2 rows remain. Row 0 should now be expr_b and MUST be default
      const newRadio0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      const newRadio1 = screen.getByTestId('radio-default-expr-1') as HTMLInputElement;
      const keyInput0 = screen.getByTestId('input-expr-key-0') as HTMLInputElement;
      const keyInput1 = screen.getByTestId('input-expr-key-1') as HTMLInputElement;

      expect(keyInput0.value).toBe('expr_b');
      expect(newRadio0.checked).toBe(true);

      expect(keyInput1.value).toBe('expr_c');
      expect(newRadio1.checked).toBe(false);
    });

    it('3-Row Configuration: selecting last row as default, then deleting middle row retains last row default', () => {
      const char: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'expr_a',
        sprites: {
          expr_a: 'data:image/png;base64,a',
          expr_b: 'data:image/png;base64,b',
          expr_c: 'data:image/png;base64,c',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={char}
          existingIds={['alice']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      // Set row 2 (expr_c) as default
      const radio2 = screen.getByTestId('radio-default-expr-2');
      fireEvent.click(radio2);

      expect((screen.getByTestId('radio-default-expr-2') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId('radio-default-expr-0') as HTMLInputElement).checked).toBe(false);

      // Delete row 1 (expr_b) which is non-default
      const deleteBtn1 = screen.getByTestId('btn-delete-expr-1');
      fireEvent.click(deleteBtn1);

      // 2 rows remain: expr_a (idx 0), expr_c (idx 1). expr_c MUST remain default
      const key0 = screen.getByTestId('input-expr-key-0') as HTMLInputElement;
      const key1 = screen.getByTestId('input-expr-key-1') as HTMLInputElement;
      const r0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      const r1 = screen.getByTestId('radio-default-expr-1') as HTMLInputElement;

      expect(key0.value).toBe('expr_a');
      expect(r0.checked).toBe(false);

      expect(key1.value).toBe('expr_c');
      expect(r1.checked).toBe(true);
    });

    it('2-Row Configuration: deleting non-default keeps row 0 default', () => {
      const char: Character = {
        id: 'bob',
        name: 'Bob',
        colorHex: '#38bdf8',
        defaultExpression: 'smile',
        sprites: {
          smile: 'data:image/png;base64,s',
          frown: 'data:image/png;base64,f',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={char}
          existingIds={['bob']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      // Delete row 1 (frown, non-default)
      const deleteBtn1 = screen.getByTestId('btn-delete-expr-1');
      fireEvent.click(deleteBtn1);

      // 1 row remaining: smile (row 0) remains default
      const r0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      expect(r0.checked).toBe(true);
      expect((screen.getByTestId('input-expr-key-0') as HTMLInputElement).value).toBe('smile');
    });

    it('1-Row Configuration: deleting sole default row results in 0 rows without crashing', () => {
      const char: Character = {
        id: 'clara',
        name: 'Clara',
        colorHex: '#38bdf8',
        defaultExpression: 'only_expr',
        sprites: {
          only_expr: 'data:image/png;base64,o',
        },
      };

      const handleSave = vi.fn();

      render(
        <CharacterModal
          isOpen={true}
          initialData={char}
          existingIds={['clara']}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      // Delete row 0
      const deleteBtn0 = screen.getByTestId('btn-delete-expr-0');
      fireEvent.click(deleteBtn0);

      // Now 0 rows
      expect(screen.getByText(/No expressions added yet/)).toBeInTheDocument();
      expect(screen.queryByTestId('radio-default-expr-0')).not.toBeInTheDocument();

      // Click "Add Expression" -> newly added row should automatically be default
      const addExprBtn = screen.getByTestId('btn-add-expr-row');
      fireEvent.click(addExprBtn);

      const r0 = screen.getByTestId('radio-default-expr-0') as HTMLInputElement;
      expect(r0.checked).toBe(true);
      expect((screen.getByTestId('input-expr-key-0') as HTMLInputElement).value).toBe('default');
    });

    it('saving with 0 expressions safely defaults to "default" expression handle and empty sprites', () => {
      const handleSave = vi.fn();

      render(
        <CharacterModal
          isOpen={true}
          initialData={null}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const idInput = screen.getByTestId('input-char-id');
      fireEvent.change(idInput, { target: { value: 'ghost' } });

      const saveBtn = screen.getByTestId('btn-save-character');
      fireEvent.click(saveBtn);

      expect(handleSave).toHaveBeenCalledWith({
        id: 'ghost',
        name: 'ghost',
        colorHex: '#38bdf8',
        defaultExpression: 'default',
        sprites: {},
      });
    });
  });

  // ==========================================================================
  // AREA 4: Color Picker & Expression Key Validation Edge Cases
  // ==========================================================================
  describe('Area 4: Color Picker & Expression Key Invariants', () => {
    it('normalizeHex correctly normalizes 3-digit hex, handles missing hash, and returns fallback on invalid', () => {
      expect(normalizeHex('#fff')).toBe('#ffffff');
      expect(normalizeHex('fff')).toBe('#ffffff');
      expect(normalizeHex('#38bdf8')).toBe('#38bdf8');
      expect(normalizeHex('10b981')).toBe('#10b981');
      expect(normalizeHex('invalid', '#38bdf8')).toBe('#38bdf8');
      expect(normalizeHex('', '#38bdf8')).toBe('#38bdf8');
    });

    it('isValidHex validates standard and shorthand hex formats', () => {
      expect(isValidHex('#ffffff')).toBe(true);
      expect(isValidHex('ffffff')).toBe(true);
      expect(isValidHex('#abc')).toBe(true);
      expect(isValidHex('abc')).toBe(true);
      expect(isValidHex('#ffff')).toBe(false);
      expect(isValidHex('red')).toBe(false);
      expect(isValidHex('')).toBe(false);
    });

    it('detects duplicate expression keys case-insensitively and blocks saving', () => {
      const char: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'Smile',
        sprites: {
          Smile: 'data:image/png;base64,s',
          frown: 'data:image/png;base64,f',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={char}
          existingIds={['alice']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const keyInput1 = screen.getByTestId('input-expr-key-1');
      // Set second key to 'smile' (case-insensitive collision with 'Smile')
      fireEvent.change(keyInput1, { target: { value: 'smile' } });

      expect(screen.getAllByText("Expression key 'smile' already exists").length).toBeGreaterThanOrEqual(1);

      const saveBtn = screen.getByTestId('btn-save-character');
      expect(saveBtn).toBeDisabled();
    });
  });
});
