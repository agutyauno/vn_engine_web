// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook } from '@testing-library/react';
import { ShortcutsHelpModal } from '../../src/components/studio/ShortcutsHelpModal';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';

describe('Shortcuts & Navigation Hooks (Phase 4 TDD)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TC-SHORTCUT-01: Global hotkeys trigger
  describe('TC-SHORTCUT-01: Global Hotkeys Triggering', () => {
    it('triggers onSave when Ctrl+S is pressed and prevents default', () => {
      const handleSave = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSave: handleSave }));

      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      window.dispatchEvent(event);

      expect(handleSave).toHaveBeenCalledTimes(1);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('triggers onTogglePlay when Ctrl+Enter or F5 is pressed', () => {
      const handleTogglePlay = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onTogglePlay: handleTogglePlay }));

      // Ctrl + Enter
      const ctrlEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlEnter);
      expect(handleTogglePlay).toHaveBeenCalledTimes(1);

      // F5
      const f5 = new KeyboardEvent('keydown', {
        key: 'F5',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(f5, 'preventDefault');
      window.dispatchEvent(f5);
      expect(handleTogglePlay).toHaveBeenCalledTimes(2);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('triggers onToggleDrawer when Ctrl+` or Ctrl+B is pressed', () => {
      const handleToggleDrawer = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onToggleDrawer: handleToggleDrawer }));

      // Ctrl + `
      const ctrlBacktick = new KeyboardEvent('keydown', {
        key: '`',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlBacktick);
      expect(handleToggleDrawer).toHaveBeenCalledTimes(1);

      // Ctrl + B
      const ctrlB = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlB);
      expect(handleToggleDrawer).toHaveBeenCalledTimes(2);
    });

    it('triggers onOpenSettings when Ctrl+, is pressed', () => {
      const handleOpenSettings = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onOpenSettings: handleOpenSettings }));

      const ctrlComma = new KeyboardEvent('keydown', {
        key: ',',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlComma);
      expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('triggers onCloseTab when Ctrl+F4 or Alt+W is pressed', () => {
      const handleCloseTab = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onCloseTab: handleCloseTab }));

      const ctrlF4 = new KeyboardEvent('keydown', {
        key: 'F4',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlF4);
      expect(handleCloseTab).toHaveBeenCalledTimes(1);

      const altW = new KeyboardEvent('keydown', {
        key: 'w',
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(altW);
      expect(handleCloseTab).toHaveBeenCalledTimes(2);
    });

    it('triggers onOpenShortcuts when ? or Ctrl+/ is pressed', () => {
      const handleOpenShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onOpenShortcuts: handleOpenShortcuts }));

      // Single ?
      const questionKey = new KeyboardEvent('keydown', {
        key: '?',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(questionKey);
      expect(handleOpenShortcuts).toHaveBeenCalledTimes(1);

      // Ctrl+/
      const ctrlSlash = new KeyboardEvent('keydown', {
        key: '/',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlSlash);
      expect(handleOpenShortcuts).toHaveBeenCalledTimes(2);
    });

    it('does not trigger hotkeys when enabled is false', () => {
      const handleSave = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSave: handleSave, enabled: false }));

      const ctrlS = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlS);
      expect(handleSave).not.toHaveBeenCalled();
    });
  });

  // TC-SHORTCUT-02: Text Focus Guard
  describe('TC-SHORTCUT-02: Text Focus Guard', () => {
    it('blocks single key "?" shortcut when focus is inside an <input>', () => {
      const handleOpenShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onOpenShortcuts: handleOpenShortcuts }));

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent('keydown', {
        key: '?',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);

      expect(handleOpenShortcuts).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('blocks single key "?" shortcut when focus is inside a <textarea>', () => {
      const handleOpenShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onOpenShortcuts: handleOpenShortcuts }));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const event = new KeyboardEvent('keydown', {
        key: '?',
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(event);

      expect(handleOpenShortcuts).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('blocks single key "?" shortcut when focus is inside Monaco Editor (.monaco-editor)', () => {
      const handleOpenShortcuts = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onOpenShortcuts: handleOpenShortcuts }));

      const editorContainer = document.createElement('div');
      editorContainer.className = 'monaco-editor';
      const innerEditor = document.createElement('div');
      innerEditor.tabIndex = 0;
      editorContainer.appendChild(innerEditor);
      document.body.appendChild(editorContainer);
      innerEditor.focus();

      const event = new KeyboardEvent('keydown', {
        key: '?',
        bubbles: true,
        cancelable: true,
      });
      innerEditor.dispatchEvent(event);

      expect(handleOpenShortcuts).not.toHaveBeenCalled();
      document.body.removeChild(editorContainer);
    });
  });

  // TC-SHORTCUT-03: Escape key dismiss
  describe('TC-SHORTCUT-03: Escape Key Dismissal', () => {
    it('invokes onClose when Escape key is pressed with modal open', () => {
      const handleClose = vi.fn();
      render(<ShortcutsHelpModal isOpen={true} onClose={handleClose} />);

      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(escEvent);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  // TC-SHORTCUT-04: ShortcutsHelpModal Rendering & Rule 8
  describe('TC-SHORTCUT-04: ShortcutsHelpModal UI and Rule 8 Compliance', () => {
    it('renders modal dialog with shortcut list when isOpen is true', () => {
      const handleClose = vi.fn();
      render(<ShortcutsHelpModal isOpen={true} onClose={handleClose} />);

      expect(screen.getByTestId('modal-shortcuts-help')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Check key bindings listed
      expect(screen.getByText(/Ctrl\s*\+\s*S/i)).toBeInTheDocument();
      expect(screen.getByText(/Ctrl\s*\+\s*Enter/i)).toBeInTheDocument();
      expect(screen.getByText(/Ctrl\s*\+\s*,/i)).toBeInTheDocument();

      // Close button
      const closeBtn = screen.getByTestId('btn-close-shortcuts');
      expect(closeBtn).toBeInTheDocument();
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not render when isOpen is false', () => {
      render(<ShortcutsHelpModal isOpen={false} onClose={vi.fn()} />);

      expect(screen.queryByTestId('modal-shortcuts-help')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('contains no colored emojis (Rule 8 compliance)', () => {
      const { container } = render(<ShortcutsHelpModal isOpen={true} onClose={vi.fn()} />);

      const emojiRegex =
        /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
      const text = container.textContent || '';
      expect(emojiRegex.test(text)).toBe(false);
    });
  });
});
