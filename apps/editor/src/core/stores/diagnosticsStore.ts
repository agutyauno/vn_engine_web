import { create } from 'zustand';
import type { EngineDiagnostic } from '@vn-engine/shared-types';

export interface DiagnosticsStoreState {
  compilerDiagnostics: EngineDiagnostic[];
  runtimeDiagnostics: EngineDiagnostic[];
  reconciliationDiagnostics: EngineDiagnostic[];
  errorCount: number;
  warningCount: number;

  setCompilerDiagnostics: (diags: EngineDiagnostic[]) => void;
  setReconciliationDiagnostics: (diags: EngineDiagnostic[]) => void;
  addRuntimeDiagnostic: (diag: EngineDiagnostic) => void;
  clearDiagnostics: () => void;
}

export const initialDiagnosticsState: Omit<
  DiagnosticsStoreState,
  | 'setCompilerDiagnostics'
  | 'setReconciliationDiagnostics'
  | 'addRuntimeDiagnostic'
  | 'clearDiagnostics'
> = {
  compilerDiagnostics: [],
  runtimeDiagnostics: [],
  reconciliationDiagnostics: [],
  errorCount: 0,
  warningCount: 0,
};

function calculateCounts(
  compiler: EngineDiagnostic[],
  runtime: EngineDiagnostic[],
  reconciliation: EngineDiagnostic[]
): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;

  for (const d of compiler) {
    if (d.severity === 'error') errorCount++;
    else if (d.severity === 'warning') warningCount++;
  }
  for (const d of runtime) {
    if (d.severity === 'error') errorCount++;
    else if (d.severity === 'warning') warningCount++;
  }
  for (const d of reconciliation) {
    if (d.severity === 'error') errorCount++;
    else if (d.severity === 'warning') warningCount++;
  }

  return { errorCount, warningCount };
}

export const useDiagnosticsStore = create<DiagnosticsStoreState>((set) => ({
  ...initialDiagnosticsState,

  setCompilerDiagnostics: (diags) =>
    set((state) => {
      const counts = calculateCounts(
        diags,
        state.runtimeDiagnostics,
        state.reconciliationDiagnostics
      );
      return {
        compilerDiagnostics: diags,
        ...counts,
      };
    }),

  setReconciliationDiagnostics: (diags) =>
    set((state) => {
      const counts = calculateCounts(
        state.compilerDiagnostics,
        state.runtimeDiagnostics,
        diags
      );
      return {
        reconciliationDiagnostics: diags,
        ...counts,
      };
    }),

  addRuntimeDiagnostic: (diag) =>
    set((state) => {
      const updatedRuntime = [...state.runtimeDiagnostics, diag];
      const counts = calculateCounts(
        state.compilerDiagnostics,
        updatedRuntime,
        state.reconciliationDiagnostics
      );
      return {
        runtimeDiagnostics: updatedRuntime,
        ...counts,
      };
    }),

  clearDiagnostics: () =>
    set({
      ...initialDiagnosticsState,
    }),
}));

