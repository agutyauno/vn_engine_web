import { useEffect } from 'react';

export interface KeyboardShortcutOptions {
  onSave?: () => void;
  onTogglePlay?: () => void;
  onToggleDrawer?: () => void;
  onOpenSettings?: () => void;
  onCloseTab?: () => void;
  onOpenShortcuts?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(options?: KeyboardShortcutOptions): void {
  const {
    onSave,
    onTogglePlay,
    onToggleDrawer,
    onOpenSettings,
    onCloseTab,
    onOpenShortcuts,
    enabled = true,
  } = options || {};

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const active = document.activeElement;
      const isTextFocused = Boolean(
        active?.closest('.monaco-editor') ||
        ['INPUT', 'TEXTAREA'].includes(active?.tagName ?? '') ||
        (active as HTMLElement)?.isContentEditable
      );

      // 1. Ctrl + S / Cmd + S (Save)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSave?.();
        return;
      }

      // 2. Ctrl + Enter or F5 (Toggle Play)
      if ((isCtrlOrCmd && e.key === 'Enter') || e.key === 'F5') {
        e.preventDefault();
        onTogglePlay?.();
        return;
      }

      // 3. Ctrl + ` or Ctrl + B (Toggle Drawer)
      if (isCtrlOrCmd && (e.key === '`' || e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        onToggleDrawer?.();
        return;
      }

      // 4. Ctrl + , (Open Settings)
      if (isCtrlOrCmd && e.key === ',') {
        e.preventDefault();
        onOpenSettings?.();
        return;
      }

      // 5. Ctrl + F4 or Alt + W (Close Tab)
      if ((isCtrlOrCmd && e.key === 'F4') || (e.altKey && (e.key === 'w' || e.key === 'W'))) {
        e.preventDefault();
        onCloseTab?.();
        return;
      }

      // 6. ? or Ctrl + / (Open Shortcuts Help)
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
  }, [enabled, onSave, onTogglePlay, onToggleDrawer, onOpenSettings, onCloseTab, onOpenShortcuts]);
}

