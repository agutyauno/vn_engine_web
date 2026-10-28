import React, { useEffect, useRef, useState } from 'react';
import type { Project, ScriptFile } from '@vn-engine/shared-types';
import type * as monacoType from 'monaco-editor';

export interface MonacoEditorContainerProps {
  file: ScriptFile | null;
  project: Project;
  cursorJumpTarget?: { line: number; col: number } | null;
  onChange?: (newContent: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  readOnly?: boolean;
}

let vnsRegistered = false;

export const MonacoEditorContainer: React.FC<MonacoEditorContainerProps> = ({
  file,
  project,
  cursorJumpTarget,
  onChange,
  onCursorChange,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null);
  const [isMonacoMounted, setIsMonacoMounted] = useState(false);

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

      const monacoModule = await import('monaco-editor');
      const { registerVnsLanguage } = await import('../../vnsLanguage');
      const { registerVnsLanguageFeatures } = await import('../../vnsLanguageFeatures');

      if (!vnsRegistered) {
        try {
          registerVnsLanguage();
          registerVnsLanguageFeatures({
            getFiles: () => {
              const map: Record<string, string> = {};
              for (const f of project.files || []) {
                map[f.name] = f.content;
              }
              return map;
            },
            getScenes: () => [],
            getCharacters: () => {
              const map = new Map<string, { displayName?: string; sprites: Set<string> }>();
              for (const c of project.characters || []) {
                map.set(c.id, {
                  displayName: c.name,
                  sprites: new Set(Object.keys(c.sprites || {})),
                });
              }
              return map;
            },
            getAssets: () => {
              const bgs = new Set<string>();
              const audio = new Set<string>();
              for (const a of project.assets || []) {
                if (a.type === 'audio') audio.add(a.name);
                else bgs.add(a.name);
              }
              return { backgrounds: bgs, audio };
            },
            getVariables: () => (project.variables || []).map((v) => v.name),
            switchActiveFile: () => {},
          });
          vnsRegistered = true;
        } catch (err) {
          console.warn('VNS Language registration warning:', err);
        }
      }

      if (disposed || !containerRef.current) return;

      const editor = monacoModule.editor.create(containerRef.current, {
        value: file?.content || '',
        language: 'vns',
        theme: 'vs-dark',
        automaticLayout: true,
        readOnly,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        tabSize: 2,
      });

      editor.onDidChangeModelContent(() => {
        onChange?.(editor.getValue());
      });

      editor.onDidChangeCursorPosition((e) => {
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
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="// Type your VNS script here..."
          className="absolute inset-0 h-full w-full resize-none border-none bg-neutral-950 p-4 font-mono text-xs text-neutral-200 outline-none focus:ring-0"
          spellCheck={false}
        />
      )}
    </div>
  );
};
