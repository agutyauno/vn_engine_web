import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { AssetCategory, Project, ScriptFile } from '@vn-engine/shared-types';
import type * as monacoType from 'monaco-editor';
import { useProjectStore } from '../../core/stores/projectStore';
import { useDiagnosticsStore } from '../../core/stores/diagnosticsStore';
import { syncMonacoMarkers } from '../../core/services/monacoMarkerBridge';
import { setupMonacoEnvironment } from '../../monacoEnvironment';

export interface MonacoEditorHandle {
  insertSnippet: (snippet: string) => void;
}

export function cleanDropText(text: string): string {
  return text.replace(/\$0/g, '');
}

export const DEFAULT_MONACO_OPTIONS: monacoType.editor.IStandaloneEditorConstructionOptions = {
  theme: 'vs-dark',
  automaticLayout: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineNumbers: 'on',
  renderWhitespace: 'selection',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  tabSize: 2,
  dropIntoEditor: { enabled: false },
};

export function getMonacoEditorOptions(
  readOnly = false,
): monacoType.editor.IStandaloneEditorConstructionOptions {
  return {
    ...DEFAULT_MONACO_OPTIONS,
    readOnly,
  };
}

export function handleContainerDragOver(e: {
  preventDefault: () => void;
  dataTransfer?: { dropEffect: string } | null;
}): void {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
}

export function handleEditorDrop(
  editor: {
    executeEdits: (source: string, edits: any[]) => void;
    focus?: () => void;
    getPosition?: () => { lineNumber: number; column: number } | null;
    getTargetAtClientPoint?: (
      x: number,
      y: number,
    ) => { position: { lineNumber: number; column: number } } | null;
  },
  event: {
    clientX?: number;
    clientY?: number;
    dataTransfer?: {
      getData: (format: string) => string;
      dropEffect?: string;
    } | null;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  },
): boolean {
  const rawText = event.dataTransfer?.getData('text/plain');
  if (!rawText) return false;

  event.preventDefault?.();
  event.stopPropagation?.();

  const cleaned = cleanDropText(rawText);
  const target =
    typeof event.clientX === 'number' && typeof event.clientY === 'number'
      ? editor.getTargetAtClientPoint?.(event.clientX, event.clientY)
      : null;

  const position = target?.position || editor.getPosition?.() || { lineNumber: 1, column: 1 };

  editor.executeEdits('drag-drop-insert', [
    {
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text: cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`,
      forceMoveMarkers: true,
    },
  ]);
  editor.focus?.();
  return true;
}

export function insertSnippetAtCursor(
  editor: monacoType.editor.IStandaloneCodeEditor,
  snippet: string,
): void {
  const position = editor.getPosition() || { lineNumber: 1, column: 1 };
  const model = editor.getModel();
  if (!model) return;
  const lineContent = model.getLineContent(position.lineNumber);
  const textToInsert = lineContent.trim().length > 0 ? `\n${snippet}\n` : `${snippet}\n`;
  const range =
    typeof window !== 'undefined' && (window as any).monaco?.Range
      ? new (window as any).monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        )
      : {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
  editor.executeEdits('snippet-insert', [
    {
      range,
      text: textToInsert,
      forceMoveMarkers: true,
    },
  ]);
  editor.focus();
}

export interface MonacoEditorContainerProps {
  file: ScriptFile | null;
  project: Project;
  cursorJumpTarget?: { line: number; col: number } | null;
  onChange?: (newContent: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  onRequestCreateAsset?: (targetId: string, category?: AssetCategory) => void;
  onRequestCreateCharacter?: (targetId: string) => void;
  onRequestCreateExpression?: (charId: string, expressionKey: string) => void;
  readOnly?: boolean;
}

let vnsRegistered = false;

export const MonacoEditorContainer = React.forwardRef<
  MonacoEditorHandle,
  MonacoEditorContainerProps
>(function MonacoEditorContainer(
  {
    file,
    project,
    cursorJumpTarget,
    onChange,
    onCursorChange,
    onRequestCreateAsset,
    onRequestCreateCharacter,
    onRequestCreateExpression,
    readOnly = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const monacoInstanceRef = useRef<typeof monacoType | null>(null);
  const [isMonacoMounted, setIsMonacoMounted] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      insertSnippet: (snippet: string) => {
        if (editorRef.current) {
          insertSnippetAtCursor(editorRef.current, snippet);
        } else if (file) {
          const newContent = file.content ? `${file.content}\n${snippet}\n` : `${snippet}\n`;
          useProjectStore.getState().updateFileContent(file.id, newContent);
          onChange?.(newContent);
        }
      },
    }),
    [file, onChange],
  );

  const onRequestCreateAssetRef = useRef(onRequestCreateAsset);
  onRequestCreateAssetRef.current = onRequestCreateAsset;

  const onRequestCreateCharacterRef = useRef(onRequestCreateCharacter);
  onRequestCreateCharacterRef.current = onRequestCreateCharacter;

  const onRequestCreateExpressionRef = useRef(onRequestCreateExpression);
  onRequestCreateExpressionRef.current = onRequestCreateExpression;

  const compilerDiagnostics = useDiagnosticsStore(s => s.compilerDiagnostics);
  const reconciliationDiagnostics = useDiagnosticsStore(s => s.reconciliationDiagnostics);

  // Initialize Monaco and language features
  useEffect(() => {
    const isJsdom =
      typeof window !== 'undefined' &&
      (window.navigator.userAgent.includes('jsdom') || !window.matchMedia);
    if (isJsdom || !containerRef.current) {
      return;
    }

    let disposed = false;

    async function initMonaco() {
      if (typeof document !== 'undefined' && !document.queryCommandSupported) {
        document.queryCommandSupported = () => false;
      }

      setupMonacoEnvironment();

      const monacoModule = await import('monaco-editor');
      const { registerVnsLanguage } = await import('../../vnsLanguage');
      const { registerVnsLanguageFeatures } = await import('../../vnsLanguageFeatures');

      monacoInstanceRef.current = monacoModule;

      if (!vnsRegistered) {
        try {
          registerVnsLanguage();
          const { createVnsProjectContext } =
            await import('../../core/services/vnsContextProvider');
          registerVnsLanguageFeatures(
            createVnsProjectContext(() => useProjectStore.getState().project, project),
          );
          vnsRegistered = true;
        } catch (err) {
          console.warn('VNS Language registration warning:', err);
        }
      }

      if (disposed || !containerRef.current) return;

      const editor = monacoModule.editor.create(containerRef.current, {
        ...getMonacoEditorOptions(readOnly),
        value: file?.content || '',
        language: 'vns',
      });

      editor.onDidChangeModelContent(() => {
        const val = editor.getValue();
        if (file) {
          useProjectStore.getState().updateFileContent(file.id, val);
        }
        onChange?.(val);
      });

      editor.onDidChangeCursorPosition(e => {
        onCursorChange?.(e.position.lineNumber, e.position.column);
      });

      editorRef.current = editor;
      setIsMonacoMounted(true);
    }

    initMonaco();

    return () => {
      disposed = true;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
        setIsMonacoMounted(false);
      }
    };
  }, []);

  // Update content when active file changes in Monaco
  useEffect(() => {
    if (editorRef.current && file) {
      if (editorRef.current.getValue() !== file.content) {
        editorRef.current.setValue(file.content);
      }
    }
  }, [file?.id, file?.content]);

  // Synchronize Monaco Markers from DiagnosticsStore
  useEffect(() => {
    if (!isMonacoMounted || !editorRef.current || !monacoInstanceRef.current || !file) {
      return;
    }
    const model = editorRef.current.getModel();
    if (!model) return;

    const allDiags = [...compilerDiagnostics, ...reconciliationDiagnostics];
    syncMonacoMarkers({
      monacoInstance: monacoInstanceRef.current,
      model,
      activeFileId: file.id,
      diagnostics: allDiags,
    });
  }, [isMonacoMounted, file?.id, compilerDiagnostics, reconciliationDiagnostics]);

  // Support cursorJumpTarget (IT-EDT-01)
  useEffect(() => {
    if (cursorJumpTarget && editorRef.current) {
      editorRef.current.revealLineInCenter(cursorJumpTarget.line);
      editorRef.current.setPosition({
        lineNumber: cursorJumpTarget.line,
        column: cursorJumpTarget.col || 1,
      });
      editorRef.current.focus();
    }
  }, [cursorJumpTarget]);

  // Register Monaco Editor Commands for QuickFix actions
  useEffect(() => {
    if (!monacoInstanceRef.current || !isMonacoMounted) return;
    let d1: monacoType.IDisposable | undefined;
    let d2: monacoType.IDisposable | undefined;
    let d3: monacoType.IDisposable | undefined;
    try {
      d1 = monacoInstanceRef.current.editor.registerCommand(
        'vn.editor.createAsset',
        (_accessor, targetId?: string, category?: AssetCategory) => {
          if (targetId) {
            onRequestCreateAssetRef.current?.(targetId, category);
          }
        },
      );
      d2 = monacoInstanceRef.current.editor.registerCommand(
        'vn.editor.createCharacter',
        (_accessor, targetId?: string) => {
          if (targetId) {
            onRequestCreateCharacterRef.current?.(targetId);
          }
        },
      );
      d3 = monacoInstanceRef.current.editor.registerCommand(
        'vn.editor.createExpression',
        (_accessor, charId?: string, expressionKey?: string) => {
          if (charId && expressionKey) {
            onRequestCreateExpressionRef.current?.(charId, expressionKey);
          }
        },
      );
    } catch {
      // Ignored if already registered
    }
    return () => {
      d1?.dispose();
      d2?.dispose();
      d3?.dispose();
    };
  }, [isMonacoMounted]);

  // Handle HTML5 Drag and Drop into Monaco
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isMonacoMounted) return;

    const onDragOver = (e: DragEvent) => {
      handleContainerDragOver(e);
    };

    const onDrop = (e: DragEvent) => {
      if (editorRef.current) {
        handleEditorDrop(editorRef.current as any, e);
      }
    };

    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);

    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
    };
  }, [isMonacoMounted]);

  if (!file) {
    return (
      <div
        data-testid="monaco-editor-container"
        className="flex h-full w-full flex-col items-center justify-center bg-neutral-950 p-6 text-xs text-neutral-500 font-mono select-none"
      >
        <span>No file open. Select or create a script file to start editing.</span>
      </div>
    );
  }

  return (
    <div
      data-testid="monaco-editor-container"
      className="relative flex-1 w-full h-full min-h-0 bg-neutral-950 overflow-hidden"
    >
      {/* Real Monaco Canvas Mount Point */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Fallback accessible textarea for headless/test environments */}
      {!isMonacoMounted && (
        <textarea
          data-testid="monaco-fallback-textarea"
          value={file.content}
          readOnly={readOnly}
          onChange={e => {
            if (file) {
              useProjectStore.getState().updateFileContent(file.id, e.target.value);
            }
            onChange?.(e.target.value);
          }}
          placeholder="// Type your VNS script here..."
          className="absolute inset-0 h-full w-full resize-none border-none bg-neutral-950 p-4 font-mono text-xs text-neutral-200 outline-none focus:ring-0"
          spellCheck={false}
        />
      )}
    </div>
  );
});
