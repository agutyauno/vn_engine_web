import type * as monaco from 'monaco-editor';
import type { EngineDiagnostic } from '@vn-engine/shared-types';

export interface MonacoMarkerSyncOptions {
  monacoInstance: typeof monaco;
  model: monaco.editor.ITextModel;
  activeFileId: string;
  diagnostics: EngineDiagnostic[];
}

export const MONACO_MARKER_OWNER = 'vns-compiler';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveMarkerSpan(
  d: EngineDiagnostic,
  _lineNumber: number,
  maxColumn: number,
  lineContent?: string,
): { startColumn: number; endColumn: number } {
  const rawCol = typeof d.col === 'number' && d.col > 0 ? d.col : 1;

  // 1. Explicit endCol from AST/compiler/reconciliation
  if (typeof d.endCol === 'number' && d.endCol > 0) {
    const startColumn = Math.min(Math.max(1, rawCol), maxColumn);
    const endColumn = Math.min(Math.max(startColumn, d.endCol), maxColumn);
    return { startColumn, endColumn };
  }

  // 2. Intelligent inference when lineContent is available
  if (typeof lineContent === 'string' && lineContent.length > 0) {
    // 2a. Target ID match (e.g. quickFix.targetId or assetKey)
    const targetId =
      d.quickFix && typeof d.quickFix.targetId === 'string' && d.quickFix.targetId.trim()
        ? d.quickFix.targetId.trim()
        : typeof d.assetKey === 'string' && d.assetKey.trim()
          ? d.assetKey.trim()
          : undefined;

    if (targetId) {
      const escaped = escapeRegExp(targetId);
      const wordMatch = new RegExp(`\\b${escaped}\\b`).exec(lineContent);
      if (wordMatch) {
        const startColumn = Math.min(Math.max(1, wordMatch.index + 1), maxColumn);
        const endColumn = Math.min(Math.max(startColumn, startColumn + targetId.length), maxColumn);
        return { startColumn, endColumn };
      }
      const rawIdx = lineContent.indexOf(targetId);
      if (rawIdx !== -1) {
        const startColumn = Math.min(Math.max(1, rawIdx + 1), maxColumn);
        const endColumn = Math.min(Math.max(startColumn, startColumn + targetId.length), maxColumn);
        return { startColumn, endColumn };
      }
    }

    // 2b. If col > 1, extract word token starting at rawCol
    if (rawCol > 1) {
      const sub = lineContent.slice(rawCol - 1);
      const wordMatch = /^[a-zA-Z0-9_.-]+/.exec(sub);
      if (wordMatch && wordMatch[0].length > 0) {
        const startColumn = Math.min(Math.max(1, rawCol), maxColumn);
        const endColumn = Math.min(Math.max(startColumn, startColumn + wordMatch[0].length), maxColumn);
        return { startColumn, endColumn };
      }
    }

    // 2c. If col === 1 on an indented line, skip leading indentation and underline the first word
    const indentIdx = lineContent.search(/\S/);
    if (indentIdx !== -1 && (rawCol === 1 || rawCol <= indentIdx + 1)) {
      const sub = lineContent.slice(indentIdx);
      const firstWordMatch = /^[a-zA-Z0-9_.-]+/.exec(sub);
      const startColumn = Math.min(Math.max(1, indentIdx + 1), maxColumn);
      const wordLen = firstWordMatch && firstWordMatch[0].length > 0 ? firstWordMatch[0].length : 1;
      const endColumn = Math.min(Math.max(startColumn, startColumn + wordLen), maxColumn);
      return { startColumn, endColumn };
    }
  }

  // 3. Fallback to startColumn -> maxColumn (backward compatibility)
  const startColumn = Math.min(Math.max(1, rawCol), maxColumn);
  return { startColumn, endColumn: maxColumn };
}

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

    const rawEndLine = typeof d.endLine === 'number' && d.endLine > 0 ? d.endLine : lineNumber;
    const endLineNumber = Math.min(Math.max(1, rawEndLine), lineCount);
    const endLineMaxCol =
      typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(endLineNumber) : 80;

    const lineContent =
      typeof model.getLineContent === 'function' ? model.getLineContent(lineNumber) : undefined;

    let startColumn: number;
    let endColumn: number;

    if (endLineNumber === lineNumber) {
      const span = resolveMarkerSpan(d, lineNumber, maxColumn, lineContent);
      startColumn = span.startColumn;
      endColumn = span.endColumn;
    } else {
      const rawCol = typeof d.col === 'number' && d.col > 0 ? d.col : 1;
      startColumn = Math.min(Math.max(1, rawCol), maxColumn);
      if (typeof d.endCol === 'number' && d.endCol > 0) {
        endColumn = Math.min(Math.max(1, d.endCol), endLineMaxCol);
      } else {
        endColumn = endLineMaxCol;
      }
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
