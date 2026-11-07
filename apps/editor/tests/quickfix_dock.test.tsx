// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EditorDiagnostic } from '../src/core/services/reconciliation';
import type { Project } from '@vn-engine/shared-types';
import { DockProblemsTable } from '../src/components/studio/DockProblemsTable';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { useProjectStore } from '../src/core/stores/projectStore';
import { useDiagnosticsStore } from '../src/core/stores/diagnosticsStore';
import { setupTestStore } from './testStoreHelpers';

describe('Integration Tests: Dock Problems Table QuickFix (TC-DRAWER-QF-01 & 02)', () => {
  it('TC-DRAWER-QF-01: renders Quick Fix button for define_variable diagnostic and clicking triggers onQuickFix', () => {
    const onQuickFix = vi.fn();
    const varDiag: EditorDiagnostic = {
      id: 'diag-var-score',
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SEMANTIC_UNDEFINED_VAR',
      message: "Variable 'score' is used before being defined",
      fileName: 'main.vns',
      fileId: 'file-1',
      line: 4,
      col: 5,
      quickFix: {
        type: 'define_variable',
        targetId: 'score',
      },
    };

    render(
      <DockProblemsTable
        diagnostics={[varDiag]}
        onDiagnosticClick={vi.fn()}
        onQuickFix={onQuickFix}
      />,
    );

    const fixBtn = screen.getByTestId('btn-quickfix-diag-var-score');
    expect(fixBtn).toBeInTheDocument();
    expect(fixBtn).toHaveTextContent(/Quick Fix/i);

    fireEvent.click(fixBtn);
    expect(onQuickFix).toHaveBeenCalledTimes(1);
    expect(onQuickFix).toHaveBeenCalledWith(varDiag);
  });

  it('TC-DRAWER-QF-02: renders Quick Fix button for create_asset and clicking triggers onQuickFix with asset payload', () => {
    const onQuickFix = vi.fn();
    const assetDiag: EditorDiagnostic = {
      id: 'diag-ast-bg',
      category: 'asset',
      severity: 'warning',
      message: "Uncreated asset 'bg_castle.png' referenced in script",
      fileName: 'main.vns',
      fileId: 'file-1',
      line: 2,
      col: 1,
      quickFix: {
        type: 'create_asset',
        targetId: 'bg_castle.png',
        prefillData: { name: 'bg_castle.png', category: 'background' },
      },
    };

    render(
      <DockProblemsTable
        diagnostics={[assetDiag]}
        onDiagnosticClick={vi.fn()}
        onQuickFix={onQuickFix}
      />,
    );

    const fixBtn = screen.getByTestId('btn-quickfix-diag-ast-bg');
    expect(fixBtn).toBeInTheDocument();

    fireEvent.click(fixBtn);
    expect(onQuickFix).toHaveBeenCalledTimes(1);
    expect(onQuickFix).toHaveBeenCalledWith(assetDiag);
  });

  it('TC-DRAWER-QF-03: clicking Quick Fix for variable error inside a scene inserts define into scene local scope with 4-space indent', () => {
    setupTestStore();

    const sampleProject: Project = {
      id: 'proj-dock-qf',
      title: 'Dock QF Project',
      version: 1,
      ownerId: 'author-tdd',
      defaultLanguage: 'vi',
      updatedAt: Date.now(),
      variables: [],
      uiScreens: [],
      customScripts: [],
      displaySettings: {
        width: 1920,
        height: 1080,
        orientation: 'landscape',
        lockAspectRatio: true,
      },
      files: [
        {
          id: 'file-1',
          name: 'main.vns',
          order: 0,
          version: 1,
          content: 'scene intro {\n    score = 1\n}',
        },
      ],
      characters: [],
      assets: [],
    };

    const varDiag: EditorDiagnostic = {
      id: 'diag-var-scene-score',
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SEMANTIC_UNDEFINED_VAR',
      message: "Variable 'score' is used before being defined",
      fileName: 'main.vns',
      fileId: 'file-1',
      line: 2,
      col: 5,
      quickFix: {
        type: 'define_variable',
        targetId: 'score',
      },
    };

    useDiagnosticsStore.getState().setCompilerDiagnostics([varDiag]);

    const mockRepo = {
      listProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn().mockResolvedValue(sampleProject),
      createProject: vi.fn().mockResolvedValue(sampleProject),
      updateProject: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      duplicateProject: vi.fn().mockResolvedValue(sampleProject),
      getStorageUsage: vi.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 1000000 }),
      getAssetBlob: vi.fn().mockResolvedValue(null),
      saveAssetBlob: vi.fn().mockResolvedValue(undefined),
      deleteAssetBlob: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />,
    );

    const fixBtn = screen.getByTestId('btn-quickfix-diag-var-scene-score');
    expect(fixBtn).toBeInTheDocument();

    fireEvent.click(fixBtn);

    const updatedFile = useProjectStore.getState().project?.files.find(f => f.id === 'file-1');
    expect(updatedFile).toBeDefined();
    // Scene local definition should be placed inside scene intro with 4-space indent:
    expect(updatedFile!.content).toBe('scene intro {\n    define score = 0\n    score = 1\n}');
    // Must NOT be placed at global top-level line 1:
    expect(updatedFile!.content).not.toMatch(/^define score = 0/);
  });
});

