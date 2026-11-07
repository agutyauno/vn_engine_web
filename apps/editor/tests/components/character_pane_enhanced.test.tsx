// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Character, AssetRef } from '@vn-engine/shared-types';
import { CharacterManagerPane } from '../../src/components/characters/CharacterManagerPane';
import { useEditorUIStore } from '../../src/core/stores/uiStore';
import { setupTestStore } from '../testStoreHelpers';

describe('Phase 2: CharacterManagerPane Enhanced (Grid/List & Expression Accordion)', () => {
  const mockCharacters: Character[] = [
    {
      id: 'alice',
      name: 'Alice Margatroid',
      defaultExpression: 'smile',
      colorHex: '#38bdf8',
      sprites: {
        smile: 'asset-smile-uuid',
        angry: 'asset-angry-uuid',
        sad: 'asset-missing-uuid',
      },
    },
    {
      id: 'marisa',
      name: 'Marisa Kirisame',
      colorHex: '#eab308',
      sprites: {},
    },
  ];

  const mockAssets: AssetRef[] = [
    {
      id: 'asset-smile-uuid',
      name: 'alice_smile.png',
      type: 'image',
      category: 'sprite',
      storageUrl: 'https://cdn.example.com/alice_smile.png',
      sizeBytes: 1024,
    },
    {
      id: 'asset-angry-uuid',
      name: 'alice_angry.png',
      type: 'image',
      category: 'sprite',
      storageUrl: 'https://cdn.example.com/alice_angry.png',
      sizeBytes: 2048,
    },
  ];

  const defaultProps = {
    characters: mockCharacters,
    assets: mockAssets,
    onCreateCharacter: vi.fn(),
    onEditCharacter: vi.fn(),
    onDeleteCharacter: vi.fn(),
    onInsertSnippet: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    setupTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('TC-CHAR-VIEW-01: toggles between list view and grid view', () => {
    render(<CharacterManagerPane {...defaultProps} />);

    // Default view mode is 'list'
    const btnGrid = screen.getByRole('button', { name: /grid view/i });
    const btnList = screen.getByRole('button', { name: /list view/i });
    expect(btnGrid).toBeInTheDocument();
    expect(btnList).toBeInTheDocument();

    // In list view, character container has list layout
    const charListContainer = screen.getByTestId('char-list-container');
    expect(charListContainer).toHaveAttribute('data-view-mode', 'list');

    // Switch to grid view
    fireEvent.click(btnGrid);
    expect(useEditorUIStore.getState().characterViewMode).toBe('grid');
    expect(charListContainer).toHaveAttribute('data-view-mode', 'grid');
  });

  it('TC-CHAR-ACCORDION-01: toggles expression accordion in list view', () => {
    render(<CharacterManagerPane {...defaultProps} />);

    // Accordion toggle button for Alice
    const btnAccordionAlice = screen.getByTestId('btn-accordion-alice');
    expect(btnAccordionAlice).toBeInTheDocument();

    // Initially accordion is collapsed
    expect(screen.queryByTestId('accordion-content-alice')).not.toBeInTheDocument();

    // Click to expand accordion
    fireEvent.click(btnAccordionAlice);
    const content = screen.getByTestId('accordion-content-alice');
    expect(content).toBeInTheDocument();

    // Alice has smile, angry, sad expressions
    expect(screen.getByTestId('expr-item-alice-smile')).toBeInTheDocument();
    expect(screen.getByTestId('expr-item-alice-angry')).toBeInTheDocument();
    expect(screen.getByTestId('expr-item-alice-sad')).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(btnAccordionAlice);
    expect(screen.queryByTestId('accordion-content-alice')).not.toBeInTheDocument();
  });

  it('TC-CHAR-ACCORDION-02: resolves sprite storageUrl from assets and displays fallback when missing', () => {
    render(<CharacterManagerPane {...defaultProps} />);

    // Expand Alice accordion
    fireEvent.click(screen.getByTestId('btn-accordion-alice'));

    // 'smile' is in mockAssets -> resolves to storageUrl
    const smileImg = screen.getByTestId('expr-img-alice-smile') as HTMLImageElement;
    expect(smileImg.src).toBe('https://cdn.example.com/alice_smile.png');

    // 'sad' is 'asset-missing-uuid' (not in mockAssets) -> renders fallback placeholder/icon
    expect(screen.queryByTestId('expr-img-alice-sad')).not.toBeInTheDocument();
    expect(screen.getByTestId('expr-fallback-alice-sad')).toBeInTheDocument();
  });

  it('TC-CHAR-COPY-01: copies snippet and switches icon to check feedback for 1500ms', async () => {
    const originalClipboard = navigator.clipboard;
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<CharacterManagerPane {...defaultProps} />);

    // Copy character card snippet: `show alice`
    const btnCopyAlice = screen.getByTestId('btn-copy-char-alice');
    expect(btnCopyAlice).toHaveAttribute('title', 'Copy DSL snippet');

    fireEvent.click(btnCopyAlice);
    expect(writeTextMock).toHaveBeenCalledWith('show alice');
    expect(btnCopyAlice).toHaveAttribute('data-copied', 'true');

    // Fast-forward 1500ms
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(btnCopyAlice).toHaveAttribute('data-copied', 'false');

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('TC-CHAR-DRAG-01: sets text/plain drag data for character card and expression item', () => {
    render(<CharacterManagerPane {...defaultProps} />);

    // Expand Alice accordion
    fireEvent.click(screen.getByTestId('btn-accordion-alice'));

    // Character Card Drag
    const cardAlice = screen.getByTestId('character-card-alice');
    const charDataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
    };
    fireEvent.dragStart(cardAlice, { dataTransfer: charDataTransfer });
    expect(charDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'show alice\n');

    // Expression Item Drag
    const exprSmile = screen.getByTestId('expr-item-alice-smile');
    const exprDataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
    };
    fireEvent.dragStart(exprSmile, { dataTransfer: exprDataTransfer });
    expect(exprDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'show alice.smile\n');
  });

  it('TC-CHAR-INSERT-01: calls onInsertSnippet when insert button is clicked', () => {
    const onInsertSnippetMock = vi.fn();
    render(
      <CharacterManagerPane
        {...defaultProps}
        onInsertSnippet={onInsertSnippetMock}
      />,
    );

    // Click insert on Alice character card
    const btnInsertAlice = screen.getByTestId('btn-insert-char-alice');
    fireEvent.click(btnInsertAlice);
    expect(onInsertSnippetMock).toHaveBeenCalledWith('show alice');

    // Expand accordion and insert expression
    fireEvent.click(screen.getByTestId('btn-accordion-alice'));
    const btnInsertSmile = screen.getByTestId('btn-insert-expr-alice-smile');
    fireEvent.click(btnInsertSmile);
    expect(onInsertSnippetMock).toHaveBeenCalledWith('show alice.smile');
  });
});
