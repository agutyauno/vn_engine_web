// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Character } from '@vn-engine/shared-types';
import { CharacterModal, normalizeHex, isValidHex, COLOR_SWATCHES } from '../src/components/characters/CharacterModal';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

describe('Adversarial Challenge: Milestone 4 (challenger_m4_2)', () => {
  const originalFileReader = window.FileReader;

  beforeEach(() => {
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
    // @ts-expect-error Mock FileReader
    window.FileReader = MockFileReader;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.FileReader = originalFileReader;
  });

  // ==========================================================================
  // Challenge 1: Two-Way HEX Synchronization & Stress Testing
  // ==========================================================================
  describe('Challenge 1: Two-Way HEX Synchronization & Robustness', () => {
    it('1.1: Handles invalid hex strings gracefully without crashing or polluting state', () => {
      const handleSave = vi.fn();
      render(
        <CharacterModal
          isOpen={true}
          existingIds={[]}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const hexInput = screen.getByTestId('input-char-color-hex') as HTMLInputElement;
      const colorPicker = screen.getByTestId('input-char-color-picker') as HTMLInputElement;
      const nameplate = screen.getByTestId('nameplate-preview');
      const idInput = screen.getByTestId('input-char-id');
      const saveBtn = screen.getByTestId('btn-save-character');

      fireEvent.change(idInput, { target: { value: 'elena' } });

      // First set to a valid color #ec4899
      fireEvent.change(hexInput, { target: { value: '#ec4899' } });
      expect(colorPicker.value).toBe('#ec4899');
      expect(nameplate).toHaveStyle({ color: '#ec4899' });

      // Test invalid hex variations
      const invalidHexes = ['#xyz', '#12345', 'blue', '', '#', '#1234567', 'rgb(255,0,0)'];
      for (const invalid of invalidHexes) {
        fireEvent.change(hexInput, { target: { value: invalid } });
        expect(hexInput.value).toBe(invalid);
        // Native color picker should retain the last valid color
        expect(colorPicker.value).toBe('#ec4899');
        // Preview nameplate should retain the last valid color
        expect(nameplate).toHaveStyle({ color: '#ec4899' });
      }

      // If user saves while input is invalid, it should normalize to fallback safely
      fireEvent.click(saveBtn);
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          colorHex: '#38bdf8', // fallback
        })
      );
    });

    it('1.2: Expands 3-digit shorthand hex to 6-digit hex (#fff -> #ffffff, #0a3 -> #00aa33)', () => {
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

      fireEvent.change(hexInput, { target: { value: '#fff' } });
      expect(colorPicker.value).toBe('#ffffff');
      expect(nameplate).toHaveStyle({ color: '#ffffff' });

      fireEvent.change(hexInput, { target: { value: '#0a3' } });
      expect(colorPicker.value).toBe('#00aa33');
      expect(nameplate).toHaveStyle({ color: '#00aa33' });
    });

    it('1.3: Accepts hex without # prefix and auto-normalizes (38bdf8 -> #38bdf8, fff -> #ffffff)', () => {
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

      fireEvent.change(hexInput, { target: { value: '38bdf8' } });
      expect(colorPicker.value).toBe('#38bdf8');
      expect(nameplate).toHaveStyle({ color: '#38bdf8' });

      fireEvent.change(hexInput, { target: { value: 'fff' } });
      expect(colorPicker.value).toBe('#ffffff');
      expect(nameplate).toHaveStyle({ color: '#ffffff' });
    });

    it('1.4: Survives rapid consecutive color inputs alternating between valid and invalid', () => {
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

      const rapidSequence = [
        '#111111',
        '#not_a_hex',
        '#222222',
        'something_bad',
        '#333333',
        '',
        '#10b981',
        'badbad',
        '#f59e0b',
      ];

      for (const val of rapidSequence) {
        fireEvent.change(hexInput, { target: { value: val } });
      }

      // Final value was valid #f59e0b
      expect(hexInput.value).toBe('#f59e0b');
      expect(colorPicker.value).toBe('#f59e0b');
    });

    it('1.5: Verifies all preset swatches update input, native picker, and nameplate preview', () => {
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

      for (const swatch of COLOR_SWATCHES) {
        const btn = screen.getByTestId(`color-swatch-${swatch}`);
        fireEvent.click(btn);
        expect(hexInput.value).toBe(swatch);
        expect(colorPicker.value).toBe(swatch);
        expect(nameplate).toHaveStyle({ color: swatch });
      }
    });

    it('1.6: Unit check on normalizeHex & isValidHex helper functions with edge cases', () => {
      expect(isValidHex('#ffffff')).toBe(true);
      expect(isValidHex('ffffff')).toBe(true);
      expect(isValidHex('#abc')).toBe(true);
      expect(isValidHex('abc')).toBe(true);
      expect(isValidHex('#12345')).toBe(false);
      expect(isValidHex('#gggggg')).toBe(false);
      expect(isValidHex('')).toBe(false);
      expect(isValidHex('   ')).toBe(false);

      expect(normalizeHex('#FFFFFF')).toBe('#ffffff');
      expect(normalizeHex('ABC')).toBe('#aabbcc');
      expect(normalizeHex('#xyz', '#fallback')).toBe('#fallback');
    });
  });

  // ==========================================================================
  // Challenge 2: Expression Key Duplicate Prevention & Format Enforcement (UT-EDT-11)
  // ==========================================================================
  describe('Challenge 2: Expression Key Duplicate Prevention (UT-EDT-11)', () => {
    it('2.1: Enforces duplicate prevention across rows with case-insensitivity', () => {
      const initialChar: Character = {
        id: 'clara',
        name: 'Clara',
        colorHex: '#38bdf8',
        defaultExpression: 'idle',
        sprites: {
          idle: 'data:image/png;base64,1',
          smile: 'data:image/png;base64,2',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={initialChar}
          existingIds={['clara']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const saveBtn = screen.getByTestId('btn-save-character');
      expect(saveBtn).not.toBeDisabled();

      const keyInput1 = screen.getByTestId('input-expr-key-1');

      // Test exact duplicate
      fireEvent.change(keyInput1, { target: { value: 'idle' } });
      expect(screen.getAllByText("Expression key 'idle' already exists").length).toBeGreaterThanOrEqual(1);
      expect(saveBtn).toBeDisabled();

      // Test case-insensitive duplicate: IDLE vs idle
      fireEvent.change(keyInput1, { target: { value: 'IDLE' } });
      expect(screen.getAllByText("Expression key 'idle' already exists").length).toBeGreaterThanOrEqual(1);
      expect(saveBtn).toBeDisabled();

      // Test whitespace trimmed duplicate: " idle  "
      fireEvent.change(keyInput1, { target: { value: '  idle  ' } });
      expect(screen.getAllByText("Expression key 'idle' already exists").length).toBeGreaterThanOrEqual(1);
      expect(saveBtn).toBeDisabled();
    });

    it('2.2: Flags empty or whitespace-only keys and disables save', () => {
      const initialChar: Character = {
        id: 'clara',
        name: 'Clara',
        colorHex: '#38bdf8',
        defaultExpression: 'idle',
        sprites: {
          idle: 'data:image/png;base64,1',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={initialChar}
          existingIds={['clara']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const saveBtn = screen.getByTestId('btn-save-character');
      const keyInput0 = screen.getByTestId('input-expr-key-0');

      // Empty string
      fireEvent.change(keyInput0, { target: { value: '' } });
      expect(screen.getByText('Expression key cannot be empty')).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Whitespace string
      fireEvent.change(keyInput0, { target: { value: '   ' } });
      expect(screen.getByText('Expression key cannot be empty')).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();
    });

    it('2.3: Rejects invalid regex characters (smile!, happy face, smile-face, smile@home)', () => {
      const initialChar: Character = {
        id: 'clara',
        name: 'Clara',
        colorHex: '#38bdf8',
        defaultExpression: 'idle',
        sprites: {
          idle: 'data:image/png;base64,1',
        },
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={initialChar}
          existingIds={['clara']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const saveBtn = screen.getByTestId('btn-save-character');
      const keyInput0 = screen.getByTestId('input-expr-key-0');

      const invalidKeys = ['smile!', 'happy face', 'smile-face', 'smile@home', 'smile#1', 'smile.png'];
      for (const invalid of invalidKeys) {
        fireEvent.change(keyInput0, { target: { value: invalid } });
        expect(
          screen.getByText('Expression key must contain only letters, numbers, and underscores')
        ).toBeInTheDocument();
        expect(saveBtn).toBeDisabled();
      }

      // Valid alphanumeric and underscore must pass
      fireEvent.change(keyInput0, { target: { value: 'smile_happy_01' } });
      expect(
        screen.queryByText('Expression key must contain only letters, numbers, and underscores')
      ).not.toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();
    });
  });

  // ==========================================================================
  // Challenge 3: Character ID Uniqueness (UT-EDT-02)
  // ==========================================================================
  describe('Challenge 3: Character ID Uniqueness & Script Reference Protection (UT-EDT-02)', () => {
    it('3.1: Enforces ID uniqueness with exact and case-insensitive collisions', () => {
      const existingIds = ['Alice', 'bob_marley'];

      render(
        <CharacterModal
          isOpen={true}
          existingIds={existingIds}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id');
      const saveBtn = screen.getByTestId('btn-save-character');

      // Exact match collision
      fireEvent.change(idInput, { target: { value: 'Alice' } });
      expect(screen.getByText("Character ID 'alice' already exists")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Lowercase match collision
      fireEvent.change(idInput, { target: { value: 'alice' } });
      expect(screen.getByText("Character ID 'alice' already exists")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Uppercase match collision
      fireEvent.change(idInput, { target: { value: 'ALICE' } });
      expect(screen.getByText("Character ID 'alice' already exists")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Whitespace collision
      fireEvent.change(idInput, { target: { value: '  alice  ' } });
      expect(screen.getByText("Character ID 'alice' already exists")).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();

      // Unique ID clears error
      fireEvent.change(idInput, { target: { value: 'charlie' } });
      expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();
    });

    it('3.2: Does not flag duplicate against itself in edit mode and locks ID input', () => {
      const existingChar: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'default',
        sprites: {},
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={existingChar}
          existingIds={['alice', 'bob']}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const idInput = screen.getByTestId('input-char-id') as HTMLInputElement;
      const saveBtn = screen.getByTestId('btn-save-character');

      expect(idInput).toBeDisabled();
      expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();
    });

    it('3.3: EMPIRICAL STRESS: Probes whether mutating ID in edit mode to another character ("bob") is blocked from overwriting', () => {
      const handleSave = vi.fn();
      const existingChar: Character = {
        id: 'alice',
        name: 'Alice',
        colorHex: '#38bdf8',
        defaultExpression: 'default',
        sprites: {},
      };

      render(
        <CharacterModal
          isOpen={true}
          initialData={existingChar}
          existingIds={['alice', 'bob']}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const idInput = screen.getByTestId('input-char-id') as HTMLInputElement;
      expect(idInput).toBeDisabled();

      // Attempt to change ID to 'bob'
      fireEvent.change(idInput, { target: { value: 'bob' } });

      const saveBtn = screen.getByTestId('btn-save-character');
      fireEvent.click(saveBtn);

      // In a secure implementation, either the save is blocked because 'bob' exists,
      // or handleSave MUST be called with the original immutable ID 'alice'.
      // If handleSave is called with 'bob', CharacterModal allows ID mutation and character overwriting!
      expect(handleSave).toHaveBeenCalledTimes(1);
      const saved = handleSave.mock.calls[0]![0] as Character;
      expect(saved.id).toBe('alice');
    });
  });

  // ==========================================================================
  // Challenge 4: Repository Persistence with IndexedDBProjectRepository
  // ==========================================================================
  describe('Challenge 4: Repository Persistence with IndexedDBProjectRepository', () => {
    let repo: IndexedDBProjectRepository;

    beforeEach(async () => {
      repo = new IndexedDBProjectRepository('test_adv_chars_db_' + Date.now());
    });

    afterEach(async () => {
      await repo.close();
    });

    it('4.1: Persists created character and round-trips cleanly through IndexedDBProjectRepository', async () => {
      // 1. Create a real project in IDB
      const project = await repo.createProject({
        title: 'Adversarial Studio Project',
        description: 'Testing character persistence',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      expect(project.characters).toEqual([]);

      // 2. Mount StudioWorkspacePage with the real repository
      render(
        <StudioWorkspacePage
          projectId={project.id}
          repository={repo}
          initialProject={project}
        />
      );

      // Switch to characters tab
      fireEvent.click(screen.getByTestId('tab-characters'));

      // Open new character modal
      fireEvent.click(screen.getByTestId('btn-add-character-empty'));
      expect(screen.getByTestId('modal-character-form')).toBeInTheDocument();

      // Enter character info
      fireEvent.change(screen.getByTestId('input-char-id'), { target: { value: 'tsukasa' } });
      fireEvent.change(screen.getByTestId('input-char-name'), { target: { value: 'Hiiragi Tsukasa' } });
      fireEvent.change(screen.getByTestId('input-char-color-hex'), { target: { value: '#ec4899' } });

      // Add expression row
      fireEvent.click(screen.getByTestId('btn-add-expr-row'));
      const keyInput = screen.getByTestId('input-expr-key-0');
      fireEvent.change(keyInput, { target: { value: 'happy' } });

      // Save character
      fireEvent.click(screen.getByTestId('btn-save-character'));

      // 3. Verify modal closes
      await waitFor(() => {
        expect(screen.queryByTestId('modal-character-form')).not.toBeInTheDocument();
      });

      // 4. Verify directly in IndexedDB repository
      const refreshed = await repo.getProject(project.id);
      expect(refreshed).not.toBeNull();
      expect(refreshed!.characters).toHaveLength(1);

      const saved = refreshed!.characters[0]!;
      expect(saved.id).toBe('tsukasa');
      expect(saved.name).toBe('Hiiragi Tsukasa');
      expect(saved.colorHex).toBe('#ec4899');
      expect(saved.defaultExpression).toBe('happy');
    });

    it('4.2: Updates existing character and persists changes to IndexedDBProjectRepository', async () => {
      const initialChar: Character = {
        id: 'konata',
        name: 'Izumi Konata',
        colorHex: '#38bdf8',
        defaultExpression: 'smirk',
        sprites: { smirk: 'data:image/png;base64,smirk_thumb' },
      };

      const project = await repo.createProject({
        title: 'Project with Existing Character',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      // Update project with character
      await repo.updateProject({
        ...project,
        characters: [initialChar],
      });

      // Render workspace
      render(
        <StudioWorkspacePage
          projectId={project.id}
          repository={repo}
          initialProject={{ ...project, characters: [initialChar] }}
        />
      );

      // Switch to characters tab
      fireEvent.click(screen.getByTestId('tab-characters'));

      // Click edit on Konata card
      fireEvent.click(screen.getByTestId('btn-edit-char-konata'));
      expect(screen.getByTestId('modal-character-form')).toBeInTheDocument();

      // Change display name and color
      const nameInput = screen.getByTestId('input-char-name');
      fireEvent.change(nameInput, { target: { value: 'Konata-chan' } });

      const colorInput = screen.getByTestId('input-char-color-hex');
      fireEvent.change(colorInput, { target: { value: '#10b981' } });

      // Submit update
      fireEvent.click(screen.getByTestId('btn-save-character'));

      await waitFor(() => {
        expect(screen.queryByTestId('modal-character-form')).not.toBeInTheDocument();
      });

      // Direct check in repository
      const refreshed = await repo.getProject(project.id);
      expect(refreshed!.characters).toHaveLength(1);
      expect(refreshed!.characters[0]!.id).toBe('konata');
      expect(refreshed!.characters[0]!.name).toBe('Konata-chan');
      expect(refreshed!.characters[0]!.colorHex).toBe('#10b981');
    });

    it('4.3: Deletes character and confirms removal from IndexedDBProjectRepository', async () => {
      const initialChar: Character = {
        id: 'kagami',
        name: 'Hiiragi Kagami',
        colorHex: '#a855f7',
        defaultExpression: 'tsun',
        sprites: {},
      };

      const project = await repo.createProject({
        title: 'Deletion Test Project',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      await repo.updateProject({
        ...project,
        characters: [initialChar],
      });

      render(
        <StudioWorkspacePage
          projectId={project.id}
          repository={repo}
          initialProject={{ ...project, characters: [initialChar] }}
        />
      );

      fireEvent.click(screen.getByTestId('tab-characters'));

      // Click delete button
      fireEvent.click(screen.getByTestId('btn-delete-char-kagami'));

      // Verify card disappears from UI
      await waitFor(() => {
        expect(screen.queryByTestId('character-card-kagami')).not.toBeInTheDocument();
      });

      // Direct check in repository
      const refreshed = await repo.getProject(project.id);
      expect(refreshed!.characters).toHaveLength(0);
    });

    it('4.4: Multi-character isolation: updating or deleting one character leaves others intact in IndexedDB', async () => {
      const char1: Character = {
        id: 'char_1',
        name: 'First Character',
        colorHex: '#38bdf8',
        defaultExpression: 'def1',
        sprites: { def1: 'data:image/png;base64,1' },
      };
      const char2: Character = {
        id: 'char_2',
        name: 'Second Character',
        colorHex: '#ec4899',
        defaultExpression: 'def2',
        sprites: { def2: 'data:image/png;base64,2' },
      };
      const char3: Character = {
        id: 'char_3',
        name: 'Third Character',
        colorHex: '#10b981',
        defaultExpression: 'def3',
        sprites: { def3: 'data:image/png;base64,3' },
      };

      const project = await repo.createProject({
        title: 'Multi Character Isolation Test',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      await repo.updateProject({
        ...project,
        characters: [char1, char2, char3],
      });

      render(
        <StudioWorkspacePage
          projectId={project.id}
          repository={repo}
          initialProject={{ ...project, characters: [char1, char2, char3] }}
        />
      );

      fireEvent.click(screen.getByTestId('tab-characters'));

      // Edit char2
      fireEvent.click(screen.getByTestId('btn-edit-char-char_2'));
      fireEvent.change(screen.getByTestId('input-char-name'), { target: { value: 'Second Character Updated' } });
      fireEvent.click(screen.getByTestId('btn-save-character'));

      await waitFor(() => {
        expect(screen.queryByTestId('modal-character-form')).not.toBeInTheDocument();
      });

      let fresh = await repo.getProject(project.id);
      expect(fresh!.characters).toHaveLength(3);
      expect(fresh!.characters.find((c) => c.id === 'char_1')!.name).toBe('First Character');
      expect(fresh!.characters.find((c) => c.id === 'char_2')!.name).toBe('Second Character Updated');
      expect(fresh!.characters.find((c) => c.id === 'char_3')!.name).toBe('Third Character');

      // Delete char1
      fireEvent.click(screen.getByTestId('btn-delete-char-char_1'));

      await waitFor(() => {
        expect(screen.queryByTestId('character-card-char_1')).not.toBeInTheDocument();
      });

      fresh = await repo.getProject(project.id);
      expect(fresh!.characters).toHaveLength(2);
      expect(fresh!.characters.map((c) => c.id)).toEqual(['char_2', 'char_3']);
      expect(fresh!.characters.find((c) => c.id === 'char_2')!.name).toBe('Second Character Updated');
    });

    it('4.5: Supports Unicode, quotes, and symbols in Display Name and round-trips cleanly', async () => {
      const project = await repo.createProject({
        title: 'Unicode & Symbols Nameplate Test',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      render(
        <StudioWorkspacePage
          projectId={project.id}
          repository={repo}
          initialProject={project}
        />
      );

      fireEvent.click(screen.getByTestId('tab-characters'));
      fireEvent.click(screen.getByTestId('btn-add-character-empty'));

      const complexName = '★ 霧雨 魔理沙 (Marisa) "The Witch" & <Spark> ★';
      fireEvent.change(screen.getByTestId('input-char-id'), { target: { value: 'marisa_witch' } });
      fireEvent.change(screen.getByTestId('input-char-name'), { target: { value: complexName } });

      fireEvent.click(screen.getByTestId('btn-save-character'));

      await waitFor(() => {
        expect(screen.queryByTestId('modal-character-form')).not.toBeInTheDocument();
      });

      const fresh = await repo.getProject(project.id);
      expect(fresh!.characters[0]!.name).toBe(complexName);
      expect(fresh!.characters[0]!.id).toBe('marisa_witch');
    });
  });
});
