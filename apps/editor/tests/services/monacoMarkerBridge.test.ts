import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as monaco from 'monaco-editor';
import type { EngineDiagnostic } from '@vn-engine/shared-types';
import {
  syncMonacoMarkers,
  type MonacoMarkerSyncOptions,
} from '../../src/core/services/monacoMarkerBridge';

describe('monacoMarkerBridge (Phase 2)', () => {
  let mockModel: any;
  let mockMonaco: any;

  beforeEach(() => {
    mockModel = {
      getLineCount: vi.fn().mockReturnValue(10),
      getLineMaxColumn: vi.fn((line: number) => {
        if (line === 1) return 25;
        if (line === 2) return 10;
        return 80;
      }),
      uri: { toString: () => 'inmemory://model/test.vns' },
    };

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
    const [modelArg, ownerArg, markersArg] = mockMonaco.editor.setModelMarkers.mock.calls[0];

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

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0][2];
    expect(markers.length).toBe(2);
    expect(markers.some((m: any) => m.message === 'Error in current file')).toBe(true);
    expect(markers.some((m: any) => m.message === 'Global warning without fileId')).toBe(true);
    expect(markers.some((m: any) => m.message === 'Error in other chapter')).toBe(false);
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

    const markers = mockMonaco.editor.setModelMarkers.mock.calls[0][2];
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
      []
    );
  });
});
