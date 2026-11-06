import { describe, it, expect, beforeEach } from 'vitest';
import type { EngineDiagnostic } from '@vn-engine/shared-types';
import { useDiagnosticsStore } from '../../src/core/stores/diagnosticsStore';
import { setupTestStore } from '../testStoreHelpers';

describe('diagnosticsStore', () => {
  beforeEach(() => {
    setupTestStore();
  });

  const sampleCompilerError: EngineDiagnostic = {
    id: 'd1',
    code: 'E101',
    message: 'Syntax error at token',
    severity: 'error',
    category: 'compiler',
    fileId: 'file-main',
    line: 12,
    col: 5,
    timestamp: 1000,
  };

  const sampleCompilerWarning: EngineDiagnostic = {
    id: 'd2',
    code: 'W102',
    message: 'Unused label',
    severity: 'warning',
    category: 'compiler',
    fileId: 'file-main',
    line: 20,
    col: 1,
    timestamp: 1001,
  };

  const sampleReconciliationWarning: EngineDiagnostic = {
    id: 'd3',
    code: 'W201',
    message: 'Character "bob" referenced but not registered',
    severity: 'warning',
    category: 'asset',
    fileId: 'file-ch1',
    line: 5,
    col: 2,
    timestamp: 1002,
  };

  const sampleRuntimeError: EngineDiagnostic = {
    id: 'd4',
    code: 'E301',
    message: 'VM stack overflow',
    severity: 'error',
    category: 'runtime',
    timestamp: 1003,
  };

  it('initializes with empty diagnostics and zero counts', () => {
    const state = useDiagnosticsStore.getState();
    expect(state.compilerDiagnostics).toEqual([]);
    expect(state.runtimeDiagnostics).toEqual([]);
    expect(state.reconciliationDiagnostics).toEqual([]);
    expect(state.errorCount).toBe(0);
    expect(state.warningCount).toBe(0);
  });

  it('updates compiler diagnostics and tallies error/warning counts', () => {
    useDiagnosticsStore
      .getState()
      .setCompilerDiagnostics([sampleCompilerError, sampleCompilerWarning]);

    const state = useDiagnosticsStore.getState();
    expect(state.compilerDiagnostics).toHaveLength(2);
    expect(state.errorCount).toBe(1);
    expect(state.warningCount).toBe(1);
  });

  it('updates reconciliation diagnostics and aggregates counts across compiler and reconciliation slices', () => {
    useDiagnosticsStore.getState().setCompilerDiagnostics([sampleCompilerError]);
    useDiagnosticsStore.getState().setReconciliationDiagnostics([sampleReconciliationWarning]);

    const state = useDiagnosticsStore.getState();
    expect(state.compilerDiagnostics).toHaveLength(1);
    expect(state.reconciliationDiagnostics).toHaveLength(1);
    expect(state.errorCount).toBe(1);
    expect(state.warningCount).toBe(1);
  });

  it('appends runtime diagnostics and updates errorCount', () => {
    useDiagnosticsStore.getState().setCompilerDiagnostics([sampleCompilerWarning]);
    useDiagnosticsStore.getState().addRuntimeDiagnostic(sampleRuntimeError);

    const state = useDiagnosticsStore.getState();
    expect(state.runtimeDiagnostics).toHaveLength(1);
    expect(state.errorCount).toBe(1);
    expect(state.warningCount).toBe(1);
  });

  it('clears all diagnostics and resets counts to 0 upon clearDiagnostics', () => {
    useDiagnosticsStore.getState().setCompilerDiagnostics([sampleCompilerError]);
    useDiagnosticsStore.getState().setReconciliationDiagnostics([sampleReconciliationWarning]);
    useDiagnosticsStore.getState().addRuntimeDiagnostic(sampleRuntimeError);

    expect(useDiagnosticsStore.getState().errorCount).toBe(2);

    useDiagnosticsStore.getState().clearDiagnostics();

    const state = useDiagnosticsStore.getState();
    expect(state.compilerDiagnostics).toEqual([]);
    expect(state.runtimeDiagnostics).toEqual([]);
    expect(state.reconciliationDiagnostics).toEqual([]);
    expect(state.errorCount).toBe(0);
    expect(state.warningCount).toBe(0);
  });
});
