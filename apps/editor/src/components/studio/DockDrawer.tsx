import React, { useEffect } from 'react';
import {
  AlertCircleIcon,
  SlidersIcon,
  TerminalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '../common/Icons';

export type DrawerTab = 'problems' | 'cheats' | 'console';

export interface DockDrawerProps {
  isOpen: boolean;
  activeTab: DrawerTab;
  errorCount: number;
  warningCount?: number;
  onToggleDrawer: () => void;
  onSelectTab: (tab: DrawerTab) => void;
  children: React.ReactNode;
}

export const DockDrawer: React.FC<DockDrawerProps> = ({
  isOpen,
  activeTab,
  errorCount,
  warningCount = 0,
  onToggleDrawer,
  onSelectTab,
  children,
}) => {
  // Global keyboard shortcut: Ctrl + ` (backtick)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        onToggleDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleDrawer]);

  return (
    <div
      data-testid="dock-drawer"
      className="flex flex-col border-t border-neutral-800 bg-neutral-900/95 text-xs shrink-0 select-none transition-all duration-150"
      style={{ height: isOpen ? '180px' : '30px' }}
    >
      {/* Drawer Header Bar */}
      <div className="flex h-[30px] items-center justify-between border-b border-neutral-800 px-3 bg-neutral-950">
        <div className="flex items-center gap-1">
          {/* Problems Tab */}
          <button
            type="button"
            data-testid="tab-drawer-problems"
            onClick={() => {
              if (!isOpen) onToggleDrawer();
              onSelectTab('problems');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition rounded-t ${
              activeTab === 'problems' && isOpen
                ? 'bg-neutral-900 text-white border-b-2 border-amber-500'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <AlertCircleIcon size={12} className={errorCount > 0 ? 'text-rose-400' : 'text-neutral-500'} />
            <span>Problems</span>
            {errorCount > 0 && (
              <span
                data-testid="drawer-error-count"
                className="rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-mono text-rose-400"
              >
                {errorCount}
              </span>
            )}
            {warningCount > 0 && (
              <span
                data-testid="drawer-warning-count"
                className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-mono text-amber-400"
              >
                {warningCount}
              </span>
            )}
          </button>

          {/* Variables / Cheats Tab */}
          <button
            type="button"
            data-testid="tab-drawer-cheats"
            onClick={() => {
              if (!isOpen) onToggleDrawer();
              onSelectTab('cheats');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition rounded-t ${
              activeTab === 'cheats' && isOpen
                ? 'bg-neutral-900 text-white border-b-2 border-sky-500'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <SlidersIcon size={12} className="text-neutral-400" />
            <span>Variables & Cheats</span>
          </button>

          {/* Console Tab */}
          <button
            type="button"
            data-testid="tab-drawer-console"
            onClick={() => {
              if (!isOpen) onToggleDrawer();
              onSelectTab('console');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition rounded-t ${
              activeTab === 'console' && isOpen
                ? 'bg-neutral-900 text-white border-b-2 border-emerald-500'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <TerminalIcon size={12} className="text-neutral-400" />
            <span>Console</span>
          </button>
        </div>

        {/* Drawer Action Controls */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline">
            Ctrl + `
          </span>
          <button
            type="button"
            data-testid="btn-toggle-drawer"
            onClick={onToggleDrawer}
            title={isOpen ? 'Collapse Diagnostics Drawer' : 'Expand Diagnostics Drawer'}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          >
            {isOpen ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
          </button>
        </div>
      </div>

      {/* Drawer Body */}
      {isOpen && (
        <div className="flex-1 overflow-auto bg-neutral-950 font-sans">
          {children}
        </div>
      )}
    </div>
  );
};
