import type * as monaco from 'monaco-editor';
import type { EngineDiagnostic } from '@vn-engine/shared-types';

export interface MonacoMarkerSyncOptions {
  monacoInstance: typeof monaco;
  model: monaco.editor.ITextModel;
  activeFileId: string;
  diagnostics: EngineDiagnostic[];
}

export const MONACO_MARKER_OWNER = 'vns-compiler';

export function syncMonacoMarkers(options: MonacoMarkerSyncOptions): void {
  const { monacoInstance, model, activeFileId, diagnostics } = options;

  if (!diagnostics || diagnostics.length === 0) {
    monacoInstance.editor.setModelMarkers(model, MONACO_MARKER_OWNER, []);
    return;
  }

  // 1. Multi-File Scoping: Filter diagnostics for active file or global diagnostics
  // Unused asset or inventory-level asset diagnostics without fileId must NOT create editor markers
  const scopedDiagnostics = diagnostics.filter(d => {
    if (!d.fileId && (d.category === 'asset' || d.id?.startsWith('diag-unused-asset-'))) {
      return false;
    }
    return !d.fileId || d.fileId === activeFileId;
  });

  // 2. Map diagnostics to Monaco IMarkerData
  const markers: monaco.editor.IMarkerData[] = scopedDiagnostics.map(d => {
    let severity = monacoInstance.MarkerSeverity.Info;
    if (d.severity === 'error') {
      severity = monacoInstance.MarkerSeverity.Error;
    } else if (d.severity === 'warning') {
      severity = monacoInstance.MarkerSeverity.Warning;
    } else if (d.severity === 'info') {
      severity = monacoInstance.MarkerSeverity.Info;
    }

    const lineCount = typeof model.getLineCount === 'function' ? model.getLineCount() : 1;
    const rawLine = typeof d.line === 'number' && d.line > 0 ? d.line : 1;
    const lineNumber = Math.min(Math.max(1, rawLine), lineCount);

    const maxColumn =
      typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(lineNumber) : 80;
    const rawCol = typeof d.col === 'number' && d.col > 0 ? d.col : 1;
    const startColumn = Math.min(Math.max(1, rawCol), maxColumn);

    const rawEndLine = typeof d.endLine === 'number' && d.endLine > 0 ? d.endLine : lineNumber;
    const endLineNumber = Math.min(Math.max(1, rawEndLine), lineCount);
    const endLineMaxCol =
      typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(endLineNumber) : 80;

    let endColumn: number;
    if (typeof d.endCol === 'number' && d.endCol > 0) {
      const minEndCol = endLineNumber === lineNumber ? startColumn : 1;
      endColumn = Math.min(Math.max(minEndCol, d.endCol), endLineMaxCol);
    } else {
      endColumn = endLineMaxCol;
    }

    return {
      severity,
      code: d.code,
      message: d.message,
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    };
  });

  monacoInstance.editor.setModelMarkers(model, MONACO_MARKER_OWNER, markers);
}
