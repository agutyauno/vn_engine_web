import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as monaco from 'monaco-editor';
import type { EngineDiagnostic } from '@vn-engine/shared-types';
import { syncMonacoMarkers } from '../../src/core/services/monacoMarkerBridge';

describe('monacoMarkerBridge', () => {
  let mockModel: monaco.editor.ITextModel;
  let mockMonaco: typeof monaco & {
    editor: {
      setModelMarkers: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockModel = {
      getLineCount: vi.fn().mockReturnValue(10),
      getLineMaxColumn: vi.fn((line: number) => {
        if (line === 1) return 25;
        if (line === 2) return 10;
        return 80;
      }),
      uri: { toString: () => 'inmemory://model/test.vns' },
    } as unknown as monaco.editor.ITextModel;

    mockMonaco = {
      MarkerSeverity: {
        Error: 8,
        Warning: 4,
        Info: 2,
        Hint: 1,
      },
      editor: {
        setModelMarkers: vi.fn(),
      },
    } as unknown as typeof monaco & {
      editor: {
        setModelMarkers: ReturnType<typeof vi.fn>;
      };
    };
  });

  it('maps EngineDiagnostic severity accurately to Monaco MarkerSeverity', () => {
    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-err',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Syntax error detected',
        fileId: 'file-1',
        line: 1,
        col: 5,
      },
      {
        id: 'diag-warn',
        timestamp: Date.now(),
        category: 'asset',
        severity: 'warning',
        message: 'Unused asset',
        fileId: 'file-1',
        line: 2,
        col: 1,
      },
      {
        id: 'diag-info',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'info',
        message: 'Optimization tip',
        fileId: 'file-1',
        line: 3,
        col: 1,
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledTimes(1);
    const [modelArg, ownerArg, markersArg] = mockMonaco.editor.setModelMarkers.mock.calls[0]!;

    expect(modelArg).toBe(mockModel);
    expect(typeof ownerArg).toBe('string');
    expect(markersArg.length).toBe(3);

    expect(markersArg[0].severity).toBe(mockMonaco.MarkerSeverity.Error);
    expect(markersArg[0].message).toBe('Syntax error detected');
    expect(markersArg[0].startLineNumber).toBe(1);
    expect(markersArg[0].startColumn).toBe(5);

    expect(markersArg[1].severity).toBe(mockMonaco.MarkerSeverity.Warning);
    expect(markersArg[1].message).toBe('Unused asset');

    expect(markersArg[2].severity).toBe(mockMonaco.MarkerSeverity.Info);
    expect(markersArg[2].message).toBe('Optimization tip');
  });

  it('enforces Multi-File Scoping: filters out diagnostics belonging to other files', () => {
    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-target',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Error in current file',
        fileId: 'file-active',
        line: 1,
        col: 1,
      },
      {
        id: 'diag-other',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Error in other chapter',
        fileId: 'file-inactive',
        line: 2,
        col: 1,
      },
      {
        id: 'diag-global',
        timestamp: Date.now(),
        category: 'runtime',
        severity: 'warning',
        message: 'Global warning without fileId',
        line: 3,
        col: 1,
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-active',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(2);
    expect(
      markers.some((m: monaco.editor.IMarkerData) => m.message === 'Error in current file'),
    ).toBe(true);
    expect(
      markers.some((m: monaco.editor.IMarkerData) => m.message === 'Global warning without fileId'),
    ).toBe(true);
    expect(
      markers.some((m: monaco.editor.IMarkerData) => m.message === 'Error in other chapter'),
    ).toBe(false);
  });

  it('clamps coordinates to valid model line lengths via getLineMaxColumn', () => {
    // line 2 has getLineMaxColumn = 10
    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-overflow',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Column out of bounds',
        fileId: 'file-1',
        line: 2,
        col: 999, // Exceeds line length 10
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startColumn).toBeLessThanOrEqual(10);
    expect(markers[0].endColumn).toBeLessThanOrEqual(10);
  });

  it('clears markers when empty diagnostics array is provided', () => {
    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics: [],
    });

    expect(mockMonaco.editor.setModelMarkers).toHaveBeenCalledWith(
      mockModel,
      expect.any(String),
      [],
    );
  });

  // ==========================================
  // PHASE 3: TOKEN SPAN PRECISION & CLAMPING
  // ==========================================

  it('TC-MARKER-01: sets precise endColumn and endLineNumber when endCol and endLine are provided', () => {
    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-span-1',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Invalid token span',
        fileId: 'file-1',
        line: 1,
        col: 5,
        endLine: 1,
        endCol: 17,
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startLineNumber).toBe(1);
    expect(markers[0].startColumn).toBe(5);
    expect(markers[0].endLineNumber).toBe(1);
    expect(markers[0].endColumn).toBe(17);
  });

  it('TC-MARKER-02: falls back to maxColumn when endCol is missing (backward compatibility)', () => {
    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-fallback-1',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Legacy diagnostic without endCol',
        fileId: 'file-1',
        line: 1,
        col: 5,
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startLineNumber).toBe(1);
    expect(markers[0].startColumn).toBe(5);
    expect(markers[0].endLineNumber).toBe(1);
    expect(markers[0].endColumn).toBe(25); // getLineMaxColumn(1) is 25
  });

  it('TC-MARKER-03: clamps endCol to getLineMaxColumn when endCol exceeds line length', () => {
    // line 2 has getLineMaxColumn = 10
    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-clamp-1',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Oversized token span',
        fileId: 'file-1',
        line: 2,
        col: 2,
        endLine: 2,
        endCol: 999, // Exceeds line length 10
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startLineNumber).toBe(2);
    expect(markers[0].startColumn).toBe(2);
    expect(markers[0].endLineNumber).toBe(2);
    expect(markers[0].endColumn).toBe(10); // Clamped to line 2 maxColumn
  });

  // ==========================================
  // INTELLIGENT TOKEN SPAN LOCATOR (PHASE 1 - RED)
  // ==========================================

  it('TC-BRIDGE-SPAN-01: should locate precise token span using quickFix.targetId when endCol is missing', () => {
    (mockModel as any).getLineContent = vi.fn((line: number) => {
      if (line === 1) return '  background bg_sunset transition: "dissolve"';
      return '';
    });

    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-target-id',
        timestamp: Date.now(),
        category: 'asset',
        severity: 'warning',
        message: "Uncreated asset 'bg_sunset'",
        fileId: 'file-1',
        line: 1,
        col: 1, // Fallback col 1 from legacy diagnostics
        quickFix: {
          type: 'create_asset',
          targetId: 'bg_sunset',
        },
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startLineNumber).toBe(1);
    // '  background bg_sunset transition: "dissolve"'
    // index of 'bg_sunset' is 13 -> startColumn = 14
    // length of 'bg_sunset' is 9 -> endColumn = 14 + 9 = 23
    expect(markers[0].startColumn).toBe(14);
    expect(markers[0].endColumn).toBe(23);
  });

  it('TC-BRIDGE-SPAN-02: should locate word span at startColumn when endCol is missing and col > 1', () => {
    (mockModel as any).getLineContent = vi.fn((line: number) => {
      if (line === 1) return '  jump invalid_label';
      return '';
    });

    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-word-span',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Unknown scene label',
        fileId: 'file-1',
        line: 1,
        col: 8, // Points to 'invalid_label' at col 8
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startLineNumber).toBe(1);
    // 'invalid_label' has length 13. col: 8 -> endColumn = 8 + 13 = 21
    expect(markers[0].startColumn).toBe(8);
    expect(markers[0].endColumn).toBe(21);
  });

  it('TC-BRIDGE-SPAN-03: should skip leading indentation when col is 1 on indented lines', () => {
    (mockModel as any).getLineContent = vi.fn((line: number) => {
      if (line === 1) return '    show alice.happy';
      return '';
    });

    const diagnostics: EngineDiagnostic[] = [
      {
        id: 'diag-indent',
        timestamp: Date.now(),
        category: 'compiler',
        severity: 'error',
        message: 'Syntax error in statement',
        fileId: 'file-1',
        line: 1,
        col: 1, // Fallback col 1 on indented line
      },
    ];

    syncMonacoMarkers({
      monacoInstance: mockMonaco,
      model: mockModel,
      activeFileId: 'file-1',
      diagnostics,
    });

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0]![2];
    expect(markers.length).toBe(1);
    expect(markers[0].startLineNumber).toBe(1);
    // '    show alice.happy': 4 spaces -> starts at col 5 ('show')
    // first word 'show' has length 4 -> endColumn = 5 + 4 = 9
    expect(markers[0].startColumn).toBe(5);
    expect(markers[0].endColumn).toBe(9);
  });
});
