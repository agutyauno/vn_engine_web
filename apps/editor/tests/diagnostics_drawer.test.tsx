// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Project } from '@vn-engine/shared-types';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import type { EditorDiagnostic } from '../src/core/services/reconciliation';
import { DockDrawer } from '../src/components/studio/DockDrawer';
import { DockProblemsTable } from '../src/components/studio/DockProblemsTable';
import { RuntimeCheatInjector } from '../src/components/studio/RuntimeCheatInjector';
import { ConsoleLogStream, type ConsoleLogEntry } from '../src/components/studio/ConsoleLogStream';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';

const sampleProject: Project = {
  id: 'proj-drawer-test',
  title: 'Diagnostics Drawer Project',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  displaySettings: {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    aspectRatio: '16:9',
  },
  files: [
    {
      id: 'file-main',
      name: 'main.vns',
      content: 'scene "bg_school.png"\nshow alice.happy\nplay music "bg_theme.mp3"\n"Alice" "Hello world!"\n',
      order: 0,
      version: 1,
    },
    {
      id: 'file-chap2',
      name: 'chapter2.vns',
      content: 'scene "bg_sunset.png"\nshow bob.smile\n"Bob" "Good evening!"\n',
      order: 1,
      version: 1,
    },
  ],
  characters: [
    {
      id: 'alice',
      name: 'Alice Margatroid',
      colorHex: '#38bdf8',
      sprites: {
        happy: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
      defaultExpression: 'happy',
    },
  ],
  assets: [
    {
      id: 'ast-school',
      name: 'bg_school.png',
      category: 'backgrounds',
      path: 'assets/bg_school.png',
      sizeBytes: 1024,
    },
  ],
};

const sampleDiagnostics: EditorDiagnostic[] = [
  {
    id: 'diag-1',
    category: 'compiler',
    severity: 'error',
    message: 'Syntax error: unexpected token "invalid_opcode"',
    fileId: 'file-main',
    fileName: 'main.vns',
    line: 12,
    col: 5,
  },
  {
    id: 'diag-2',
    category: 'asset',
    severity: 'warning',
    message: "Uncreated asset 'bg_sunset.png' referenced in script",
    fileId: 'file-chap2',
    fileName: 'chapter2.vns',
    line: 1,
    col: 1,
    quickFix: {
      type: 'create_asset',
      targetId: 'bg_sunset.png',
      prefillData: { name: 'bg_sunset.png', category: 'backgrounds' },
    },
  },
  {
    id: 'diag-3',
    category: 'character',
    severity: 'warning',
    message: "Uncreated character 'bob' referenced in script",
    fileId: 'file-chap2',
    fileName: 'chapter2.vns',
    line: 2,
    col: 1,
    quickFix: {
      type: 'create_character',
      targetId: 'bob',
      prefillData: { id: 'bob', name: 'bob' },
    },
  },
];

describe('Milestone 7: Bottom Diagnostics Drawer (Column 2 Bottom)', () => {
  // ========================================================================
  // 1. DockDrawer Component Tests
  // ========================================================================
  describe('DockDrawer Component', () => {
    it('renders tabs and problem count badge correctly', () => {
      const handleSelectTab = vi.fn();
      const handleToggle = vi.fn();

      render(
        <DockDrawer
          isOpen={true}
          activeTab="problems"
          errorCount={1}
          warningCount={2}
          onSelectTab={handleSelectTab}
          onToggleDrawer={handleToggle}
        >
          <div data-testid="drawer-children-content">Drawer Content</div>
        </DockDrawer>
      );

      expect(screen.getByTestId('dock-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('tab-drawer-problems')).toBeInTheDocument();
      expect(screen.getByTestId('tab-drawer-cheats')).toBeInTheDocument();
      expect(screen.getByTestId('tab-drawer-console')).toBeInTheDocument();

      // Error/warning count badge
      const errorBadge = screen.getByTestId('drawer-error-count');
      expect(errorBadge).toHaveTextContent('1');
      const warningBadge = screen.getByTestId('drawer-warning-count');
      expect(warningBadge).toHaveTextContent('2');

      // Switches tab on click
      fireEvent.click(screen.getByTestId('tab-drawer-cheats'));
      expect(handleSelectTab).toHaveBeenCalledWith('cheats');

      // Toggle drawer collapse button
      fireEvent.click(screen.getByTestId('btn-toggle-drawer'));
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });

    it('supports Ctrl + ` keyboard shortcut to toggle drawer', () => {
      const handleToggle = vi.fn();

      render(
        <DockDrawer
          isOpen={true}
          activeTab="problems"
          errorCount={0}
          onSelectTab={vi.fn()}
          onToggleDrawer={handleToggle}
        >
          <div>Content</div>
        </DockDrawer>
      );

      // Trigger Ctrl + `
      fireEvent.keyDown(window, { key: '`', ctrlKey: true });
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });

    it('strictly satisfies Rule 8: zero colored OS emojis in DOM', () => {
      const { container } = render(
        <DockDrawer
          isOpen={true}
          activeTab="problems"
          errorCount={3}
          warningCount={1}
          onSelectTab={vi.fn()}
          onToggleDrawer={vi.fn()}
        >
          <div>Content</div>
        </DockDrawer>
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });

  // ========================================================================
  // 2. DockProblemsTable & IT-EDT-01, IT-EDT-02 Tests
  // ========================================================================
  describe('DockProblemsTable Component & IT-EDT-01, IT-EDT-02', () => {
    it('renders problems table with diagnostics details', () => {
      render(
        <DockProblemsTable
          diagnostics={sampleDiagnostics}
          onDiagnosticClick={vi.fn()}
          onQuickFix={vi.fn()}
        />
      );

      expect(screen.getByTestId('dock-problems-table')).toBeInTheDocument();
      expect(screen.getByText(/Syntax error: unexpected token/i)).toBeInTheDocument();
      expect(screen.getByText(/Uncreated asset 'bg_sunset.png'/i)).toBeInTheDocument();
      expect(screen.getByText(/Uncreated character 'bob'/i)).toBeInTheDocument();
    });

    it('IT-EDT-01: 1-click jump from problem row triggers navigation callback with file and line', () => {
      const handleClick = vi.fn();

      render(
        <DockProblemsTable
          diagnostics={sampleDiagnostics}
          onDiagnosticClick={handleClick}
        />
      );

      const row = screen.getByTestId('problem-row-diag-1');
      fireEvent.click(row);

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'diag-1',
          fileName: 'main.vns',
          line: 12,
          col: 5,
        })
      );
    });

    it('IT-EDT-02: 1-click Quick Fix button triggers onQuickFix with diagnostic payload', () => {
      const handleQuickFix = vi.fn();

      render(
        <DockProblemsTable
          diagnostics={sampleDiagnostics}
          onQuickFix={handleQuickFix}
        />
      );

      const quickFixBtn = screen.getByTestId('btn-quickfix-diag-2');
      fireEvent.click(quickFixBtn);

      expect(handleQuickFix).toHaveBeenCalledTimes(1);
      expect(handleQuickFix).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'diag-2',
          quickFix: expect.objectContaining({
            type: 'create_asset',
            targetId: 'bg_sunset.png',
          }),
        })
      );
    });

    it('renders zero-problems placeholder when diagnostics is empty', () => {
      render(<DockProblemsTable diagnostics={[]} />);

      expect(screen.getByTestId('zero-problems-message')).toBeInTheDocument();
      expect(screen.getByText(/Zero issues detected/i)).toBeInTheDocument();
    });
  });

  // ========================================================================
  // 3. RuntimeCheatInjector & IT-EDT-04 Tests
  // ========================================================================
  describe('RuntimeCheatInjector Component & IT-EDT-04', () => {
    it('IT-EDT-04: injects runtime variable updates on inject button click', () => {
      const handleInject = vi.fn();
      const variables = { affection: 10, playerName: 'Hero', isDaytime: true };

      render(
        <RuntimeCheatInjector
          variables={variables}
          onInjectVariable={handleInject}
        />
      );

      expect(screen.getByTestId('runtime-cheat-injector')).toBeInTheDocument();
      expect(screen.getByText('affection')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();

      // Enter variable name and value to cheat
      const nameInput = screen.getByTestId('input-cheat-var-name');
      const valInput = screen.getByTestId('input-cheat-var-value');
      const injectBtn = screen.getByTestId('btn-inject-cheat');

      fireEvent.change(nameInput, { target: { value: 'affection' } });
      fireEvent.change(valInput, { target: { value: '99' } });
      fireEvent.click(injectBtn);

      expect(handleInject).toHaveBeenCalledTimes(1);
      expect(handleInject).toHaveBeenCalledWith('affection', 99);
    });

    it('handles boolean and string variable injections properly', () => {
      const handleInject = vi.fn();

      render(
        <RuntimeCheatInjector
          variables={{}}
          onInjectVariable={handleInject}
        />
      );

      const nameInput = screen.getByTestId('input-cheat-var-name');
      const valInput = screen.getByTestId('input-cheat-var-value');
      const injectBtn = screen.getByTestId('btn-inject-cheat');

      // Boolean true
      fireEvent.change(nameInput, { target: { value: 'hasSword' } });
      fireEvent.change(valInput, { target: { value: 'true' } });
      fireEvent.click(injectBtn);
      expect(handleInject).toHaveBeenCalledWith('hasSword', true);

      // String text
      fireEvent.change(nameInput, { target: { value: 'guildRank' } });
      fireEvent.change(valInput, { target: { value: 'S-Rank' } });
      fireEvent.click(injectBtn);
      expect(handleInject).toHaveBeenCalledWith('guildRank', 'S-Rank');
    });
  });

  // ========================================================================
  // 4. ConsoleLogStream Component Tests
  // ========================================================================
  describe('ConsoleLogStream Component', () => {
    const logs: ConsoleLogEntry[] = [
      { id: '1', timestamp: 1700000000000, level: 'info', message: 'Engine initialized v1.1.0' },
      { id: '2', timestamp: 1700000001000, level: 'warn', message: 'Asset bg_sunset.png not cached' },
      { id: '3', timestamp: 1700000002000, level: 'error', message: 'Cannot find character sprite' },
    ];

    it('renders logs list with level badges and clears logs', () => {
      const handleClear = vi.fn();

      render(<ConsoleLogStream logs={logs} onClearLogs={handleClear} />);

      expect(screen.getByTestId('console-log-stream')).toBeInTheDocument();
      expect(screen.getByText('Engine initialized v1.1.0')).toBeInTheDocument();
      expect(screen.getByText('Cannot find character sprite')).toBeInTheDocument();

      const clearBtn = screen.getByTestId('btn-clear-logs');
      fireEvent.click(clearBtn);
      expect(handleClear).toHaveBeenCalledTimes(1);
    });

    it('displays empty state when logs list is empty', () => {
      render(<ConsoleLogStream logs={[]} onClearLogs={vi.fn()} />);

      expect(screen.getByTestId('empty-console-logs')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // 5. StudioWorkspacePage Drawer Integration
  // ========================================================================
  describe('StudioWorkspacePage Integration with DockDrawer', () => {
    let repo: IndexedDBProjectRepository;

    beforeEach(async () => {
      repo = new IndexedDBProjectRepository(`studio_m7_${Date.now()}_${Math.random()}`);
      await repo.createProject(sampleProject);
    });

    it('renders DockDrawer in Column 2 Bottom and jumps to line in Monaco when problem is clicked', async () => {
      render(
        <StudioWorkspacePage
          projectId={sampleProject.id}
          repository={repo}
          initialProject={sampleProject}
        />
      );

      // Verify DockDrawer is rendered
      expect(screen.getByTestId('dock-drawer')).toBeInTheDocument();

      // Problems generated dynamically from reconciliation
      await waitFor(() => {
        expect(screen.getByTestId('dock-problems-table')).toBeInTheDocument();
      });

      // Find an uncreated asset warning row and click it
      const assetWarningRow = screen.getByText(/Uncreated asset 'bg_sunset.png'/i);
      expect(assetWarningRow).toBeInTheDocument();

      fireEvent.click(assetWarningRow);

      // Verifies active tab switched to chapter2.vns
      await waitFor(() => {
        expect(screen.getByTestId('editor-tab-file-chap2')).toBeInTheDocument();
      });
    });
  });
});
