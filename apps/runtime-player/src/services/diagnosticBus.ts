import type { DiagnosticCategory, DiagnosticSeverity, EngineDiagnostic } from '@vn-engine/shared-types';

export type DiagnosticReportInput =
  | {
      category: DiagnosticCategory;
      severity?: DiagnosticSeverity;
      code: string;
      message: string;
      assetKey?: string;
      details?: unknown;
    }
  | EngineDiagnostic;

export interface DiagnosticBus {
  report(diag: DiagnosticReportInput): void;
  clear?(): void;
  setEditorOrigin?(origin: string): void;
}
