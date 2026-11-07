// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { registerVnsLanguageFeatures, type VnsProjectContext } from '../src/vnsLanguageFeatures';
import { useDiagnosticsStore } from '../src/core/stores/diagnosticsStore';
import { useEditorUIStore } from '../src/core/stores/uiStore';
import type { EngineDiagnostic } from '@vn-engine/shared-types';

describe('Integration Tests: Monaco CodeActionProvider (QuickFix Lightbulb & Ctrl+.)', () => {
  let mockContext: VnsProjectContext;
  let codeActionProvider: monaco.languages.CodeActionProvider | null = null;
  let registerCodeActionSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    useDiagnosticsStore.getState().clearDiagnostics();

    // Capture the registered CodeActionProvider
    codeActionProvider = null;
    registerCodeActionSpy = vi.spyOn(monaco.languages, 'registerCodeActionProvider').mockImplementation(
      ((languageId: string, provider: monaco.languages.CodeActionProvider) => {
        if (languageId === 'vns') {
          codeActionProvider = provider;
        }
        return { dispose: vi.fn() };
      }) as any,
    );

    mockContext = {
      getFiles: () => ({
        'file-1': 'scene intro {\n    gold = gold + 1\n}\n',
      }),
      getScenes: () => [{ name: 'intro', file: 'main.vns', line: 1 }],
      getCharacters: () => new Map([['alice', { sprites: new Set(['happy']) }]]),
      getAssets: () => ({ backgrounds: new Set(['bg_school.png']), audio: new Set() }),
      getVariables: () => ['score'],
      switchActiveFile: vi.fn(),
    };
  });

  // TC-MONACO-QF-01: Provider registration and coordinate lookup
  it('TC-MONACO-QF-01: should register CodeActionProvider for "vns" language and match diagnostics by coordinates', async () => {
    registerVnsLanguageFeatures(mockContext);

    expect(registerCodeActionSpy).toHaveBeenCalledWith('vns', expect.any(Object));
    expect(codeActionProvider).not.toBeNull();

    // Populate diagnosticsStore with a compiler diagnostic
    const sampleDiag: EngineDiagnostic = {
      id: 'diag-test-1',
      timestamp: Date.now(),
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SEMANTIC_UNDEFINED_VAR',
      message: "Variable 'gold' is used before being defined",
      fileId: 'file-1',
      line: 2,
      col: 5,
      quickFix: {
        type: 'define_variable',
        targetId: 'gold',
      },
    };
    useDiagnosticsStore.getState().setCompilerDiagnostics([sampleDiag]);

    const mockModel = {
      uri: { toString: () => 'inmemory://model/file-1', path: '/main.vns' },
      getValue: () => 'scene intro {\n    gold = gold + 1\n}\n',
      getLineContent: (line: number) => (line === 2 ? '    gold = gold + 1' : 'scene intro {'),
    } as unknown as monaco.editor.ITextModel;

    const mockRange = {
      startLineNumber: 2,
      startColumn: 5,
      endLineNumber: 2,
      endColumn: 9,
    } as monaco.Range;

    const mockCodeActionContext: monaco.languages.CodeActionContext = {
      markers: [
        {
          severity: monaco.MarkerSeverity.Error,
          code: 'ERR_SEMANTIC_UNDEFINED_VAR',
          message: "Variable 'gold' is used before being defined",
          startLineNumber: 2,
          startColumn: 5,
          endLineNumber: 2,
          endColumn: 9,
        },
      ],
      only: undefined,
      trigger: 1,
    };

    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as unknown as monaco.CancellationToken;

    const result = await codeActionProvider!.provideCodeActions(
      mockModel,
      mockRange,
      mockCodeActionContext,
      token,
    );

    expect(result).toBeDefined();
    expect(result?.actions).toBeDefined();
    expect(result!.actions.length).toBeGreaterThan(0);
  });

  // TC-MONACO-QF-02: Returns valid CodeAction objects with kind: 'quickfix'
  it('TC-MONACO-QF-02: should return CodeAction items with kind: "quickfix" and appropriate titles', async () => {
    registerVnsLanguageFeatures(mockContext);

    const assetDiag: EngineDiagnostic = {
      id: 'diag-ast-missing',
      timestamp: Date.now(),
      category: 'asset',
      severity: 'warning',
      message: "Uncreated asset 'bg_garden.png' referenced in script",
      fileId: 'file-1',
      line: 1,
      col: 1,
      quickFix: {
        type: 'create_asset',
        targetId: 'bg_garden.png',
        prefillData: { name: 'bg_garden.png', category: 'background' },
      },
    };
    useDiagnosticsStore.getState().setReconciliationDiagnostics([assetDiag]);

    const mockModel = {
      uri: { toString: () => 'inmemory://model/file-1', path: '/main.vns' },
      getValue: () => 'scene intro {\n    background bg_garden.png\n}\n',
      getLineContent: () => '    background bg_garden.png',
    } as unknown as monaco.editor.ITextModel;

    const mockRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 20 } as monaco.Range;
    const mockContextData: monaco.languages.CodeActionContext = {
      markers: [
        {
          severity: monaco.MarkerSeverity.Warning,
          message: "Uncreated asset 'bg_garden.png' referenced in script",
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 20,
        },
      ],
      only: undefined,
      trigger: 1,
    };

    const result = await codeActionProvider!.provideCodeActions(
      mockModel,
      mockRange,
      mockContextData,
      {} as monaco.CancellationToken,
    );

    expect(result?.actions).toBeDefined();
    for (const action of result!.actions) {
      expect(action.kind).toBe('quickfix');
      expect(action.title).toBeTruthy();
    }
  });

  // TC-MONACO-QF-03: In-place edit provides accurate WorkspaceEdit range and text
  it('TC-MONACO-QF-03: should provide valid WorkspaceEdit edits for variable declaration and typo actions', async () => {
    registerVnsLanguageFeatures(mockContext);

    const varDiag: EngineDiagnostic = {
      id: 'diag-var-def',
      timestamp: Date.now(),
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SEMANTIC_UNDEFINED_VAR',
      message: "Variable 'gold' is used before being defined",
      fileId: 'file-1',
      line: 2,
      col: 5,
      quickFix: {
        type: 'define_variable',
        targetId: 'gold',
      },
    };
    useDiagnosticsStore.getState().setCompilerDiagnostics([varDiag]);

    const mockModel = {
      uri: { toString: () => 'inmemory://model/file-1', path: '/main.vns' },
      getValue: () => 'scene intro {\n    gold = gold + 1\n}\n',
      getLineContent: (line: number) => (line === 2 ? '    gold = gold + 1' : 'scene intro {'),
    } as unknown as monaco.editor.ITextModel;

    const mockRange = { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 9 } as monaco.Range;
    const mockContextData: monaco.languages.CodeActionContext = {
      markers: [
        {
          severity: monaco.MarkerSeverity.Error,
          code: 'ERR_SEMANTIC_UNDEFINED_VAR',
          message: "Variable 'gold' is used before being defined",
          startLineNumber: 2,
          startColumn: 5,
          endLineNumber: 2,
          endColumn: 9,
        },
      ],
      only: undefined,
      trigger: 1,
    };

    const result = await codeActionProvider!.provideCodeActions(
      mockModel,
      mockRange,
      mockContextData,
      {} as monaco.CancellationToken,
    );

    expect(result?.actions).toBeDefined();
    const editAction = result!.actions.find(a => a.edit && a.edit.edits && a.edit.edits.length > 0);
    expect(editAction).toBeDefined();

    const textEdit = editAction!.edit!.edits[0] as monaco.languages.IWorkspaceTextEdit;
    expect(textEdit.resource).toEqual(mockModel.uri);
    expect(textEdit.textEdit.text).toContain('define gold = 0');
  });

  // Edge Case: Marker with no matching diagnostic in store
  it('should return empty actions when no matching diagnostic is found for marker', async () => {
    registerVnsLanguageFeatures(mockContext);

    const mockModel = {
      uri: { toString: () => 'inmemory://model/file-1', path: '/main.vns' },
      getValue: () => 'scene intro {}\n',
      getLineContent: () => 'scene intro {}',
    } as unknown as monaco.editor.ITextModel;

    const mockRange = { startLineNumber: 99, startColumn: 1, endLineNumber: 99, endColumn: 10 } as monaco.Range;
    const mockContextData: monaco.languages.CodeActionContext = {
      markers: [
        {
          severity: monaco.MarkerSeverity.Warning,
          message: 'Unknown warning',
          startLineNumber: 99,
          startColumn: 1,
          endLineNumber: 99,
          endColumn: 10,
        },
      ],
      only: undefined,
      trigger: 1,
    };

    const result = await codeActionProvider!.provideCodeActions(
      mockModel,
      mockRange,
      mockContextData,
      {} as monaco.CancellationToken,
    );

    expect(result?.actions).toEqual([]);
  });

  // TC-MONACO-QF-04: Line-level marker fallback when contextData.markers is empty (cursor offset)
  it('TC-MONACO-QF-04: should fallback to line-level markers when contextData.markers is empty (cursor offset)', async () => {
    registerVnsLanguageFeatures(mockContext);

    const sampleDiag: EngineDiagnostic = {
      id: 'diag-offset-1',
      timestamp: Date.now(),
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SEMANTIC_UNDEFINED_VAR',
      message: "Variable 'gold' is used before being defined",
      fileId: 'file-1',
      line: 2,
      col: 5,
      quickFix: {
        type: 'define_variable',
        targetId: 'gold',
      },
    };
    useDiagnosticsStore.getState().setCompilerDiagnostics([sampleDiag]);

    const mockModel = {
      uri: { toString: () => 'inmemory://model/file-1', path: '/main.vns' },
      getValue: () => 'scene intro {\n    gold = gold + 1\n}\n',
      getLineContent: (line: number) => (line === 2 ? '    gold = gold + 1' : 'scene intro {'),
    } as unknown as monaco.editor.ITextModel;

    // Cursor at col 1 (offset from error at col 5)
    const mockRange = {
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 1,
    } as monaco.Range;

    // Monaco provides empty markers when cursor range is outside marker column range
    const mockCodeActionContext: monaco.languages.CodeActionContext = {
      markers: [],
      only: undefined,
      trigger: 1,
    };

    // Mock getModelMarkers to return the marker on line 2
    const getModelMarkersSpy = vi.spyOn(monaco.editor, 'getModelMarkers').mockReturnValue([
      {
        severity: monaco.MarkerSeverity.Error,
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'gold' is used before being defined",
        startLineNumber: 2,
        startColumn: 5,
        endLineNumber: 2,
        endColumn: 9,
        resource: mockModel.uri,
        owner: 'vns-compiler',
      } as unknown as monaco.editor.IMarker,
    ]);

    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as unknown as monaco.CancellationToken;

    const result = await codeActionProvider!.provideCodeActions(
      mockModel,
      mockRange,
      mockCodeActionContext,
      token,
    );

    expect(getModelMarkersSpy).toHaveBeenCalledWith({ resource: mockModel.uri });
    expect(result).toBeDefined();
    expect(result?.actions).toBeDefined();
    expect(result!.actions.length).toBeGreaterThan(0);
    expect(result!.actions.some(a => a.title.includes('gold'))).toBe(true);
  });

  // TC-MONACO-QF-05: Anonymous model URI matching via activeFileId
  it('TC-MONACO-QF-05: should match diagnostic to active file via activeFileId when model URI is anonymous inmemory://model/1', async () => {
    registerVnsLanguageFeatures(mockContext);

    // Set active file in UI store
    useEditorUIStore.setState({ activeFileId: 'file-1' });

    const sampleDiag: EngineDiagnostic = {
      id: 'diag-anon-1',
      timestamp: Date.now(),
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SEMANTIC_UNDEFINED_VAR',
      message: "Variable 'gold' is used before being defined",
      fileId: 'file-1',
      line: 2,
      col: 5,
      quickFix: {
        type: 'define_variable',
        targetId: 'gold',
      },
    };
    useDiagnosticsStore.getState().setCompilerDiagnostics([sampleDiag]);

    // Model URI is anonymous: inmemory://model/1
    const mockModel = {
      uri: { toString: () => 'inmemory://model/1', path: '/model/1' },
      getValue: () => 'scene intro {\n    gold = gold + 1\n}\n',
      getLineContent: (line: number) => (line === 2 ? '    gold = gold + 1' : 'scene intro {'),
    } as unknown as monaco.editor.ITextModel;

    const mockRange = {
      startLineNumber: 2,
      startColumn: 5,
      endLineNumber: 2,
      endColumn: 9,
    } as monaco.Range;

    const mockCodeActionContext: monaco.languages.CodeActionContext = {
      markers: [
        {
          severity: monaco.MarkerSeverity.Error,
          code: 'ERR_SEMANTIC_UNDEFINED_VAR',
          message: "Variable 'gold' is used before being defined",
          startLineNumber: 2,
          startColumn: 5,
          endLineNumber: 2,
          endColumn: 9,
        },
      ],
      only: undefined,
      trigger: 1,
    };

    const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() } as unknown as monaco.CancellationToken;

    const result = await codeActionProvider!.provideCodeActions(
      mockModel,
      mockRange,
      mockCodeActionContext,
      token,
    );

    expect(result).toBeDefined();
    expect(result?.actions).toBeDefined();
    expect(result!.actions.length).toBeGreaterThan(0);
    expect(result!.actions.some(a => a.title.includes('gold'))).toBe(true);
  });
});
