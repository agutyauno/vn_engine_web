// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EditorDiagnostic } from '../src/core/services/reconciliation';
import { DockProblemsTable } from '../src/components/studio/DockProblemsTable';

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
});

