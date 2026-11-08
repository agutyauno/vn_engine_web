// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Character } from '@vn-engine/shared-types';
import { CharacterModal } from '../../src/components/characters/CharacterModal';

describe('Phase 3: CharacterModal Sprite Expression Preview (TDD)', () => {
  const mockAlice: Character = {
    id: 'alice',
    name: 'Alice Margatroid',
    defaultExpression: 'smile',
    colorHex: '#38bdf8',
    sprites: {
      smile: 'https://cdn.example.com/alice_smile.png',
      angry: 'https://cdn.example.com/alice_angry.png',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('TC-MODAL-PREVIEW-01: clicking expression thumbnail in Sprite Expressions table opens Lightbox Modal with z-60 and correct details', () => {
    render(
      <CharacterModal
        isOpen={true}
        initialData={mockAlice}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    // Find thumbnail for expression row 0
    const thumbnail0 = screen.getByTestId('expr-thumbnail-0');
    expect(thumbnail0).toBeInTheDocument();

    // Click thumbnail to trigger lightbox preview
    fireEvent.click(thumbnail0);

    // Assert Lightbox Modal is open
    const lightboxModal = screen.getByTestId(/^(image-lightbox-modal|modal-image-lightbox)$/);
    expect(lightboxModal).toBeInTheDocument();

    // Assert lightbox modal element has class z-60 (to overlay properly above CharacterModal z-50)
    expect(lightboxModal.className).toContain('z-60');

    // Assert lightbox image has correct src
    const lightboxImg = screen.getByTestId(/^(lightbox-img|lightbox-image)$/) as HTMLImageElement;
    expect(lightboxImg).toBeInTheDocument();
    expect(lightboxImg.src).toBe('https://cdn.example.com/alice_smile.png');

    // Assert title contains 'Alice Margatroid — smile'
    const lightboxTitle = screen.getByTestId('lightbox-title');
    expect(lightboxTitle).toHaveTextContent('Alice Margatroid — smile');
  });

  it('TC-MODAL-PREVIEW-02: closing Lightbox does not close CharacterModal or discard uncommitted form edits', () => {
    const onCloseMock = vi.fn();
    render(
      <CharacterModal
        isOpen={true}
        initialData={mockAlice}
        onClose={onCloseMock}
        onSave={vi.fn()}
      />,
    );

    // Modify character display name (uncommitted form edit)
    const nameInput = screen.getByTestId('input-char-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice Altered' } });
    expect(nameInput.value).toBe('Alice Altered');

    // Click expr-thumbnail-0 to open Lightbox
    const thumbnail0 = screen.getByTestId('expr-thumbnail-0');
    fireEvent.click(thumbnail0);

    // Assert Lightbox is open and title dynamically reflects the uncommitted name 'Alice Altered — smile'
    const lightboxModal = screen.getByTestId(/^(image-lightbox-modal|modal-image-lightbox)$/);
    expect(lightboxModal).toBeInTheDocument();

    const lightboxTitle = screen.getByTestId('lightbox-title');
    expect(lightboxTitle).toHaveTextContent('Alice Altered — smile');

    // Click close button on lightbox
    const btnCloseLightbox = screen.getByTestId('btn-close-lightbox');
    fireEvent.click(btnCloseLightbox);

    // Assert Lightbox is closed
    expect(screen.queryByTestId(/^(image-lightbox-modal|modal-image-lightbox)$/)).not.toBeInTheDocument();

    // Assert onCloseMock was NOT called (CharacterModal is still open)
    expect(onCloseMock).not.toHaveBeenCalled();

    // Assert CharacterModal form container is still in the document
    expect(screen.getByTestId(/^(modal-character-form|modal-character)$/)).toBeInTheDocument();

    // Assert the input field still preserves uncommitted edits
    expect(screen.getByTestId('input-char-name')).toHaveValue('Alice Altered');
  });
});
