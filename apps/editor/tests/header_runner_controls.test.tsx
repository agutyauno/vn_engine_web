// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, cleanup } from '@testing-library/react';
import { StudioHeader, type StudioHeaderProps } from '../src/components/studio/StudioHeader';
import { EditorTabBar, type EditorTabBarProps } from '../src/components/studio/EditorTabBar';
import { useKeyboardShortcuts, type KeyboardShortcutOptions } from '../src/hooks/useKeyboardShortcuts';
import type { ScriptFile } from '@vn-engine/shared-types';

type ExtendedKeyboardShortcutOptions = KeyboardShortcutOptions & {
  onRunFromCursor?: () => void;
};

const mockFiles: ScriptFile[] = [
  { id: 'file-1', name: 'main.vns', content: 'scene intro {}', order: 0, version: 1 },
  { id: 'file-2', name: 'chapter1.vns', content: 'scene ch1 {}', order: 1, version: 1 },
];

describe('Studio Header & TabBar Runner Controls (TASK-editor-ui-and-diagnostics-polish)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Keyboard Shortcuts (useKeyboardShortcuts)
  // =========================================================================
  describe('Keyboard Shortcuts (useKeyboardShortcuts)', () => {
    it('TEST-EDT-01: should trigger onRunFromCursor when pressing Alt + F5', () => {
      const handleRunFromCursor = vi.fn();
      const handleTogglePlay = vi.fn();

      renderHook(() =>
        (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
          onRunFromCursor: handleRunFromCursor,
          onTogglePlay: handleTogglePlay,
          enabled: true,
        })
      );

      const altF5Event = new KeyboardEvent('keydown', {
        key: 'F5',
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(altF5Event);

      expect(handleRunFromCursor).toHaveBeenCalledTimes(1);
      expect(handleTogglePlay).not.toHaveBeenCalled();
      expect(altF5Event.defaultPrevented).toBe(true);
    });

    it('TEST-EDT-01 (Edge): should not trigger onRunFromCursor when shortcut is disabled or other modifiers pressed', () => {
      const handleRunFromCursor = vi.fn();

      const { rerender } = renderHook(
        ({ enabled }) =>
          (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
            onRunFromCursor: handleRunFromCursor,
            enabled,
          }),
        { initialProps: { enabled: false } }
      );

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F5', altKey: true, bubbles: true, cancelable: true })
      );
      expect(handleRunFromCursor).not.toHaveBeenCalled();

      rerender({ enabled: true });
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F5',
          altKey: true,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      expect(handleRunFromCursor).not.toHaveBeenCalled();
    });

    it('TEST-EDT-02: should trigger onTogglePlay when pressing F5 or Ctrl + Enter', () => {
      const handleTogglePlay = vi.fn();
      const handleRunFromCursor = vi.fn();

      renderHook(() =>
        (useKeyboardShortcuts as (options?: ExtendedKeyboardShortcutOptions) => void)({
          onTogglePlay: handleTogglePlay,
          onRunFromCursor: handleRunFromCursor,
          enabled: true,
        })
      );

      const f5Event = new KeyboardEvent('keydown', {
        key: 'F5',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(f5Event);

      expect(handleTogglePlay).toHaveBeenCalledTimes(1);
      expect(handleRunFromCursor).not.toHaveBeenCalled();
      expect(f5Event.defaultPrevented).toBe(true);

      const ctrlEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ctrlEnterEvent);

      expect(handleTogglePlay).toHaveBeenCalledTimes(2);
      expect(handleRunFromCursor).not.toHaveBeenCalled();
      expect(ctrlEnterEvent.defaultPrevented).toBe(true);

      const cmdEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(cmdEnterEvent);

      expect(handleTogglePlay).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // 2. StudioHeader Minimalist Design (TEST-UI-01, TEST-UI-02, TEST-UI-03)
  // =========================================================================
  describe('StudioHeader Minimalist Design', () => {
    it('TEST-UI-01: should NOT render header-save-status badge or "Saved to IndexedDB" text', () => {
      render(
        <StudioHeader
          projectTitle="Visual Novel Polish"
          isDirty={false}
          isSaving={false}
        />
      );

      expect(screen.queryByTestId('header-save-status')).not.toBeInTheDocument();
      expect(screen.queryByText(/Saved to IndexedDB/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Saving\.\.\./i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();
    });

    it('TEST-UI-02: should render header-dirty-dot when isDirty is true and hide when false', () => {
      const { rerender } = render(
        <StudioHeader
          projectTitle="Visual Novel Polish"
          isDirty={true}
        />
      );

      expect(screen.getByTestId('header-dirty-dot')).toBeInTheDocument();

      rerender(
        <StudioHeader
          projectTitle="Visual Novel Polish"
          isDirty={false}
        />
      );

      expect(screen.queryByTestId('header-dirty-dot')).not.toBeInTheDocument();
    });

    it('TEST-UI-03: should NOT render runner controls or scene selector in StudioHeader', () => {
      render(
        <StudioHeader
          projectTitle="Visual Novel Polish"
        />
      );

      expect(screen.queryByTestId('btn-header-play')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-header-run-cursor')).not.toBeInTheDocument();
      expect(screen.queryByTestId('select-header-scene')).not.toBeInTheDocument();
      expect(screen.queryByTestId('header-preview-status')).not.toBeInTheDocument();
    });

    it('strictly satisfies Rule 8: zero colored OS emojis in StudioHeader DOM', () => {
      const { container } = render(
        <StudioHeader
          projectTitle="Compliance VN"
          isDirty={true}
        />
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });

  // =========================================================================
  // 3. EditorTabBar Runner Controls (TEST-UI-04, TEST-UI-05, TEST-UI-06, TEST-UI-07)
  // =========================================================================
  describe('EditorTabBar Runner Controls', () => {
    it('TEST-UI-04: renders runner controls (Play, Run from Cursor) and connection status dot in EditorTabBar', () => {
      const { rerender } = render(
        <EditorTabBar
          files={mockFiles}
          openFileIds={['file-1']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onQuickPlay={vi.fn()}
          onRunFromCursor={vi.fn()}
          connectionStatus="connected"
        />
      );

      const playBtn = screen.getByTestId('btn-tabbar-play');
      expect(playBtn).toBeInTheDocument();
      expect(playBtn).toHaveAttribute('title', expect.stringContaining('Play (F5)'));

      const runCursorBtn = screen.getByTestId('btn-tabbar-run-cursor');
      expect(runCursorBtn).toBeInTheDocument();
      expect(runCursorBtn).toHaveAttribute('title', expect.stringContaining('Run from Cursor (Alt+F5)'));

      const previewStatus = screen.getByTestId('tabbar-preview-status');
      expect(previewStatus).toBeInTheDocument();
      expect(previewStatus).toHaveAttribute('data-status', 'connected');

      rerender(
        <EditorTabBar
          files={mockFiles}
          openFileIds={['file-1']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          connectionStatus="disconnected"
        />
      );
      expect(screen.getByTestId('tabbar-preview-status')).toHaveAttribute('data-status', 'disconnected');
    });

    it('TEST-UI-05: clicking Play button triggers onQuickPlay callback', () => {
      const handleQuickPlay = vi.fn();
      render(
        <EditorTabBar
          files={mockFiles}
          openFileIds={['file-1']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onQuickPlay={handleQuickPlay}
        />
      );

      const playBtn = screen.getByTestId('btn-tabbar-play');
      fireEvent.click(playBtn);
      expect(handleQuickPlay).toHaveBeenCalledTimes(1);
    });

    it('TEST-UI-06: clicking Run from Cursor button triggers onRunFromCursor callback', () => {
      const handleRunFromCursor = vi.fn();
      render(
        <EditorTabBar
          files={mockFiles}
          openFileIds={['file-1']}
          activeFileId="file-1"
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onRunFromCursor={handleRunFromCursor}
        />
      );

      const runCursorBtn = screen.getByTestId('btn-tabbar-run-cursor');
      fireEvent.click(runCursorBtn);
      expect(handleRunFromCursor).toHaveBeenCalledTimes(1);
    });

    it('TEST-UI-07 (Edge): renders runner controls gracefully even when no tabs are open', () => {
      render(
        <EditorTabBar
          files={[]}
          openFileIds={[]}
          activeFileId=""
          dirtyFileIds={new Set()}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onQuickPlay={vi.fn()}
          onRunFromCursor={vi.fn()}
        />
      );

      expect(screen.getByTestId('btn-tabbar-play')).toBeInTheDocument();
      expect(screen.getByTestId('btn-tabbar-run-cursor')).toBeInTheDocument();
    });

    it('strictly satisfies Rule 8: zero colored OS emojis in EditorTabBar DOM', () => {
      const { container } = render(
        <EditorTabBar
          files={mockFiles}
          openFileIds={['file-1']}
          activeFileId="file-1"
          dirtyFileIds={new Set(['file-1'])}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onQuickPlay={vi.fn()}
          onRunFromCursor={vi.fn()}
          connectionStatus="connected"
        />
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });
});
