// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageLightboxModal } from '../../src/components/common/ImageLightboxModal';

describe('Phase 1: ImageLightboxModal Component (TDD)', () => {
  const defaultProps = {
    isOpen: true,
    imageUrl: 'https://cdn.example.com/character_preview.png',
    title: 'Alice Margatroid — smile',
    subtitle: '124.5 KB',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('TC-LIGHTBOX-01: renders modal when isOpen is true and imageUrl is provided; hides when isOpen is false', () => {
    const { rerender } = render(<ImageLightboxModal {...defaultProps} />);

    const modal = screen.getByTestId('modal-image-lightbox');
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');

    // Title & subtitle
    expect(screen.getByTestId('lightbox-title')).toHaveTextContent('Alice Margatroid — smile');
    expect(screen.getByTestId('lightbox-subtitle')).toHaveTextContent('124.5 KB');

    // Image preview
    const img = screen.getByTestId('lightbox-image') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe('https://cdn.example.com/character_preview.png');
    expect(img.alt).toBe('Alice Margatroid — smile');

    // Rerender with isOpen = false
    rerender(<ImageLightboxModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('modal-image-lightbox')).not.toBeInTheDocument();

    // Rerender with imageUrl = null
    rerender(<ImageLightboxModal {...defaultProps} isOpen={true} imageUrl={null} />);
    expect(screen.queryByTestId('modal-image-lightbox')).not.toBeInTheDocument();
  });

  it('TC-LIGHTBOX-02: calls onClose when close button or backdrop is clicked, but not when image content is clicked', () => {
    const onCloseMock = vi.fn();
    render(<ImageLightboxModal {...defaultProps} onClose={onCloseMock} />);

    // Click close button
    const btnClose = screen.getByTestId('btn-close-lightbox');
    expect(btnClose).toHaveAttribute('aria-label', 'Close image preview');
    fireEvent.click(btnClose);
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    // Click backdrop
    const backdrop = screen.getByTestId('modal-image-lightbox');
    fireEvent.click(backdrop);
    expect(onCloseMock).toHaveBeenCalledTimes(2);

    // Click inside content box
    const contentBox = screen.getByTestId('lightbox-content');
    fireEvent.click(contentBox);
    expect(onCloseMock).toHaveBeenCalledTimes(2); // Should not increase
  });

  it('TC-LIGHTBOX-03: triggers onClose when Escape key is pressed', () => {
    const onCloseMock = vi.fn();
    render(<ImageLightboxModal {...defaultProps} onClose={onCloseMock} />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    // Other keys do nothing
    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('TC-LIGHTBOX-04: applies default z-50 class or custom zIndexClass (e.g. z-60 for stacked modals)', () => {
    const { rerender } = render(<ImageLightboxModal {...defaultProps} />);
    let modal = screen.getByTestId('modal-image-lightbox');
    expect(modal.className).toContain('z-50');

    rerender(<ImageLightboxModal {...defaultProps} zIndexClass="z-60" />);
    modal = screen.getByTestId('modal-image-lightbox');
    expect(modal.className).toContain('z-60');
    expect(modal.className).not.toContain('z-50');
  });
});

