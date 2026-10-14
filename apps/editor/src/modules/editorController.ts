// ================================================================
// VN ENGINE STUDIO - MONACO EDITOR CONTROLLER MODULE
// Quản lý Monaco Editor, TextModels, Debounced Auto-compile & Format
// ================================================================

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { formatVns } from '@vn-engine/dsl-compiler';
import { registerVnsLanguage } from '../vnsLanguage';
import { registerVnsLanguageFeatures } from '../vnsLanguageFeatures';
import type { StudioContext } from './editorTypes';

// Configure Web Worker for Monaco Editor in Vite
if (typeof self !== 'undefined') {
  self.MonacoEnvironment = {
    getWorker: function (_moduleId: string, _label: string) {
      return new editorWorker();
    },
  };
}

export class EditorController {
  private context: StudioContext;
  private editorInstance!: monaco.editor.IStandaloneCodeEditor;
  private fileModels: Map<string, monaco.editor.ITextModel> = new Map();
  private editorDebounceTimerId: number | null = null;

  private onRunFromStartCallback?: () => void;
  private onRunFromLineCallback?: (targetLine: number, targetScene: string | null) => void;

  constructor(
    context: StudioContext,
    callbacks?: {
      onRunFromStart?: () => void;
      onRunFromLine?: (targetLine: number, targetScene: string | null) => void;
    },
  ) {
    this.context = context;
    this.onRunFromStartCallback = callbacks?.onRunFromStart;
    this.onRunFromLineCallback = callbacks?.onRunFromLine;

    this.initMonacoEditor();
  }

  public getEditor(): monaco.editor.IStandaloneCodeEditor {
    return this.editorInstance;
  }

  public getOrCreateTextModel(
    fileName: string,
    initialContent: string = '',
  ): monaco.editor.ITextModel {
    const uri = monaco.Uri.parse(`inmemory://project/${fileName}`);
    let model = monaco.editor.getModel(uri);
    if (model) {
      const currentVal = this.context.getFileContent(fileName);
      if (model.getValue() !== currentVal) {
        model.setValue(currentVal);
      }
    } else {
      model = monaco.editor.createModel(initialContent, 'vns', uri);
    }
    this.fileModels.set(fileName, model);
    return model;
  }

  public disposeTextModel(fileName: string): void {
    const uri = monaco.Uri.parse(`inmemory://project/${fileName}`);
    const model = monaco.editor.getModel(uri);
    if (model) {
      model.dispose();
    }
    this.fileModels.delete(fileName);
  }

  private initMonacoEditor(): void {
    registerVnsLanguage();

    // Đăng ký Autocomplete & Go-To-Definition thông minh
    registerVnsLanguageFeatures({
      getFiles: () => this.context.getFilesMap(),
      getScenes: () => this.context.getCachedAstMetadata().scenes,
      getCharacters: () => this.context.getProjectCharactersMap(),
      getAssets: () => this.context.getProjectAssetsMap(),
      getVariables: () => this.context.getCachedAstMetadata().variables,
      switchActiveFile: (fileName: string) => {
        const activeFile = this.context.getActiveFile();
        if (activeFile !== fileName) {
          this.switchActiveFile(fileName);
        }
      },
    });

    const project = this.context.getProject();
    const activeFile = this.context.getActiveFile();

    // Khởi tạo TextModel cho từng file trong dự án
    for (const f of project.files) {
      this.getOrCreateTextModel(f.name, f.content);
    }

    let activeModel = this.fileModels.get(activeFile);
    if (!activeModel) {
      activeModel = this.getOrCreateTextModel(activeFile, this.context.getFileContent(activeFile));
    }

    const container = document.getElementById('monaco-container')!;
    this.editorInstance = monaco.editor.create(container, {
      model: activeModel,
      theme: 'vns-wireframe-dark',
      language: 'vns',
      fontSize: 13.5,
      fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
      lineHeight: 22,
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      folding: true,
      wordWrap: 'off',
    });

    // Lắng nghe sự kiện thay đổi nội dung trên Monaco Editor (Debounced)
    this.editorInstance.onDidChangeModelContent(() => {
      this.handleEditorChange();
    });

    // Đăng ký phím tắt trong Monaco
    this.editorInstance.addCommand(monaco.KeyCode.F5, () => {
      this.runFromStart();
    });

    this.editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      this.runFromLine();
    });

    this.editorInstance.addCommand(
      monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
      () => {
        this.formatActiveDocument();
      },
    );

    window.addEventListener('resize', () => {
      this.editorInstance?.layout();
    });
  }

  public switchActiveFile(fileName: string): void {
    const model = this.getOrCreateTextModel(fileName, this.context.getFileContent(fileName));
    this.context.setActiveFile(fileName);
    this.editorInstance.setModel(model);
    this.context.renderFileList();
    this.context.compileCurrentScript();
  }

  private handleEditorChange(): void {
    const saveStatusPill = document.getElementById('save-status');
    if (saveStatusPill) {
      saveStatusPill.textContent = '● SAVING...';
      saveStatusPill.className = 'save-status-pill syncing';
    }

    if (this.editorDebounceTimerId !== null) {
      window.clearTimeout(this.editorDebounceTimerId);
    }

    this.editorDebounceTimerId = window.setTimeout(() => {
      this.flushEditorChanges();
    }, 400);
  }

  public flushEditorChanges(): void {
    if (this.editorDebounceTimerId !== null) {
      window.clearTimeout(this.editorDebounceTimerId);
      this.editorDebounceTimerId = null;
    }

    if (this.editorInstance) {
      const activeFile = this.context.getActiveFile();
      const val = this.editorInstance.getValue();
      this.context.setFileContent(activeFile, val);
      void this.context.saveProjectToStorage();
      this.context.compileCurrentScript();
    }
  }

  public formatActiveDocument(): void {
    if (this.editorInstance) {
      const model = this.editorInstance.getModel();
      if (model) {
        const formatted = formatVns(model.getValue(), { indentSize: 2 });
        this.editorInstance.executeEdits('auto-format', [
          {
            range: model.getFullModelRange(),
            text: formatted,
          },
        ]);
      }
    }

    const btn = document.getElementById('btn-format-document');
    if (btn) {
      btn.classList.add('formatted-flash');
      btn.textContent = '✓ Formatted';
      setTimeout(() => {
        btn.classList.remove('formatted-flash');
        btn.textContent = '⚡ Format';
      }, 1200);
    }
    this.context.showToast('Document formatted (Shift+Alt+F)');
  }

  public runFromStart(): void {
    this.flushEditorChanges();
    if (this.onRunFromStartCallback) {
      this.onRunFromStartCallback();
    }
  }

  public runFromLine(): void {
    this.flushEditorChanges();
    if (!this.editorInstance) return;

    const pos = this.editorInstance.getPosition();
    const currentLine = pos ? pos.lineNumber : 1;
    const model = this.editorInstance.getModel();
    let currentScene: string | null = null;

    if (model) {
      // Quét ngược tìm scene gần nhất phía trên dòng con trỏ
      for (let i = currentLine; i >= 1; i--) {
        const lineContent = model.getLineContent(i);
        const match = lineContent.match(/scene\s+(\.?[a-zA-Z0-9_]+)/);
        if (match && match[1]) {
          const rawScene = match[1];
          if (rawScene.startsWith('.')) {
            for (let j = i - 1; j >= 1; j--) {
              const parentMatch = model.getLineContent(j).match(/scene\s+([a-zA-Z0-9_]+)/);
              if (parentMatch && parentMatch[1] && !parentMatch[1].startsWith('.')) {
                currentScene = `${parentMatch[1]}${rawScene}`;
                break;
              }
            }
            if (!currentScene) currentScene = rawScene;
          } else {
            currentScene = rawScene;
          }
          break;
        }
      }
    }

    if (this.onRunFromLineCallback) {
      this.onRunFromLineCallback(currentLine, currentScene);
    }
  }
}
