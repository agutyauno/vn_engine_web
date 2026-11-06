import { useEffect } from 'react';

export interface KeyboardShortcutOptions {
  onSave?: () => void;
  onTogglePlay?: () => void;
  onRunFromCursor?: () => void;
  onToggleDrawer?: () => void;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
  onCloseTab?: () => void;
  onOpenShortcuts?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(options?: KeyboardShortcutOptions): void {
  const {
    onSave,
    onTogglePlay,
    onRunFromCursor,
    onToggleDrawer,
    onToggleSidebar,
    onOpenSettings,
    onCloseTab,
    onOpenShortcuts,
    enabled = true,
  } = options || {};

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const active = document.activeElement;
      const isTextFocused = Boolean(
        active?.closest('.monaco-editor') ||
        ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '') ||
        (active as HTMLElement)?.isContentEditable,
      );

      // 1. Ctrl + S / Cmd + S (Save)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSave?.();
        return;
      }

      // Alt + F5 (Run from Cursor) - chỉ kích hoạt khi Alt + F5 thuần tuý, không có Ctrl/Cmd
      if (e.altKey && !isCtrlOrCmd && e.key === 'F5') {
        e.preventDefault();
        onRunFromCursor?.();
        return;
      }

      // 2. Ctrl + Enter or F5 (without Alt) (Toggle Play)
      if ((isCtrlOrCmd && e.key === 'Enter') || (!e.altKey && e.key === 'F5')) {
        e.preventDefault();
        onTogglePlay?.();
        return;
      }

      // 3. Ctrl + ` (Toggle Drawer)
      if (isCtrlOrCmd && e.key === '`') {
        e.preventDefault();
        onToggleDrawer?.();
        return;
      }

      // 4. Ctrl + B / Cmd + B (Toggle Sidebar Navigation if provided, else Drawer)
      if (isCtrlOrCmd && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (onToggleSidebar) {
          onToggleSidebar();
        } else if (onToggleDrawer) {
          onToggleDrawer();
        }
        return;
      }

      // 5. Ctrl + , (Open Settings)
      if (isCtrlOrCmd && e.key === ',') {
        e.preventDefault();
        onOpenSettings?.();
        return;
      }

      // 6. Ctrl + F4 or Alt + W (Close Tab)
      if ((isCtrlOrCmd && e.key === 'F4') || (e.altKey && (e.key === 'w' || e.key === 'W'))) {
        e.preventDefault();
        onCloseTab?.();
        return;
      }

      // 7. ? or Ctrl + / (Open Shortcuts Help)
      if (isCtrlOrCmd && e.key === '/') {
        e.preventDefault();
        onOpenShortcuts?.();
        return;
      }

      if (e.key === '?') {
        if (isTextFocused) return;
        e.preventDefault();
        onOpenShortcuts?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    onSave,
    onTogglePlay,
    onRunFromCursor,
    onToggleDrawer,
    onToggleSidebar,
    onOpenSettings,
    onCloseTab,
    onOpenShortcuts,
  ]);
}
