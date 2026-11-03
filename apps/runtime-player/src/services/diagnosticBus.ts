import type {
  DiagnosticCategory,
  DiagnosticSeverity,
  EngineDiagnostic,
} from '@vn-engine/shared-types';

export interface DiagnosticReportDetail {
  category: DiagnosticCategory | 'asset' | 'script' | 'vm' | 'renderer';
  severity?: DiagnosticSeverity;
  code: string;
  message: string;
  assetKey?: string;
  assetId?: string;
  fileId?: string;
  line?: number;
  col?: number;
  details?: unknown;
}

export type DiagnosticReportInput = DiagnosticReportDetail | EngineDiagnostic;

export interface DiagnosticBus {
  report(diag: DiagnosticReportInput): void;
  clear?(): void;
  setEditorOrigin?(origin: string): void;
}
