import React, { useEffect } from 'react';
import { HelpCircleIcon, XIcon } from '../common/Icons';

export interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

const SHORTCUT_GROUPS: { group: string; items: ShortcutItem[] }[] = [
  {
    group: 'General & Navigation',
    items: [
      { keys: ['Ctrl + S'], description: 'Save current project and scripts' },
      { keys: ['Ctrl + ,'], description: 'Open Project Settings dialog' },
      { keys: ['?', 'Ctrl + /'], description: 'Open this Keyboard Shortcuts cheat-sheet' },
      { keys: ['Esc'], description: 'Close active modal dialog' },
    ],
  },
  {
    group: 'Editor & Layout',
    items: [
      { keys: ['Ctrl + B'], description: 'Toggle navigation sidebar' },
      { keys: ['Ctrl + `'], description: 'Toggle bottom Problems & Diagnostics drawer' },
      { keys: ['Ctrl + F4', 'Alt + W'], description: 'Close current active script tab' },
    ],
  },
  {
    group: 'Live Preview',
    items: [
      { keys: ['Ctrl + Enter', 'F5'], description: 'Toggle Live Preview playback' },
    ],
  },
];

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="modal-shortcuts-help"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
    >
      <div className="flex w-full max-w-xl flex-col rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-4 bg-neutral-950">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
            <HelpCircleIcon size={16} className="text-neutral-400" />
            <span id="shortcuts-modal-title">Keyboard Shortcuts</span>
          </div>

          <button
            type="button"
            data-testid="btn-close-shortcuts"
            onClick={onClose}
            title="Close shortcuts help"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="max-h-[480px] overflow-y-auto p-5 text-xs space-y-5">
          {SHORTCUT_GROUPS.map((section) => (
            <div key={section.group} className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {section.group}
              </h3>
              <div className="divide-y divide-neutral-800/80 rounded border border-neutral-800 bg-neutral-950/60">
                {section.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2">
                    <span className="text-neutral-300">{item.description}</span>
                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      {item.keys.map((k, kIdx) => (
                        <span key={kIdx} className="flex items-center gap-1">
                          {kIdx > 0 && <span className="text-neutral-600">or</span>}
                          <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-neutral-200 shadow-xs">
                            {k}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex h-12 items-center justify-end border-t border-neutral-800 px-4 bg-neutral-950">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-neutral-800 px-3.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
