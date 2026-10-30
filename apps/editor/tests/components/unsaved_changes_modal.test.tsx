// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import {
  UnsavedChangesModal,
  type UnsavedChangesModalProps,
} from '../../src/components/studio/UnsavedChangesModal';

describe('UnsavedChangesModal Component (Phase 4 TDD)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TC-UNSAVED-01: Visibility
  describe('TC-UNSAVED-01: Visibility Control', () => {
    it('renders the modal when isOpen is true', () => {
      render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={vi.fn()}
          onDiscardAndContinue={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('modal-unsaved-changes')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Unsaved Changes/i)).toBeInTheDocument();
    });

    it('does not render anything when isOpen is false', () => {
      render(
        <UnsavedChangesModal
          isOpen={false}
          onSaveAndContinue={vi.fn()}
          onDiscardAndContinue={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByTestId('modal-unsaved-changes')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // TC-UNSAVED-02: Save & Continue
  describe('TC-UNSAVED-02: Save & Continue Action', () => {
    it('invokes onSaveAndContinue when "Save & Continue" button is clicked', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={handleSave}
          onDiscardAndContinue={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const saveBtn = screen.getByTestId('btn-save-and-continue');
      expect(saveBtn).toBeInTheDocument();
      fireEvent.click(saveBtn);

      expect(handleSave).toHaveBeenCalledTimes(1);
    });
  });

  // TC-UNSAVED-03: Don't Save / Discard
  describe('TC-UNSAVED-03: Discard Changes Action', () => {
    it('invokes onDiscardAndContinue when "Don\'t Save" button is clicked', () => {
      const handleDiscard = vi.fn();
      render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={vi.fn()}
          onDiscardAndContinue={handleDiscard}
          onCancel={vi.fn()}
        />
      );

      const discardBtn = screen.getByTestId('btn-discard-and-continue');
      expect(discardBtn).toBeInTheDocument();
      fireEvent.click(discardBtn);

      expect(handleDiscard).toHaveBeenCalledTimes(1);
    });
  });

  // TC-UNSAVED-04: Cancel Action & Close
  describe('TC-UNSAVED-04: Cancel Action', () => {
    it('invokes onCancel when "Cancel" button is clicked', () => {
      const handleCancel = vi.fn();
      render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={vi.fn()}
          onDiscardAndContinue={vi.fn()}
          onCancel={handleCancel}
        />
      );

      const cancelBtn = screen.getByTestId('btn-cancel-unsaved');
      expect(cancelBtn).toBeInTheDocument();
      fireEvent.click(cancelBtn);

      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('invokes onCancel when the header close (X) button is clicked', () => {
      const handleCancel = vi.fn();
      render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={vi.fn()}
          onDiscardAndContinue={vi.fn()}
          onCancel={handleCancel}
        />
      );

      const closeBtn = screen.getByTestId('btn-close-unsaved');
      expect(closeBtn).toBeInTheDocument();
      fireEvent.click(closeBtn);

      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  // Rule 8: Clean Monochrome Iconography (No color emojis)
  describe('Rule 8 Compliance: No Color Emojis', () => {
    it('contains no colored emojis in the rendered HTML or text content', () => {
      const { container } = render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={vi.fn()}
          onDiscardAndContinue={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
      const text = container.textContent || '';
      expect(emojiRegex.test(text)).toBe(false);
    });
  });
});
