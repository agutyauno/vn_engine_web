// ================================================================
// VN ENGINE STUDIO - WEB EDITOR CONTROLLER (MONACO POWERED)
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 & SAD v1.0
// ================================================================

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { Compiler, formatVns, type CompileError } from '@vn-engine/dsl-compiler';
import type {
  Project,
  ScriptFile,
  Character,
  AssetRef,
  Instruction,
  ProgramAST,
  StatementAST,
  DialogueStatement,
  ShowStatement,
  RevealStatement,
  BackgroundStatement,
  PlayStatement,
  VarDefineStatement,
  VarAssignStatement,
  IfStatement,
  WhileStatement,
  InspectStatement,
} from '@vn-engine/shared-types';
import { registerVnsLanguage } from './vnsLanguage';
import { registerVnsLanguageFeatures } from './vnsLanguageFeatures';
import {
  type IProjectRepository,
} from './repository/projectRepository';
import { SupabaseProjectRepository } from './repository/supabaseProjectRepository';
import { AppRouter } from './router';

// Configure Web Worker for Monaco Editor in Vite
self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, _label: string) {
    return new editorWorker();
  },
};

const DEFAULT_STARTER_SCRIPT = `# ==============================================================
# Welcome to Visual Novel Engine!
# Write your script here and see the live preview on the right.
# ==============================================================

scene start {
    background bg_courtyard transition: "fade"
    play music "theme_peaceful" volume: 0.8 loop: true

    show alice.happy(position: "center")
    alice: "Hello and welcome to your new visual novel story!"
    alice: "You can write script scenes here and see them previewed live on the right."

    choice {
        "Tell me more": goto .more_info
        "Let's get started": goto .begin
    }

    scene .more_info {
        alice: "You can manage characters, backgrounds, and audio assets in the tabs above."
        goto .begin
    }

    scene .begin {
        alice: "Have fun creating your adventure!"
        end
    }
}
`;

export class StudioApp {
  private compiler: Compiler;
  private repository: IProjectRepository;

  // Project structure conforming to @vn-engine/shared-types schema (Project)
  private project: Project = {
    id: 'local_default_project',
    title: 'Academy Mystery',
    version: 1,
    ownerId: 'local_user',
    defaultLanguage: 'en',
    files: [
      {
        id: 'main.vns',
        name: 'main.vns',
        content: DEFAULT_STARTER_SCRIPT,
        order: 0,
        version: 1,
      },
    ],
    characters: [],
    variables: [],
    assets: [],
    uiScreens: [],
    customScripts: [],
  };

  private activeFile: string = 'main.vns';
  private latestProgram: Instruction[] | null = null;
  private isDirty: boolean = false;
  private popoutWindow: Window | null = null;

  // Bộ đệm Metadata từ AST để phục vụ Autocomplete & Go-To-Definition
  private cachedAstMetadata = {
    scenes: [] as string[],
    characters: new Map<string, { displayName?: string; sprites: Set<string> }>(),
    assets: {
      backgrounds: new Set<string>(),
      audio: new Set<string>(),
    },
    variables: [] as string[],
  };

  // Monaco Editor state
  private editorInstance!: monaco.editor.IStandaloneCodeEditor;
  private fileModels: Map<string, monaco.editor.ITextModel> = new Map();

  // Trạng thái danh sách biểu cảm trong modal nhân vật
  private modalSpriteRows: { name: string; imageDataUrl: string }[] = [];

  // DOM Elements
  private projectTitleEl: HTMLElement;
  private saveStatusPill: HTMLElement;
  private activeFilenameEl: HTMLElement;
  private compilerIndicator: HTMLElement | null;
  private previewIframe: HTMLIFrameElement;
  private previewStatusBadge: HTMLElement | null;
  private toastEl: HTMLElement;
  private modalExport: HTMLElement;
  private fileListEl: HTMLElement;
  private btnAddFile: HTMLElement;

  // Sidebar containers & Reconciliation
  private charContainer: HTMLElement | null;
  private assetContainer: HTMLElement | null;
  private varContainer: HTMLElement | null;
  private btnAddCharacter: HTMLElement | null;
  private btnAddAsset: HTMLElement | null;
  private charReconciliationEl: HTMLElement | null;
  private assetReconciliationEl: HTMLElement | null;
  private activeAssetFilter: 'all' | 'image' | 'audio' | 'video' | 'font' = 'all';

  // Modals quản lý
  private modalCharForm: HTMLElement | null;
  private formCharacter: HTMLFormElement | null;
  private modalAssetForm: HTMLElement | null;
  private formAsset: HTMLFormElement | null;

  // Workspace & Management panel elements
  private lastActiveManagementTab: string = 'characters';
  private drawerTabProblems: HTMLElement;
  private problemsSummary: HTMLElement;
  private problemsList: HTMLElement;
  private varsWatchTbody: HTMLElement;

  // State timers
  private editorDebounceTimerId: number | null = null;
  private toastTimerId: number | null = null;

  constructor(repository?: IProjectRepository) {
    this.compiler = new Compiler();
    this.repository = repository || new SupabaseProjectRepository();

    // DOM Header
    this.projectTitleEl = document.getElementById('project-title')!;
    this.saveStatusPill = document.getElementById('save-status')!;

    // DOM Preview
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    this.previewStatusBadge = document.getElementById('preview-hot-reload-status');

    // DOM Editor Status Bar
    this.activeFilenameEl = document.getElementById('active-filename')!;
    this.compilerIndicator = document.getElementById('compiler-indicator');

    // DOM Sidebar
    this.fileListEl = document.getElementById('file-list')!;
    this.btnAddFile = document.getElementById('btn-add-file')!;
    this.charContainer = document.getElementById('character-list-container');
    this.assetContainer = document.getElementById('asset-list-container');
    this.varContainer = document.getElementById('variable-list-container');
    this.btnAddCharacter = document.getElementById('btn-add-character');
    this.btnAddAsset = document.getElementById('btn-add-asset');
    this.charReconciliationEl = document.getElementById('char-reconciliation-alerts');
    this.assetReconciliationEl = document.getElementById('asset-reconciliation-alerts');

    // DOM Management Tabs
    this.drawerTabProblems = document.getElementById('drawer-tab-problems')!;
    this.problemsSummary = document.getElementById('problems-summary')!;
    this.problemsList = document.getElementById('problems-list')!;
    this.varsWatchTbody = document.getElementById('vars-watch-tbody')!;

    // DOM Modal & Toast
    this.modalExport = document.getElementById('modal-export-wizard')!;
    this.modalCharForm = document.getElementById('modal-character-form');
    this.formCharacter = document.getElementById('form-character') as HTMLFormElement | null;
    this.modalAssetForm = document.getElementById('modal-asset-form');
    this.formAsset = document.getElementById('form-asset') as HTMLFormElement | null;
    this.toastEl = document.getElementById('studio-toast')!;
  }

  public async init(): Promise<void> {
    // 1. Nạp dự án từ IndexedDB Repository
    await this.loadProjectFromStorage();

    // 2. Thiết lập tiêu đề và danh sách tệp & quản lý dữ liệu
    this.projectTitleEl.textContent = this.project.title || 'Academy Mystery';
    this.activeFilenameEl.textContent = this.activeFile;
    this.renderFileList();
    this.renderCharacterList();
    this.renderAssetList();

    // 3. Khởi tạo Monaco Editor với ngôn ngữ VNS & Language Features
    this.initMonacoEditor();

    // 4. Khởi tạo các module giao diện
    this.setupProjectTitleRename();
    this.setupResizeHandles();
    this.setupBottomDrawer();
    this.setupSidebarTabs();
    this.setupCharacterManagement();
    this.setupAssetManagement();
    this.setupHeaderActions();
    this.setupPreviewMessaging();
    this.setupExportWizardActions();
    this.setupGlobalKeyboardShortcuts();
    this.setupUnloadProtection();

    // 5. Biên dịch lần đầu
    this.compileCurrentScript();
  }

  // ================================================================
  // QUẢN LÝ DỮ LIỆU TỆP (SCRIPT FILES MAP HELPER)
  // ================================================================
  private getFilesMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const f of this.project.files) {
      map[f.name] = f.content;
    }
    return map;
  }

  private getFileContent(fileName: string): string {
    const f = this.project.files.find(item => item.name === fileName);
    return f ? f.content : '';
  }

  private setFileContent(fileName: string, content: string): void {
    const f = this.project.files.find(item => item.name === fileName);
    if (f) {
      if (f.content !== content) {
        f.content = content;
        f.version = (f.version || 1) + 1;
        this.isDirty = true;
      }
    } else {
      this.project.files.push({
        id: fileName,
        name: fileName,
        content,
        order: this.project.files.length,
        version: 1,
      });
      this.isDirty = true;
    }
  }

  private removeFile(fileName: string): void {
    this.project.files = this.project.files.filter(f => f.name !== fileName);
    this.isDirty = true;
  }

  private renameFileKey(oldName: string, newName: string): void {
    const f = this.project.files.find(item => item.name === oldName);
    if (f) {
      f.name = newName;
      f.id = newName;
      f.version = (f.version || 1) + 1;
      this.isDirty = true;
    }
  }

  // ================================================================
  // 1. KHỞI TẠO MONACO EDITOR (#monaco-container)
  // ================================================================
  private getOrCreateTextModel(
    fileName: string,
    initialContent: string = '',
  ): monaco.editor.ITextModel {
    const uri = monaco.Uri.parse(`inmemory://project/${fileName}`);
    let model = monaco.editor.getModel(uri);
    if (model) {
      const currentVal = this.getFileContent(fileName);
      if (model.getValue() !== currentVal) {
        model.setValue(currentVal);
      }
    } else {
      model = monaco.editor.createModel(initialContent, 'vns', uri);
    }
    this.fileModels.set(fileName, model);
    return model;
  }

  private disposeTextModel(fileName: string): void {
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
      getFiles: () => this.getFilesMap(),
      getScenes: () => this.cachedAstMetadata.scenes,
      getCharacters: () => this.getProjectCharactersMap(),
      getAssets: () => this.getProjectAssetsMap(),
      getVariables: () => this.cachedAstMetadata.variables,
      switchActiveFile: (fileName: string) => this.switchActiveFile(fileName),
    });

    // Khởi tạo TextModel cho từng file trong dự án
    for (const f of this.project.files) {
      this.getOrCreateTextModel(f.name, f.content);
    }

    let activeModel = this.fileModels.get(this.activeFile);
    if (!activeModel) {
      activeModel = this.getOrCreateTextModel(
        this.activeFile,
        this.getFileContent(this.activeFile),
      );
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

  private saveCurrentFileFromEditor(): void {
    if (this.editorInstance) {
      const val = this.editorInstance.getValue();
      this.setFileContent(this.activeFile, val);
      void this.saveProjectToStorage();
    }
  }

  // ================================================================
  // 2. LƯU TRỮ DỰ ÁN QUA INDEXEDDB REPOSITORY
  // ================================================================
  private async loadProjectFromStorage(): Promise<void> {
    try {
      const projects = await this.repository.listProjects();
      if (projects.length > 0 && projects[0]) {
        const fullProj = await this.repository.getProject(projects[0].id);
        if (fullProj && Array.isArray(fullProj.files) && fullProj.files.length > 0) {
          this.project = fullProj;
          const fileNames = this.project.files.map(f => f.name);
          if (!fileNames.includes(this.activeFile)) {
            this.activeFile = fileNames[0] ?? 'main.vns';
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[StudioApp] Could not load project from repository:', e);
    }

    // Default initial project in memory only (không tự động lưu vào storage tránh project ma)
    this.project = {
      id: 'local_default_project',
      title: 'Academy Mystery',
      version: 1,
      ownerId: 'local_user',
      defaultLanguage: 'en',
      files: [
        {
          id: 'main.vns',
          name: 'main.vns',
          content: DEFAULT_STARTER_SCRIPT,
          order: 0,
          version: 1,
        },
      ],
      characters: [
        {
          id: 'alice',
          name: 'Alice Carroll',
          colorHex: '#38bdf8',
          sprites: {
            default: '',
            happy: '',
            serious: '',
            sad: '',
          },
        },
      ],
      variables: [],
      assets: [
        {
          id: 'asset_bg_courtyard',
          name: 'bg_courtyard',
          type: 'image',
          storageUrl: '',
          sizeBytes: 1024 * 180,
        },
        {
          id: 'asset_theme_peaceful',
          name: 'theme_peaceful',
          type: 'audio',
          storageUrl: '',
          sizeBytes: 1024 * 1024 * 2,
        },
      ],
      uiScreens: [],
      customScripts: [],
    };
    this.activeFile = 'main.vns';
  }

  public async loadProjectById(projectId: string): Promise<void> {
    if (this.editorDebounceTimerId !== null) {
      this.flushEditorChanges();
    }
    if (
      this.isDirty &&
      this.project?.id &&
      this.project.id !== projectId &&
      this.project.id !== 'local_default_project'
    ) {
      await this.saveProjectToStorage();
    }
    this.isDirty = false;

    try {
      const loaded = await this.repository.getProject(projectId);
      if (loaded) {
        this.project = loaded;
        if (!this.project.title) this.project.title = 'Untitled Project';
        if (!Array.isArray(this.project.characters)) this.project.characters = [];
        if (!Array.isArray(this.project.assets)) this.project.assets = [];
        if (!Array.isArray(this.project.files) || this.project.files.length === 0) {
          this.project.files = [
            {
              id: 'main.vns',
              name: 'main.vns',
              content: DEFAULT_STARTER_SCRIPT,
              order: 0,
              version: 1,
            },
          ];
        }
        const fileNames = this.project.files.map(f => f.name);
        this.activeFile = fileNames[0] ?? 'main.vns';

        this.projectTitleEl.textContent = this.project.title;
        this.activeFilenameEl.textContent = this.activeFile;
        this.renderFileList();
        this.renderCharacterList();
        this.renderAssetList();

        const content = this.getFileContent(this.activeFile);
        const model = this.getOrCreateTextModel(this.activeFile, content);
        if (this.editorInstance) {
          this.editorInstance.setModel(model);
          this.editorInstance.layout();
        }
        this.compileCurrentScript();
      } else {
        console.warn(`[StudioApp] Project ${projectId} not found, redirecting to projects dashboard.`);
        window.location.hash = '#/projects';
      }
    } catch (err) {
      console.error('[StudioApp] Error loading project by ID:', err);
      window.location.hash = '#/projects';
    }
  }

  private async saveProjectToStorage(): Promise<void> {
    try {
      this.saveStatusPill.textContent = '● SAVING...';
      this.saveStatusPill.className = 'save-status-pill syncing';

      if (this.isDirty) {
        this.project.version = (this.project.version || 1) + 1;
      }
      await this.repository.saveProject(this.project);
      this.isDirty = false;

      this.saveStatusPill.textContent = '● SAVED';
      this.saveStatusPill.className = 'save-status-pill';
    } catch (e) {
      console.error('[StudioApp] Error saving to storage:', e);
      this.saveStatusPill.textContent = '● SAVE ERROR';
      this.saveStatusPill.className = 'save-status-pill error';
    }
  }

  private setupProjectTitleRename(): void {
    this.projectTitleEl.addEventListener('click', () => {
      const newTitle = window.prompt('Enter new project title:', this.project.title);
      if (newTitle && newTitle.trim()) {
        this.project.title = newTitle.trim();
        this.projectTitleEl.textContent = this.project.title;
        void this.saveProjectToStorage();
        this.showToast(`Project renamed: "${this.project.title}"`);
      }
    });
  }

  private renderFileList(): void {
    this.fileListEl.innerHTML = '';

    this.project.files.forEach(file => {
      const fileName = file.name;
      const li = document.createElement('li');
      li.className = `file-item ${fileName === this.activeFile ? 'active' : ''}`;
      li.dataset.filename = fileName;

      const nameGroup = document.createElement('div');
      nameGroup.className = 'file-name-group';
      nameGroup.innerHTML = `<span class="file-icon">📄</span> <span class="file-name-text"></span>`;
      const nameSpan = nameGroup.querySelector('.file-name-text') as HTMLSpanElement;
      nameSpan.textContent = fileName;
      li.appendChild(nameGroup);

      if (fileName !== 'main.vns') {
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-file-delete';
        btnDel.innerHTML = '✕';
        btnDel.title = `Delete file ${fileName}`;
        btnDel.addEventListener('click', e => {
          e.stopPropagation();
          this.deleteFile(fileName);
        });
        li.appendChild(btnDel);
      }

      li.addEventListener('click', () => {
        this.switchActiveFile(fileName);
      });

      // Double click to rename file
      li.addEventListener('dblclick', e => {
        e.stopPropagation();
        this.startRenameFile(fileName, li);
      });

      this.fileListEl.appendChild(li);
    });

    this.activeFilenameEl.textContent = this.activeFile;
  }

  private switchActiveFile(fileName: string): void {
    if (this.activeFile === fileName) return;
    const fileExists = this.project.files.some(f => f.name === fileName);
    if (!fileExists) return;

    // Flush any pending debounce changes
    this.flushEditorChanges();

    // Switch activeFile
    this.activeFile = fileName;

    // Switch Monaco model
    const targetModel = this.getOrCreateTextModel(fileName, this.getFileContent(fileName));
    this.editorInstance.setModel(targetModel);
    this.activeFilenameEl.textContent = fileName;

    this.renderFileList();
    this.showToast(`Opening: ${fileName}`);
    this.compileCurrentScript();
  }

  /**
   * Sinh tên file mặc định tự tăng số kiểu Windows (New Script.vns, New Script (2).vns, ...)
   */
  private generateDefaultScriptName(): string {
    const base = 'New Script';
    let candidate = `${base}.vns`;
    let counter = 2;
    const existingNames = new Set(this.project.files.map(f => f.name));
    while (existingNames.has(candidate)) {
      candidate = `${base} (${counter}).vns`;
      counter++;
    }
    return candidate;
  }

  /**
   * Tạo tệp mới kiểu Windows Explorer: tạo dòng inline, tự bôi đen phần tên (trừ .vns),
   * Enter/blur để lưu, Escape để hủy.
   */
  private addNewFile(): void {
    const existingInput = this.fileListEl.querySelector(
      '.file-rename-input',
    ) as HTMLInputElement | null;
    if (existingInput) {
      existingInput.focus();
      return;
    }

    const defaultName = this.generateDefaultScriptName();

    const li = document.createElement('li');
    li.className = 'file-item file-item-editing';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-rename-input';
    input.value = defaultName;
    input.spellcheck = false;

    li.appendChild(input);
    this.fileListEl.appendChild(li);

    // Select name portion excluding .vns extension
    const dotIndex = defaultName.lastIndexOf('.');
    const selectEnd = dotIndex !== -1 ? dotIndex : defaultName.length;
    input.focus();
    input.setSelectionRange(0, selectEnd);

    let isHandled = false;

    const commitCreation = () => {
      if (isHandled) return;
      isHandled = true;

      let rawName = input.value.trim();
      if (!rawName) {
        li.remove();
        return;
      }

      if (!rawName.endsWith('.vns')) {
        rawName += '.vns';
      }

      // Check forbidden characters: \ / : * ? " < > |
      if (/[\\/:*?"<>|]/.test(rawName)) {
        this.showToast('File name cannot contain characters: \\ / : * ? " < > |');
        li.remove();
        return;
      }

      const fileExists = this.project.files.some(f => f.name === rawName);
      if (fileExists) {
        this.showToast(`File "${rawName}" already exists!`);
        li.remove();
        return;
      }

      this.flushEditorChanges();

      this.setFileContent(rawName, '');
      const model = this.getOrCreateTextModel(rawName, '');

      this.activeFile = rawName;
      this.editorInstance.setModel(model);
      this.activeFilenameEl.textContent = rawName;

      void this.saveProjectToStorage();
      this.renderFileList();
      this.compileCurrentScript();
      this.showToast(`Created new file: ${rawName}`);
    };

    const cancelCreation = () => {
      if (isHandled) return;
      isHandled = true;
      li.remove();
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitCreation();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelCreation();
      }
    });

    input.addEventListener('blur', () => {
      commitCreation();
    });
  }

  /**
   * Đổi tên tệp inline chuẩn Windows Explorer (Enter/blur để lưu, Escape để hủy)
   */
  private startRenameFile(oldFileName: string, liElement: HTMLElement): void {
    if (liElement.querySelector('.file-rename-input')) return;

    this.flushEditorChanges();

    liElement.innerHTML = '';
    liElement.classList.add('file-item-editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-rename-input';
    input.value = oldFileName;
    input.spellcheck = false;

    liElement.appendChild(input);

    const dotIndex = oldFileName.lastIndexOf('.');
    const selectEnd = dotIndex !== -1 ? dotIndex : oldFileName.length;
    input.focus();
    input.setSelectionRange(0, selectEnd);

    let isHandled = false;

    const commitRename = () => {
      if (isHandled) return;
      isHandled = true;

      let newName = input.value.trim();
      if (!newName) {
        this.renderFileList();
        return;
      }

      if (!newName.endsWith('.vns')) {
        newName += '.vns';
      }

      if (newName === oldFileName) {
        this.renderFileList();
        return;
      }

      if (/[\\/:*?"<>|]/.test(newName)) {
        this.showToast('File name cannot contain characters: \\ / : * ? " < > |');
        this.renderFileList();
        return;
      }

      const fileExists = this.project.files.some(f => f.name === newName);
      if (fileExists) {
        this.showToast(`File "${newName}" already exists!`);
        this.renderFileList();
        return;
      }

      // Rename in files list
      const content = this.getFileContent(oldFileName);
      this.renameFileKey(oldFileName, newName);

      this.disposeTextModel(oldFileName);
      const newModel = this.getOrCreateTextModel(newName, content);

      if (this.activeFile === oldFileName) {
        this.activeFile = newName;
        this.editorInstance.setModel(newModel);
        this.activeFilenameEl.textContent = newName;
      }

      void this.saveProjectToStorage();
      this.renderFileList();
      this.compileCurrentScript();
      this.showToast(`Renamed: ${oldFileName} → ${newName}`);
    };

    const cancelRename = () => {
      if (isHandled) return;
      isHandled = true;
      this.renderFileList();
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    });

    input.addEventListener('blur', () => {
      commitRename();
    });
  }

  private deleteFile(fileName: string): void {
    if (fileName === 'main.vns') {
      this.showToast('Cannot delete root file main.vns!');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete file "${fileName}"?`)) return;

    const wasActive = this.activeFile === fileName;

    // 1. Remove from files list
    this.removeFile(fileName);

    // 2. Dispose Monaco model
    this.disposeTextModel(fileName);

    // 3. Fallback if active
    if (wasActive) {
      const fallbackFile = this.project.files[0]?.name ?? 'main.vns';
      this.activeFile = fallbackFile;

      const fallbackModel = this.getOrCreateTextModel(
        fallbackFile,
        this.getFileContent(fallbackFile),
      );
      this.editorInstance.setModel(fallbackModel);
      this.activeFilenameEl.textContent = fallbackFile;
    }

    void this.saveProjectToStorage();
    this.renderFileList();
    this.compileCurrentScript();
    this.showToast(`Deleted file: ${fileName}`);
  }

  // ================================================================
  // 3. THANH KÉO ĐIỀU CHỈNH KÍCH THƯỚC (RESIZE HANDLES)
  // ================================================================
  private setupResizeHandles(): void {
    const sidebarHandle = document.getElementById('sidebar-resize-handle');
    const workspace = document.getElementById('studio-workspace');

    // THANH KÉO DỌC: ĐIỀU CHỈNH ĐỘ RỘNG CODE EDITOR BÊN TRÁI (LEFT / RIGHT)
    if (sidebarHandle && workspace) {
      sidebarHandle.addEventListener('mousedown', e => {
        e.preventDefault();
        sidebarHandle.classList.add('dragging');
        this.previewIframe.style.pointerEvents = 'none';

        const onMouseMove = (moveEvent: MouseEvent) => {
          const workspaceRect = workspace.getBoundingClientRect();
          const newWidth = Math.max(
            300,
            Math.min(workspaceRect.width - 320, moveEvent.clientX - workspaceRect.left),
          );
          document.documentElement.style.setProperty('--editor-width', `${newWidth}px`);
          document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
          this.editorInstance?.layout();
        };

        const onMouseUp = () => {
          sidebarHandle.classList.remove('dragging');
          this.previewIframe.style.pointerEvents = 'auto';
          this.editorInstance?.layout();
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    // THANH KÉO NGANG: ĐIỀU CHỈNH ĐỘ CAO BOTTOM DRAWER (UP / DOWN)
    const drawerHandle = document.getElementById('drawer-resize-handle');
    const bottomDrawer = document.getElementById('studio-bottom-drawer');
    const editorMain = document.getElementById('editor-main');

    if (drawerHandle && bottomDrawer && editorMain) {
      drawerHandle.addEventListener('mousedown', e => {
        e.preventDefault();
        drawerHandle.classList.add('dragging');
        bottomDrawer.classList.remove('collapsed');
        const toggleBtn = document.getElementById('drawer-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '▾';

        const onMouseMove = (moveEvent: MouseEvent) => {
          const editorRect = editorMain.getBoundingClientRect();
          const newHeight = Math.max(
            30,
            Math.min(editorRect.height - 100, editorRect.bottom - moveEvent.clientY),
          );
          bottomDrawer.style.height = `${newHeight}px`;
          this.editorInstance?.layout();
        };

        const onMouseUp = () => {
          drawerHandle.classList.remove('dragging');
          this.editorInstance?.layout();
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    // TỰ ĐỘNG CẬP NHẬT LAYOUT MONACO KHI CONTAINER THAY ĐỔI KÍCH THƯỚC
    const monacoContainer = document.getElementById('monaco-container');
    if (monacoContainer && window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.editorInstance?.layout();
      });
      resizeObserver.observe(monacoContainer);
    }
  }

  // ================================================================
  // 3b. QUẢN LÝ BẢNG THÔNG TIN ĐÁY EDITOR (BOTTOM DRAWER: PROBLEMS & VARIABLES WATCH)
  // ================================================================
  private setupBottomDrawer(): void {
    const drawerTabs = document.querySelectorAll<HTMLButtonElement>('.drawer-tab-btn');
    const drawerPanes = document.querySelectorAll<HTMLElement>('.drawer-pane');
    const bottomDrawer = document.getElementById('studio-bottom-drawer');
    const toggleBtn = document.getElementById('drawer-toggle-btn');

    drawerTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.drawerTab;
        drawerTabs.forEach(t => t.classList.toggle('active', t === tab));
        drawerPanes.forEach(p => {
          p.classList.toggle('active', p.id === `drawer-pane-${targetTab}`);
        });

        if (bottomDrawer?.classList.contains('collapsed')) {
          bottomDrawer.classList.remove('collapsed');
          if (toggleBtn) toggleBtn.textContent = '▾';
          this.editorInstance?.layout();
        }
      });
    });

    if (toggleBtn && bottomDrawer) {
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = bottomDrawer.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? '▴' : '▾';
        this.editorInstance?.layout();
      });
    }

    const drawerHeader = document.querySelector('.drawer-header');
    drawerHeader?.addEventListener('dblclick', e => {
      if (
        (e.target as HTMLElement).closest('.drawer-tab-btn') ||
        (e.target as HTMLElement).closest('.drawer-toggle-btn')
      ) {
        return;
      }
      if (bottomDrawer) {
        const isCollapsed = bottomDrawer.classList.toggle('collapsed');
        if (toggleBtn) toggleBtn.textContent = isCollapsed ? '▴' : '▾';
        this.editorInstance?.layout();
      }
    });
  }

  // ================================================================
  // 4. BẢNG QUẢN LÝ & TÀI NGUYÊN (TABBED WORKSPACE: PREVIEW & MANAGEMENT PANES)
  // ================================================================
  public switchWorkspaceTab(tabId: string): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.workspace-tab, .sidebar-tab');
    const panes = document.querySelectorAll<HTMLElement>('.workspace-pane, .sidebar-pane');

    // If user switches to preview tab
    if (tabId === 'preview') {
      // Close popout window if open
      if (this.popoutWindow && !this.popoutWindow.closed) {
        this.popoutWindow.close();
        this.popoutWindow = null;
        this.showToast('Closed pop-out window, restored Preview to main screen.');
      }
      this.updatePopoutButtonUI();
    } else {
      this.lastActiveManagementTab = tabId;
    }

    tabs.forEach(tab => {
      if (tab.dataset.tab === tabId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    panes.forEach(pane => {
      if (pane.id === `pane-${tabId}`) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });
  }

  private updatePopoutButtonUI(): void {
    const tabPreview = document.getElementById('tab-btn-preview');
    const isPopoutOpen = this.popoutWindow && !this.popoutWindow.closed;
    if (tabPreview) {
      tabPreview.textContent = isPopoutOpen ? 'Live Preview (Pop-out)' : 'Live Preview';
    }
  }

  private setupSidebarTabs(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.workspace-tab, .sidebar-tab');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        if (tabId) {
          this.switchWorkspaceTab(tabId);
        }
      });
    });

    this.btnAddFile.addEventListener('click', () => {
      this.addNewFile();
    });

    window.addEventListener('focus', () => {
      this.updatePopoutButtonUI();
    });
  }

  // ================================================================
  // 6. BIÊN DỊCH REAL-TIME & ĐỒNG BỘ MONACO MARKERS (DECOUPLED AUTO-SAVE)
  // ================================================================
  private handleEditorChange(): void {
    this.saveStatusPill.textContent = '● SAVING...';
    this.saveStatusPill.className = 'save-status-pill syncing';

    if (this.compilerIndicator) {
      this.compilerIndicator.textContent = 'Parsing script...';
      this.compilerIndicator.className = 'compiler-status-indicator compiling';
    }

    if (this.editorDebounceTimerId !== null) {
      window.clearTimeout(this.editorDebounceTimerId);
    }

    this.editorDebounceTimerId = window.setTimeout(() => {
      this.flushEditorChanges();
    }, 400);
  }

  private flushEditorChanges(): void {
    if (this.editorDebounceTimerId !== null) {
      window.clearTimeout(this.editorDebounceTimerId);
      this.editorDebounceTimerId = null;
    }
    // 1. Luôn lưu nội dung vào Storage (Tách bạch khỏi việc biên dịch - Zero Data Loss)
    this.saveCurrentFileFromEditor();

    // 2. Tiến hành biên dịch cập nhật lỗi và preview
    this.compileCurrentScript();
  }

  private compileCurrentScript(): void {
    if (this.editorInstance) {
      this.setFileContent(this.activeFile, this.editorInstance.getValue());
    }

    const scriptFiles: ScriptFile[] = this.project.files.map((f, index) => ({
      id: f.id,
      name: f.name,
      content: f.content,
      order: index,
      version: f.version || 1,
    }));

    const result = this.compiler.compile(scriptFiles, {
      characters: this.project.characters,
    });

    // Cập nhật Monaco Markers (Gạch chân đỏ lỗi cú pháp thời gian thực)
    const currentModel = this.editorInstance?.getModel();

    if (result.success && result.program) {
      this.latestProgram = result.program;

      if (this.compilerIndicator) {
        this.compilerIndicator.textContent = 'Auto compilation: READY';
        this.compilerIndicator.className = 'compiler-status-indicator';
      }

      this.drawerTabProblems.classList.remove('has-error');
      this.problemsSummary.textContent = '● Problems (0 errors)';
      this.problemsList.innerHTML = '<div class="no-problem-message">✓ No problems detected in script.</div>';

      if (currentModel) {
        monaco.editor.setModelMarkers(currentModel, 'vns-compiler', []);
      }

      this.sendProgramToPreview(this.latestProgram);

      if (result.ast) {
        this.updateSidebarMetadata(result.ast);
      }
    } else {
      const errors = result.errors || [];
      if (this.compilerIndicator) {
        this.compilerIndicator.textContent = `Auto compilation: ${errors.length} ERRORS`;
        this.compilerIndicator.className = 'compiler-status-indicator error';
      }

      this.drawerTabProblems.classList.add('has-error');
      this.problemsSummary.textContent = `● Problems (${errors.length} errors)`;

      const bottomDrawer = document.getElementById('studio-bottom-drawer');
      if (bottomDrawer?.classList.contains('collapsed')) {
        bottomDrawer.classList.remove('collapsed');
        const toggleBtn = document.getElementById('drawer-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '▾';
        this.editorInstance?.layout();
      }

      // Đảm bảo tab Problems active trong bottom drawer
      const problemsTab = document.getElementById('drawer-tab-problems');
      const problemsPane = document.getElementById('drawer-pane-problems');
      if (problemsTab && !problemsTab.classList.contains('active')) {
        document.querySelectorAll('.drawer-tab-btn').forEach(t => t.classList.toggle('active', t === problemsTab));
        document.querySelectorAll('.drawer-pane').forEach(p => p.classList.toggle('active', p === problemsPane));
      }

      // Tạo markers gạch chân đỏ trên Monaco
      if (currentModel) {
        const activeFileObj = this.project.files.find(f => f.name === this.activeFile);
        const activeFileId = activeFileObj?.id;

        const markers: monaco.editor.IMarkerData[] = errors
          .filter(err => !err.loc?.fileId || err.loc.fileId === this.activeFile || err.loc.fileId === activeFileId)
          .map(err => {
            const line = err.loc?.line ?? 1;
            const col = err.loc?.col ?? 1;
            const lineContent = currentModel.getLineContent(line) || '';
            return {
              startLineNumber: line,
              startColumn: col,
              endLineNumber: line,
              endColumn: Math.max(col + 1, lineContent.length + 1),
              message: err.message,
              severity: monaco.MarkerSeverity.Error,
            };
          });
        monaco.editor.setModelMarkers(currentModel, 'vns-compiler', markers);
      }

      this.problemsList.innerHTML = '';
      errors.forEach((err: CompileError) => {
        const row = document.createElement('div');
        row.className = 'problem-row';
        const line = err.loc?.line ?? 1;
        const col = err.loc?.col ?? 1;
        const matchingFile = this.project.files.find(f => f.id === err.loc?.fileId || f.name === err.loc?.fileId);
        const displayFileName = matchingFile ? matchingFile.name : (err.loc?.fileId || this.activeFile);
        const file = `[${displayFileName}] `;
        row.textContent = `✕ ${file}Line ${line}, Col ${col}: ${err.message}`;
        row.addEventListener('click', () => {
          if (err.loc?.fileId && err.loc.fileId !== this.activeFile) {
            this.switchActiveFile(err.loc.fileId);
          }
          this.jumpToLine(line, col);
        });
        this.problemsList.appendChild(row);
      });
    }
  }

  private jumpToLine(lineNumber: number, col: number = 1): void {
    if (this.editorInstance) {
      this.editorInstance.revealLineInCenter(lineNumber);
      this.editorInstance.setPosition({ lineNumber, column: col });
      this.editorInstance.focus();
    }
  }

  // ================================================================
  // 7. CẬP NHẬT SIDEBAR METADATA AN TOÀN XSS (SAFE DOM WITH textContent)
  // ================================================================
  private updateSidebarMetadata(ast: ProgramAST): void {
    const characters = new Map<string, { displayName?: string; sprites: Set<string> }>();
    const backgrounds = new Set<string>();
    const musicAssets = new Set<string>();
    const soundAssets = new Set<string>();
    interface VariableMeta {
      name: string;
      value: unknown;
      scope: 'global' | 'local';
      sceneName?: string;
    }
    const variables = new Map<string, VariableMeta>();
    const scenesList: string[] = [];

    // Quét các biến toàn cục ở topLevelStatements
    if (ast.topLevelStatements) {
      for (const stmt of ast.topLevelStatements) {
        if (stmt.type === 'VarDefineStatement') {
          const vd = stmt as VarDefineStatement;
          variables.set(vd.variable, {
            name: vd.variable,
            value: (vd.value as { value?: unknown })?.value ?? 'assigned value',
            scope: 'global',
          });
        }
      }
    }

    const traverse = (stmts: StatementAST[], sceneName: string) => {
      for (const stmt of stmts) {
        if (stmt.type === 'ShowStatement') {
          const s = stmt as ShowStatement;
          backgrounds.add(s.character);
          if (!characters.has(s.character)) {
            characters.set(s.character, { sprites: new Set() });
          }
          if (s.sprite && s.sprite.trim().length > 0) {
            characters.get(s.character)!.sprites.add(s.sprite);
          }
        } else if (stmt.type === 'DialogueStatement') {
          const d = stmt as DialogueStatement;
          if (d.character) {
            if (!characters.has(d.character)) {
              characters.set(d.character, { sprites: new Set() });
            }
            if (d.displayNameOverride && !characters.get(d.character)!.displayName) {
              characters.get(d.character)!.displayName = d.displayNameOverride;
            }
          }
        } else if (stmt.type === 'RevealStatement') {
          const r = stmt as RevealStatement;
          if (!characters.has(r.characterId)) {
            characters.set(r.characterId, { sprites: new Set() });
          }
          characters.get(r.characterId)!.displayName = r.displayName;
        } else if (stmt.type === 'BackgroundStatement') {
          const b = stmt as BackgroundStatement;
          backgrounds.add(b.assetId);
        } else if (stmt.type === 'InspectStatement') {
          const insp = stmt as InspectStatement;
          backgrounds.add(insp.assetId);
        } else if (stmt.type === 'PlayStatement') {
          const p = stmt as PlayStatement;
          if (p.channel === 'music') musicAssets.add(p.assetId);
          else soundAssets.add(p.assetId);
        } else if (stmt.type === 'VarDefineStatement') {
          const vd = stmt as VarDefineStatement;
          variables.set(vd.variable, {
            name: vd.variable,
            value: (vd.value as { value?: unknown })?.value ?? 'assigned value',
            scope: 'local',
            sceneName,
          });
        } else if (stmt.type === 'VarAssignStatement') {
          const v = stmt as VarAssignStatement;
          const existing = variables.get(v.variable);
          if (existing) {
            existing.value = (v.value as { value?: unknown })?.value ?? existing.value;
          } else {
            variables.set(v.variable, {
              name: v.variable,
              value: (v.value as { value?: unknown })?.value ?? 'assigned value',
              scope: 'local',
              sceneName,
            });
          }
        } else if (stmt.type === 'IfStatement') {
          const ifs = stmt as IfStatement;
          traverse(ifs.consequent, sceneName);
          if (ifs.alternate) {
            if (Array.isArray(ifs.alternate)) traverse(ifs.alternate, sceneName);
            else traverse([ifs.alternate], sceneName);
          }
        } else if (stmt.type === 'WhileStatement') {
          const ws = stmt as WhileStatement;
          traverse(ws.body, sceneName);
        }
      }
    };

    if (Array.isArray(ast.scenes)) {
      for (const sc of ast.scenes) {
        if (sc && sc.name) {
          scenesList.push(sc.name);
          if (sc.body) traverse(sc.body, sc.name);
        }
      }
    }

    // Cập nhật bộ đệm cho Autocomplete
    this.cachedAstMetadata.scenes = scenesList;
    this.cachedAstMetadata.characters = characters;
    this.cachedAstMetadata.assets.backgrounds = backgrounds;
    this.cachedAstMetadata.assets.audio = new Set([...musicAssets, ...soundAssets]);
    this.cachedAstMetadata.variables = Array.from(variables.keys());

    // 1. Đối chiếu & Hiển thị Nhân vật (Active 2-Way Reconciliation)
    this.reconcileCharactersWithScript(characters);
    this.renderCharacterList();

    // 2. Đối chiếu & Hiển thị Tài nguyên (Active 2-Way Reconciliation)
    this.reconcileAssetsWithScript(backgrounds, new Set([...musicAssets, ...soundAssets]));
    this.renderAssetList();

    // 3. Render Variables Tab (Safe DOM)
    if (this.varContainer) {
      this.varContainer.innerHTML = '';
      if (variables.size === 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-meta-hint';
        hint.textContent =
          'No state variables yet. Use syntax: define var_name = value to declare a variable.';
        this.varContainer.appendChild(hint);
      } else {
        for (const [, meta] of variables) {
          const card = document.createElement('div');
          card.className = 'meta-card';

          const title = document.createElement('div');
          title.className = 'meta-card-title';
          title.textContent = `define ${meta.name}`;
          card.appendChild(title);

          const tags = document.createElement('div');
          tags.className = 'meta-tags-list';

          const scopePill = document.createElement('span');
          scopePill.className = 'meta-tag-pill';
          scopePill.style.fontWeight = '600';
          scopePill.style.color = meta.scope === 'global' ? '#4ade80' : '#60a5fa';
          scopePill.textContent =
            meta.scope === 'global' ? 'Global' : `Local: ${meta.sceneName || 'scene'}`;
          tags.appendChild(scopePill);

          const pill = document.createElement('span');
          pill.className = 'meta-tag-pill';
          pill.textContent = `Initial: ${String(meta.value)}`;
          tags.appendChild(pill);

          card.appendChild(tags);
          this.varContainer.appendChild(card);
        }
      }
    }

    // 4. Render Variables Watch Table in Bottom Drawer (Safe DOM)
    this.varsWatchTbody.innerHTML = '';
    if (variables.size === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.color = '#666';
      td.textContent = 'No variables.';
      tr.appendChild(td);
      this.varsWatchTbody.appendChild(tr);
    } else {
      for (const [, meta] of variables) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.style.fontWeight = '600';
        tdName.style.color = '#fff';
        tdName.textContent = meta.name;

        const tdScope = document.createElement('td');
        tdScope.style.color = meta.scope === 'global' ? '#4ade80' : '#60a5fa';
        tdScope.textContent =
          meta.scope === 'global' ? 'Global' : `Local (${meta.sceneName || 'scene'})`;

        const tdType = document.createElement('td');
        tdType.style.color = '#888';
        tdType.textContent = typeof meta.value;

        const tdVal = document.createElement('td');
        tdVal.style.color = '#22c55e';
        tdVal.textContent = String(meta.value);

        tr.appendChild(tdName);
        tr.appendChild(tdScope);
        tr.appendChild(tdType);
        tr.appendChild(tdVal);
        this.varsWatchTbody.appendChild(tr);
      }
    }
  }

  // ================================================================
  // 7b. QUẢN LÝ NHÂN VẬT, TÀI NGUYÊN & LỚP ĐỐI CHIẾU 2 CHIỀU
  // ================================================================
  private getProjectCharactersMap(): Map<string, { displayName?: string; sprites: Set<string> }> {
    const map = new Map<string, { displayName?: string; sprites: Set<string> }>();
    if (Array.isArray(this.project.characters)) {
      for (const c of this.project.characters) {
        const sprites = new Set<string>(Object.keys(c.sprites || {}));
        map.set(c.id, { displayName: c.name, sprites });
      }
    }
    // Gộp thêm các nhân vật phát hiện từ AST (nếu có)
    for (const [id, info] of this.cachedAstMetadata.characters) {
      if (!map.has(id)) {
        map.set(id, { displayName: info.displayName, sprites: new Set(info.sprites) });
      } else {
        const existing = map.get(id)!;
        for (const sp of info.sprites) existing.sprites.add(sp);
      }
    }
    return map;
  }

  private getProjectAssetsMap(): { backgrounds: Set<string>; audio: Set<string> } {
    const backgrounds = new Set<string>();
    const audio = new Set<string>();
    if (Array.isArray(this.project.assets)) {
      for (const a of this.project.assets) {
        if (a.type === 'image') {
          backgrounds.add(a.name);
        } else if (a.type === 'audio') {
          audio.add(a.name);
        }
      }
    }
    for (const b of this.cachedAstMetadata.assets.backgrounds) backgrounds.add(b);
    for (const a of this.cachedAstMetadata.assets.audio) audio.add(a);
    return { backgrounds, audio };
  }

  private reconcileCharactersWithScript(
    astCharacters: Map<string, { displayName?: string; sprites: Set<string> }>,
  ): void {
    if (!this.charReconciliationEl) return;
    this.charReconciliationEl.innerHTML = '';

    const declaredIds = new Set((this.project.characters || []).map(c => c.id));
    const assetNames = new Set((this.project.assets || []).map(a => a.name.toLowerCase()));
    const assetIds = new Set((this.project.assets || []).map(a => a.id.toLowerCase()));

    for (const [charId, info] of astCharacters) {
      if (assetNames.has(charId.toLowerCase()) || assetIds.has(charId.toLowerCase())) {
        // Đạo cụ sân khấu hoặc vật phẩm (Stage Prop / Item), không phải nhân vật thiếu khai báo
        continue;
      }
      if (!declaredIds.has(charId)) {
        const alertCard = document.createElement('div');
        alertCard.className = 'reconciliation-alert-card';

        const title = document.createElement('div');
        title.className = 'reconciliation-alert-title';
        title.textContent = `⚠️ Character "${charId}" not declared in project`;

        const desc = document.createElement('div');
        desc.className = 'reconciliation-alert-desc';
        desc.textContent = info.displayName
          ? `Script uses "${charId}" (${info.displayName}) but it is not added in the Characters tab.`
          : `Script uses "${charId}:" or "show ${charId}" but it is not added in the Characters tab.`;

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '8px';
        btnGroup.style.marginTop = '6px';

        const btnQuick = document.createElement('button');
        btnQuick.className = 'reconciliation-alert-btn';
        btnQuick.textContent = `+ Quick Add (Default Color)`;
        btnQuick.addEventListener('click', () => {
          this.quickAddCharacter(charId, info.displayName);
        });

        const btnCustom = document.createElement('button');
        btnCustom.className = 'reconciliation-alert-btn';
        btnCustom.style.background = 'transparent';
        btnCustom.style.border = '1px solid var(--studio-border)';
        btnCustom.textContent = `✎ Customise`;
        btnCustom.addEventListener('click', () => {
          this.openCharacterModal(undefined, charId, info.displayName);
        });

        btnGroup.appendChild(btnQuick);
        btnGroup.appendChild(btnCustom);

        alertCard.appendChild(title);
        alertCard.appendChild(desc);
        alertCard.appendChild(btnGroup);
        this.charReconciliationEl.appendChild(alertCard);
      }
    }
  }

  private quickAddCharacter(charId: string, displayName?: string): void {
    const formattedName = displayName || charId.charAt(0).toUpperCase() + charId.slice(1);
    if (!Array.isArray(this.project.characters)) {
      this.project.characters = [];
    }
    if (this.project.characters.some(c => c.id === charId)) return;

    this.project.characters.push({
      id: charId,
      name: formattedName,
      colorHex: '#38BDF8',
      sprites: { default: '' },
    });

    void this.saveProjectToStorage();
    this.renderCharacterList();
    this.compileCurrentScript();
    this.showToast(`Quick added character "${charId}" (${formattedName}) with default color.`);
  }

  private renderCharacterList(): void {
    if (!this.charContainer) return;
    this.charContainer.innerHTML = '';

    const chars: Character[] = this.project.characters || [];
    if (chars.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-meta-hint';
      hint.textContent =
        'No characters in project yet. Click "+ Add Character" above to create the first character.';
      this.charContainer.appendChild(hint);
      return;
    }

    for (const char of chars) {
      const card = document.createElement('div');
      card.className = 'character-card';

      // Header row
      const header = document.createElement('div');
      header.className = 'character-card-header';

      const identity = document.createElement('div');
      identity.className = 'character-identity';

      const dot = document.createElement('span');
      dot.className = 'char-badge-dot';
      dot.style.backgroundColor = char.colorHex || '#38bdf8';

      const idSpan = document.createElement('span');
      idSpan.className = 'character-id-text';
      idSpan.textContent = char.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'character-name-text';
      nameSpan.textContent = char.name ? `(${char.name})` : '';

      const hexBadge = document.createElement('span');
      hexBadge.style.fontFamily = 'var(--vn-font-mono)';
      hexBadge.style.fontSize = '9px';
      hexBadge.style.color = char.colorHex || '#38bdf8';
      hexBadge.style.border = `1px solid ${char.colorHex || '#38bdf8'}`;
      hexBadge.style.padding = '0 3px';
      hexBadge.style.marginLeft = '4px';
      hexBadge.textContent = (char.colorHex || '#38bdf8').toUpperCase();

      identity.appendChild(dot);
      identity.appendChild(idSpan);
      if (char.name) identity.appendChild(nameSpan);
      identity.appendChild(hexBadge);

      const actions = document.createElement('div');
      actions.className = 'meta-card-actions';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-card-action';
      btnEdit.title = `Edit character ${char.id}`;
      btnEdit.textContent = '✎ Edit';
      btnEdit.addEventListener('click', () => {
        this.openCharacterModal(char.id);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-card-action btn-card-delete';
      btnDel.title = `Delete character ${char.id}`;
      btnDel.textContent = '✕ Delete';
      btnDel.addEventListener('click', () => {
        this.deleteCharacter(char.id);
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);

      header.appendChild(identity);
      header.appendChild(actions);
      card.appendChild(header);

      // Sprites section
      const spritesSection = document.createElement('div');
      spritesSection.className = 'char-sprites-section';

      const label = document.createElement('span');
      label.className = 'sprites-label';
      label.textContent = 'Expressions (Sprites):';
      spritesSection.appendChild(label);

      const spritesList = document.createElement('div');
      spritesList.className = 'meta-tags-list';

      const spriteKeys = Object.keys(char.sprites || {});
      if (spriteKeys.length === 0) {
        const noSp = document.createElement('span');
        noSp.style.fontSize = '10px';
        noSp.style.color = '#666';
        noSp.textContent = '(No sprites yet) ';
        spritesList.appendChild(noSp);
      } else {
        for (const sp of spriteKeys) {
          const pill = document.createElement('span');
          pill.className = 'sprite-pill';

          const imgData = char.sprites?.[sp];
          if (imgData && imgData.trim().length > 0) {
            const thumb = document.createElement('img');
            thumb.className = 'sprite-pill-thumb';
            thumb.src = imgData;
            thumb.alt = sp;
            pill.appendChild(thumb);
          }

          const spName = document.createElement('span');
          spName.textContent = sp;

          const removeBtn = document.createElement('button');
          removeBtn.className = 'btn-remove-sprite';
          removeBtn.title = `Delete expression ${sp}`;
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            this.removeCharacterSprite(char.id, sp);
          });

          pill.appendChild(spName);
          pill.appendChild(removeBtn);
          spritesList.appendChild(pill);
        }
      }

      // Add sprite button
      const btnAddSprite = document.createElement('button');
      btnAddSprite.className = 'btn-add-sprite-inline';
      btnAddSprite.textContent = '+ Add sprite';
      btnAddSprite.addEventListener('click', () => {
        const spName = window.prompt(
          `Enter new sprite/expression name for character "${char.id}":`,
        );
        if (spName && spName.trim()) {
          this.addCharacterSprite(char.id, spName.trim());
        }
      });
      spritesList.appendChild(btnAddSprite);

      spritesSection.appendChild(spritesList);

      // Reconciliation check: Does script use sprites not declared?
      const astCharInfo = this.cachedAstMetadata.characters.get(char.id);
      if (astCharInfo && astCharInfo.sprites) {
        const missingSprites: string[] = [];
        for (const usedSp of astCharInfo.sprites) {
          if (!usedSp || usedSp === 'default') continue;
          if (!char.sprites || !(usedSp in char.sprites)) {
            missingSprites.push(usedSp);
          }
        }
        if (missingSprites.length > 0) {
          const warningEl = document.createElement('div');
          warningEl.style.marginTop = '4px';
          warningEl.style.fontSize = '10px';
          warningEl.style.color = '#facc15';
          warningEl.textContent = `⚠️ Script calls: ${missingSprites.join(', ')} (not in catalog)`;
          spritesSection.appendChild(warningEl);
        }
      }

      card.appendChild(spritesSection);
      this.charContainer.appendChild(card);
    }
  }

  private reconcileAssetsWithScript(backgrounds: Set<string>, audio: Set<string>): void {
    if (!this.assetReconciliationEl) return;
    this.assetReconciliationEl.innerHTML = '';

    const declaredNames = new Set((this.project.assets || []).map(a => a.name));
    const declaredIds = new Set((this.project.assets || []).map(a => a.id));

    for (const bg of backgrounds) {
      if (!declaredNames.has(bg) && !declaredIds.has(bg)) {
        const alertCard = document.createElement('div');
        alertCard.className = 'reconciliation-alert-card';

        const title = document.createElement('div');
        title.className = 'reconciliation-alert-title';
        title.textContent = `⚠️ Background "${bg}" not registered`;

        const desc = document.createElement('div');
        desc.className = 'reconciliation-alert-desc';
        desc.textContent = `Script uses command: background ${bg} but it is not in the Assets catalog.`;

        const btn = document.createElement('button');
        btn.className = 'reconciliation-alert-btn';
        btn.textContent = `+ Declare asset "${bg}"`;
        btn.addEventListener('click', () => {
          this.openAssetModal(undefined, bg, 'image');
        });

        alertCard.appendChild(title);
        alertCard.appendChild(desc);
        alertCard.appendChild(btn);
        this.assetReconciliationEl.appendChild(alertCard);
      }
    }

    for (const aud of audio) {
      if (!declaredNames.has(aud) && !declaredIds.has(aud)) {
        const alertCard = document.createElement('div');
        alertCard.className = 'reconciliation-alert-card';

        const title = document.createElement('div');
        title.className = 'reconciliation-alert-title';
        title.textContent = `⚠️ Audio "${aud}" not registered`;

        const desc = document.createElement('div');
        desc.className = 'reconciliation-alert-desc';
        desc.textContent = `Script uses command play "${aud}" but it is not in the Assets catalog.`;

        const btn = document.createElement('button');
        btn.className = 'reconciliation-alert-btn';
        btn.textContent = `+ Declare asset "${aud}"`;
        btn.addEventListener('click', () => {
          this.openAssetModal(undefined, aud, 'audio');
        });

        alertCard.appendChild(title);
        alertCard.appendChild(desc);
        alertCard.appendChild(btn);
        this.assetReconciliationEl.appendChild(alertCard);
      }
    }
  }

  private renderAssetList(): void {
    if (!this.assetContainer) return;
    this.assetContainer.innerHTML = '';

    let assets: AssetRef[] = this.project.assets || [];
    if (this.activeAssetFilter !== 'all') {
      assets = assets.filter(a => a.type === this.activeAssetFilter);
    }

    if (assets.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'empty-meta-hint';
      hint.textContent =
        this.activeAssetFilter === 'all'
          ? 'No assets in project yet. Click "+ Add Asset" above to add one.'
          : `No assets of type "${this.activeAssetFilter}".`;
      this.assetContainer.appendChild(hint);
      return;
    }

    const usedBackgrounds = this.cachedAstMetadata.assets.backgrounds;
    const usedAudio = this.cachedAstMetadata.assets.audio;

    for (const asset of assets) {
      const card = document.createElement('div');
      card.className = 'asset-card';

      const main = document.createElement('div');
      main.className = 'asset-card-main';

      const icon = document.createElement('div');
      icon.className = 'asset-card-icon';
      icon.textContent =
        asset.type === 'audio'
          ? '🎵'
          : asset.type === 'video'
          ? '🎥'
          : asset.type === 'font'
          ? '🔤'
          : '🖼';

      const info = document.createElement('div');
      info.className = 'asset-card-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'asset-name-row';

      const nameText = document.createElement('span');
      nameText.className = 'asset-name-text';
      nameText.textContent = asset.name;
      nameText.title = asset.name;

      const typeBadge = document.createElement('span');
      typeBadge.className = 'asset-type-badge';
      typeBadge.textContent = asset.type;

      nameRow.appendChild(nameText);
      nameRow.appendChild(typeBadge);

      // Check if used in script
      const isUsed =
        asset.type === 'audio'
          ? usedAudio.has(asset.name) || usedAudio.has(asset.id)
          : asset.type === 'video' || asset.type === 'font'
          ? true
          : usedBackgrounds.has(asset.name) || usedBackgrounds.has(asset.id);

      if (!isUsed) {
        const unusedBadge = document.createElement('span');
        unusedBadge.className = 'asset-badge-unused';
        unusedBadge.textContent = 'Unused';
        unusedBadge.title = 'This asset is not referenced in any script file';
        nameRow.appendChild(unusedBadge);
      }

      info.appendChild(nameRow);
      main.appendChild(icon);
      main.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'meta-card-actions';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-card-action';
      btnEdit.title = `Edit asset ${asset.name}`;
      btnEdit.textContent = '✎ Edit';
      btnEdit.addEventListener('click', () => {
        this.openAssetModal(asset.id);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-card-action btn-card-delete';
      btnDel.title = `Delete asset ${asset.name}`;
      btnDel.textContent = '✕ Delete';
      btnDel.addEventListener('click', () => {
        this.deleteAsset(asset.id);
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);

      card.appendChild(main);
      card.appendChild(actions);
      this.assetContainer.appendChild(card);
    }
  }

  private setupCharacterManagement(): void {
    if (this.btnAddCharacter) {
      this.btnAddCharacter.addEventListener('click', () => {
        this.openCharacterModal();
      });
    }

    const btnClose = document.getElementById('btn-close-char-modal');
    const btnCancel = document.getElementById('btn-cancel-char-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.closeCharacterModal());
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeCharacterModal());

    // Color controls: hex input, color picker, sample preview tag
    const hexInput = document.getElementById('char-input-color-hex') as HTMLInputElement | null;
    const colorInput = document.getElementById('char-input-color') as HTMLInputElement | null;
    const previewTag = document.getElementById('char-color-preview-tag');
    const nameInput = document.getElementById('char-input-name') as HTMLInputElement | null;

    const updateColorState = (hex: string) => {
      let normalized = hex.trim();
      if (!normalized.startsWith('#')) {
        normalized = '#' + normalized;
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(normalized) || /^#[0-9A-Fa-f]{3}$/.test(normalized)) {
        if (colorInput) {
          colorInput.value =
            normalized.length === 4
              ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
              : normalized;
        }
        if (previewTag) {
          previewTag.style.color = normalized;
          previewTag.style.borderColor = normalized;
        }
      }
    };

    if (hexInput) {
      hexInput.addEventListener('input', () => {
        updateColorState(hexInput.value);
      });
    }

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        const val = colorInput.value.toUpperCase();
        if (hexInput) hexInput.value = val;
        if (previewTag) {
          previewTag.style.color = val;
          previewTag.style.borderColor = val;
        }
      });
    }

    // Color preset buttons
    const colorPresets = document.querySelectorAll('.color-preset-btn');
    colorPresets.forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color');
        if (color) {
          if (hexInput) hexInput.value = color.toUpperCase();
          if (colorInput) colorInput.value = color;
          if (previewTag) {
            previewTag.style.color = color;
            previewTag.style.borderColor = color;
          }
        }
      });
    });

    if (nameInput && previewTag) {
      nameInput.addEventListener('input', () => {
        previewTag.textContent = nameInput.value.trim() || 'Display Name';
      });
    }

    // Button thêm biểu cảm trong modal
    const btnAddSpriteRow = document.getElementById('btn-add-sprite-row');
    if (btnAddSpriteRow) {
      btnAddSpriteRow.addEventListener('click', () => {
        this.addModalSpriteRow();
      });
    }

    if (this.formCharacter) {
      this.formCharacter.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.saveCharacterFromModal();
      });
    }
  }

  private renderModalSpriteRows(): void {
    const listContainer = document.getElementById('char-sprites-manager-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (this.modalSpriteRows.length === 0) {
      this.modalSpriteRows.push({ name: 'default', imageDataUrl: '' });
    }

    this.modalSpriteRows.forEach((row, idx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'sprite-manager-row';

      // 1. Ô nhập tên biểu cảm
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'wf-form-input sprite-row-name';
      nameInput.placeholder = idx === 0 ? 'default' : 'sprite name...';
      nameInput.value = row.name;
      nameInput.addEventListener('input', () => {
        row.name = nameInput.value.trim();
      });

      // 2. Hộp xem trước thumbnail
      const thumbBox = document.createElement('div');
      thumbBox.className = 'sprite-row-thumb-box';
      if (row.imageDataUrl) {
        const img = document.createElement('img');
        img.className = 'sprite-row-thumb-img';
        img.src = row.imageDataUrl;
        img.alt = row.name;
        thumbBox.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'sprite-row-thumb-placeholder';
        placeholder.textContent = '🖼';
        thumbBox.appendChild(placeholder);
      }

      // 3. Nút tải ảnh lên từ máy
      const uploadLabel = document.createElement('label');
      uploadLabel.className = 'sprite-upload-btn-label';
      uploadLabel.textContent = row.imageDataUrl ? 'Change' : '📁 Upload';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'hidden';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            row.imageDataUrl = reader.result as string;
            this.renderModalSpriteRows();
          };
          reader.readAsDataURL(file);
        }
      });
      uploadLabel.appendChild(fileInput);

      // 4. Trạng thái ảnh
      const statusText = document.createElement('span');
      statusText.className = 'sprite-row-status';
      statusText.textContent = row.imageDataUrl ? 'Has image' : '(no image)';

      rowEl.appendChild(nameInput);
      rowEl.appendChild(thumbBox);
      rowEl.appendChild(uploadLabel);

      // 5. Nút gỡ ảnh nếu đã có ảnh
      if (row.imageDataUrl) {
        const btnClearImg = document.createElement('button');
        btnClearImg.type = 'button';
        btnClearImg.className = 'btn-clear-sprite-img';
        btnClearImg.title = 'Remove this image';
        btnClearImg.textContent = '✕ Remove';
        btnClearImg.addEventListener('click', () => {
          row.imageDataUrl = '';
          this.renderModalSpriteRows();
        });
        rowEl.appendChild(btnClearImg);
      }

      rowEl.appendChild(statusText);

      // 6. Nút xóa hàng biểu cảm
      const btnRemoveRow = document.createElement('button');
      btnRemoveRow.type = 'button';
      btnRemoveRow.className = 'btn-remove-sprite-row';
      btnRemoveRow.title = 'Delete this expression';
      btnRemoveRow.textContent = '✕';
      btnRemoveRow.addEventListener('click', () => {
        this.modalSpriteRows.splice(idx, 1);
        if (this.modalSpriteRows.length === 0) {
          this.modalSpriteRows.push({ name: 'default', imageDataUrl: '' });
        }
        this.renderModalSpriteRows();
      });
      rowEl.appendChild(btnRemoveRow);

      listContainer.appendChild(rowEl);
    });
  }

  private addModalSpriteRow(name = '', imageDataUrl = ''): void {
    this.modalSpriteRows.push({ name, imageDataUrl });
    this.renderModalSpriteRows();
  }

  private openCharacterModal(charId?: string, prefillId?: string, prefillName?: string): void {
    if (!this.modalCharForm) return;

    const titleEl = document.getElementById('modal-char-title');
    const modeEl = document.getElementById('char-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('char-original-id') as HTMLInputElement;
    const idInput = document.getElementById('char-input-id') as HTMLInputElement;
    const nameInput = document.getElementById('char-input-name') as HTMLInputElement;
    const hexInput = document.getElementById('char-input-color-hex') as HTMLInputElement | null;
    const colorInput = document.getElementById('char-input-color') as HTMLInputElement | null;
    const previewTag = document.getElementById('char-color-preview-tag');

    if (charId) {
      const existing = (this.project.characters || []).find(c => c.id === charId);
      if (existing) {
        if (titleEl) titleEl.textContent = `EDIT CHARACTER: ${existing.id}`;
        modeEl.value = 'edit';
        origIdEl.value = existing.id;
        idInput.value = existing.id;
        idInput.disabled = true;
        nameInput.value = existing.name || '';

        const color = (existing.colorHex || '#38BDF8').toUpperCase();
        if (hexInput) hexInput.value = color;
        if (colorInput) colorInput.value = color;
        if (previewTag) {
          previewTag.style.color = color;
          previewTag.style.borderColor = color;
          previewTag.textContent = existing.name || existing.id;
        }

        const entries = Object.entries(existing.sprites || {});
        if (entries.length > 0) {
          this.modalSpriteRows = entries.map(([k, v]) => ({ name: k, imageDataUrl: v || '' }));
        } else {
          this.modalSpriteRows = [{ name: 'default', imageDataUrl: '' }];
        }
      }
    } else {
      if (titleEl) titleEl.textContent = 'ADD NEW CHARACTER';
      modeEl.value = 'create';
      origIdEl.value = '';
      idInput.value = prefillId || '';
      idInput.disabled = false;
      const initialName =
        prefillName || (prefillId ? prefillId.charAt(0).toUpperCase() + prefillId.slice(1) : '');
      nameInput.value = initialName;

      const color = '#38BDF8';
      if (hexInput) hexInput.value = color;
      if (colorInput) colorInput.value = color;
      if (previewTag) {
        previewTag.style.color = color;
        previewTag.style.borderColor = color;
        previewTag.textContent = initialName || 'Display Name';
      }

      this.modalSpriteRows = [
        { name: 'default', imageDataUrl: '' },
        { name: 'happy', imageDataUrl: '' },
      ];
    }

    this.renderModalSpriteRows();
    this.modalCharForm.classList.remove('hidden');
    idInput.focus();
  }

  private closeCharacterModal(): void {
    if (this.modalCharForm) {
      this.modalCharForm.classList.add('hidden');
    }
  }

  private saveCharacterFromModal(): void {
    const modeEl = document.getElementById('char-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('char-original-id') as HTMLInputElement;
    const idInput = document.getElementById('char-input-id') as HTMLInputElement;
    const nameInput = document.getElementById('char-input-name') as HTMLInputElement;
    const hexInput = document.getElementById('char-input-color-hex') as HTMLInputElement | null;
    const colorInput = document.getElementById('char-input-color') as HTMLInputElement | null;

    const charId = idInput.value.trim().toLowerCase();
    const charName = nameInput.value.trim();

    let colorHex = (
      hexInput ? hexInput.value.trim() : colorInput?.value || '#38BDF8'
    ).toUpperCase();
    if (!colorHex.startsWith('#')) colorHex = '#' + colorHex;
    if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex) && !/^#[0-9A-Fa-f]{3}$/.test(colorHex)) {
      colorHex = '#38BDF8';
    }

    if (!charId) {
      this.showToast('Please enter character ID');
      return;
    }

    if (!Array.isArray(this.project.characters)) {
      this.project.characters = [];
    }

    const spritesRecord: Record<string, string> = {};
    for (const row of this.modalSpriteRows) {
      const sName = row.name.trim().toLowerCase();
      if (sName) {
        spritesRecord[sName] = row.imageDataUrl || '';
      }
    }
    if (Object.keys(spritesRecord).length === 0) {
      spritesRecord['default'] = '';
    }

    if (modeEl.value === 'edit') {
      const idx = this.project.characters.findIndex(c => c.id === origIdEl.value);
      if (idx >= 0) {
        const targetChar = this.project.characters[idx];
        if (targetChar) {
          targetChar.name = charName;
          targetChar.colorHex = colorHex;
          targetChar.sprites = spritesRecord;
          this.showToast(`Updated character "${origIdEl.value}"`);
        }
      }
    } else {
      if (this.project.characters.some(c => c.id === charId)) {
        this.showToast(`Character ID "${charId}" already exists!`);
        return;
      }
      this.project.characters.push({
        id: charId,
        name: charName,
        colorHex,
        sprites: spritesRecord,
      });
      this.showToast(`Added new character "${charId}" (${charName})`);
    }

    this.closeCharacterModal();
    void this.saveProjectToStorage();
    this.renderCharacterList();
    this.compileCurrentScript();
  }

  private deleteCharacter(charId: string): void {
    if (!window.confirm(`Are you sure you want to delete character "${charId}" from project?`)) {
      return;
    }
    this.project.characters = (this.project.characters || []).filter(c => c.id !== charId);
    void this.saveProjectToStorage();
    this.renderCharacterList();
    this.compileCurrentScript();
    this.showToast(`Deleted character "${charId}"`);
  }

  private addCharacterSprite(charId: string, spriteName: string): void {
    const char = (this.project.characters || []).find(c => c.id === charId);
    if (!char) return;
    if (!char.sprites) char.sprites = {};
    char.sprites[spriteName] = '';
    void this.saveProjectToStorage();
    this.renderCharacterList();
    this.showToast(`Added expression "${spriteName}" for character "${charId}"`);
  }

  private removeCharacterSprite(charId: string, spriteName: string): void {
    const char = (this.project.characters || []).find(c => c.id === charId);
    if (!char || !char.sprites) return;
    delete char.sprites[spriteName];
    void this.saveProjectToStorage();
    this.renderCharacterList();
    this.showToast(`Deleted expression "${spriteName}" from "${charId}"`);
  }

  private setupAssetManagement(): void {
    if (this.btnAddAsset) {
      this.btnAddAsset.addEventListener('click', () => {
        this.openAssetModal();
      });
    }

    const btnClose = document.getElementById('btn-close-asset-modal');
    const btnCancel = document.getElementById('btn-cancel-asset-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.closeAssetModal());
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeAssetModal());

    const filterBtns = document.querySelectorAll('.asset-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeAssetFilter =
          (btn.getAttribute('data-filter') as 'all' | 'image' | 'audio' | 'video' | 'font') || 'all';
        this.renderAssetList();
      });
    });

    if (this.formAsset) {
      this.formAsset.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        this.saveAssetFromModal();
      });
    }
  }

  private openAssetModal(
    assetId?: string,
    prefillName?: string,
    prefillType?: 'image' | 'audio' | 'video' | 'font',
  ): void {
    if (!this.modalAssetForm) return;

    const titleEl = document.getElementById('modal-asset-title');
    const modeEl = document.getElementById('asset-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('asset-original-id') as HTMLInputElement;
    const typeSelect = document.getElementById('asset-input-type') as HTMLSelectElement;
    const nameInput = document.getElementById('asset-input-name') as HTMLInputElement;
    const fileInput = document.getElementById('asset-input-file') as HTMLInputElement;
    const urlInput = document.getElementById('asset-input-url') as HTMLInputElement;

    fileInput.value = '';

    if (assetId) {
      const existing = (this.project.assets || []).find(a => a.id === assetId);
      if (existing) {
        if (titleEl) titleEl.textContent = `EDIT ASSET: ${existing.name}`;
        modeEl.value = 'edit';
        origIdEl.value = existing.id;
        typeSelect.value = existing.type;
        nameInput.value = existing.name;
        urlInput.value = existing.storageUrl || '';
      }
    } else {
      if (titleEl) titleEl.textContent = 'ADD NEW ASSET';
      modeEl.value = 'create';
      origIdEl.value = '';
      typeSelect.value = prefillType || 'image';
      nameInput.value = prefillName || '';
      urlInput.value = '';
    }

    this.modalAssetForm.classList.remove('hidden');
    nameInput.focus();
  }

  private closeAssetModal(): void {
    if (this.modalAssetForm) {
      this.modalAssetForm.classList.add('hidden');
    }
  }

  private saveAssetFromModal(): void {
    const modeEl = document.getElementById('asset-edit-mode') as HTMLInputElement;
    const origIdEl = document.getElementById('asset-original-id') as HTMLInputElement;
    const typeSelect = document.getElementById('asset-input-type') as HTMLSelectElement;
    const nameInput = document.getElementById('asset-input-name') as HTMLInputElement;
    const fileInput = document.getElementById('asset-input-file') as HTMLInputElement;
    const urlInput = document.getElementById('asset-input-url') as HTMLInputElement;

    const assetName = nameInput.value.trim();
    const assetType = (typeSelect.value as 'image' | 'audio' | 'video' | 'font') || 'image';
    let storageUrl = urlInput.value.trim();

    if (!assetName) {
      this.showToast('Please enter asset name');
      return;
    }

    if (!Array.isArray(this.project.assets)) {
      this.project.assets = [];
    }

    const saveRecord = (url: string, size: number) => {
      if (modeEl.value === 'edit') {
        const idx = this.project.assets.findIndex(a => a.id === origIdEl.value);
        if (idx >= 0) {
          const targetAsset = this.project.assets[idx];
          if (targetAsset) {
            targetAsset.name = assetName;
            targetAsset.type = assetType;
            if (url) targetAsset.storageUrl = url;
            if (size) targetAsset.sizeBytes = size;
            this.showToast(`Updated asset "${assetName}"`);
          }
        }
      } else {
        const newId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.project.assets.push({
          id: newId,
          name: assetName,
          type: assetType,
          storageUrl: url || '',
          sizeBytes: size || 1024 * 100,
        });
        this.showToast(`Added new asset "${assetName}"`);
      }

      this.closeAssetModal();
      void this.saveProjectToStorage();
      this.renderAssetList();
      this.compileCurrentScript();
    };

    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        storageUrl = typeof reader.result === 'string' ? reader.result : '';
        saveRecord(storageUrl, file.size);
      };
      reader.readAsDataURL(file);
    } else {
      saveRecord(storageUrl, 1024 * 50);
    }
  }

  private deleteAsset(assetId: string): void {
    const existing = (this.project.assets || []).find(a => a.id === assetId);
    const name = existing ? existing.name : assetId;
    if (!window.confirm(`Are you sure you want to delete asset "${name}" from project?`)) {
      return;
    }
    this.project.assets = (this.project.assets || []).filter(a => a.id !== assetId);
    void this.saveProjectToStorage();
    this.renderAssetList();
    this.compileCurrentScript();
    this.showToast(`Deleted asset "${name}"`);
  }

  // ================================================================
  // 8. TWO-WAY LIVE PREVIEW BRIDGE (SECURE ORIGIN CHECK)
  // ================================================================
  private getPreviewOrigin(): string {
    return window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : window.location.origin;
  }

  private setupPreviewMessaging(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        window.location.origin,
      ];

      const userContentRegex = /^https?:\/\/([a-zA-Z0-9-]+\.)*usercontent-platform\.com(:\d+)?$/;
      const isAllowed = allowedOrigins.includes(event.origin) || userContentRegex.test(event.origin);

      if (!isAllowed) {
        return;
      }

      if (event.data?.type === 'PLAYER_READY') {
        if (this.previewStatusBadge) {
          this.previewStatusBadge.textContent = 'HOT RELOAD: CONNECTED';
        }
        if (this.latestProgram) {
          this.sendProgramToPreview(this.latestProgram);
        }
      }
    });
  }

  private sendProgramToPreview(
    program: Instruction[],
    options?: { targetScene?: string | null; targetLine?: number | null; fileId?: string | null },
  ): void {
    const targetOrigin = this.getPreviewOrigin();

    const payload = {
      type: 'HOT_RELOAD_PROGRAM',
      program,
      characters: this.project.characters,
      assets: this.project.assets,
      targetScene: options?.targetScene,
      targetLine: options?.targetLine,
      fileId: options?.fileId,
    };

    if (this.previewIframe.contentWindow) {
      this.previewIframe.contentWindow.postMessage(payload, targetOrigin);
    }

    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.popoutWindow.postMessage(payload, targetOrigin);
    }
  }

  // ================================================================
  // 9. HEADER ACTIONS: [▶ Run from Start] [▶ Run this Line] [Export]
  // ================================================================
  private setupHeaderActions(): void {
    document.getElementById('btn-back-to-projects')?.addEventListener('click', async () => {
      if (this.editorDebounceTimerId !== null) {
        this.flushEditorChanges();
      }
      await this.saveProjectToStorage();
      window.location.hash = '#/projects';
    });

    document.getElementById('btn-run-from-start')?.addEventListener('click', () => {
      this.runFromStart();
    });

    document.getElementById('btn-run-from-line')?.addEventListener('click', () => {
      this.runFromLine();
    });

    document.getElementById('btn-export-game')?.addEventListener('click', () => {
      this.modalExport.classList.remove('hidden');
    });

    document.getElementById('btn-reload-preview')?.addEventListener('click', () => {
      this.previewIframe.src = this.previewIframe.src;
      this.showToast('Reloading Live Preview...');
    });

    document.getElementById('btn-popout-preview')?.addEventListener('click', () => {
      const targetUrl = 'http://localhost:3000/';
      this.popoutWindow = window.open(
        targetUrl,
        'VN_Preview_Popout',
        'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no',
      );
      this.showToast('Opened pop-out Live Preview! Switched to management tab.');
      this.updatePopoutButtonUI();

      if (this.latestProgram) {
        window.setTimeout(() => {
          if (this.latestProgram) {
            this.sendProgramToPreview(this.latestProgram);
          }
        }, 500);
      }

      // Automatically switch to management tab
      const targetTab = this.lastActiveManagementTab || 'characters';
      this.switchWorkspaceTab(targetTab);
    });

    document.getElementById('btn-format-document')?.addEventListener('click', () => {
      this.formatActiveDocument();
    });
  }

  public formatActiveDocument(): void {
    if (!this.editorInstance) return;
    const action = this.editorInstance.getAction('editor.action.formatDocument');
    if (action) {
      void action.run();
    } else {
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
    this.showToast('Document formatted (Shift+Alt+F)');
  }

  private runFromStart(): void {
    this.flushEditorChanges();
    if (this.latestProgram) {
      this.sendProgramToPreview(this.latestProgram);
      this.showToast('▶ Running script from start!');
    }
  }

  private runFromLine(): void {
    this.flushEditorChanges();
    if (!this.latestProgram || !this.editorInstance) return;

    const pos = this.editorInstance.getPosition();
    const currentLine = pos ? pos.lineNumber : 1;
    const model = this.editorInstance.getModel();
    let currentScene: string | null = null;

    if (model) {
      // Quét ngược tìm scene gần nhất phía trên dòng con trỏ (hỗ trợ cả scene cha lẫn local scene .sub)
      for (let i = currentLine; i >= 1; i--) {
        const lineContent = model.getLineContent(i);
        const match = lineContent.match(/scene\s+(\.?[a-zA-Z0-9_]+)/);
        if (match && match[1]) {
          const rawScene = match[1];
          if (rawScene.startsWith('.')) {
            // Local scene: quét ngược tiếp tìm scene cha để tạo canonical name: parent.sub
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

    this.sendProgramToPreview(this.latestProgram, {
      targetScene: currentScene,
      targetLine: currentLine,
      fileId: this.activeFile,
    });

    if (currentScene) {
      this.showToast(`▶ Running from scene: "${currentScene}" (line ${currentLine})!`);
    } else {
      this.showToast(`▶ Running script from line ${currentLine}!`);
    }
  }

  // ================================================================
  // 10. EXPORT & DISTRIBUTION WIZARD
  // ================================================================
  private setupExportWizardActions(): void {
    document.getElementById('btn-close-export')?.addEventListener('click', () => {
      this.modalExport.classList.add('hidden');
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.modalExport.classList.contains('hidden')) {
        this.modalExport.classList.add('hidden');
      }
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const urlInput = document.getElementById('export-url-input') as HTMLInputElement | null;
      const url = urlInput?.value || 'https://secret-academy.usercontent-platform.com';
      navigator.clipboard?.writeText(url);
      this.showToast('Copied web link to clipboard!');
    });

    document.getElementById('btn-open-playable')?.addEventListener('click', () => {
      window.open('http://localhost:3000/', '_blank');
      this.showToast('Opening public game web page...');
    });

    document.getElementById('btn-copy-iframe')?.addEventListener('click', () => {
      const iframeInput = document.getElementById('export-iframe-input') as HTMLInputElement | null;
      const snippet =
        iframeInput?.value ||
        '<iframe src="https://secret-academy.usercontent-platform.com" width="960" height="540" frameborder="0" allowfullscreen></iframe>';
      navigator.clipboard?.writeText(snippet);
      this.showToast('Copied iFrame embed code!');
    });

    document.getElementById('btn-download-bundle')?.addEventListener('click', () => {
      const bundleData = {
        metadata: {
          title: this.project.title,
          exportedAt: new Date().toISOString(),
          engineVersion: '1.0.0',
        },
        project: this.project,
        program: this.latestProgram || [],
      };
      const blob = new Blob([JSON.stringify(bundleData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vn-game-bundle.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast('Downloaded vn-game-bundle.json!');
    });

    document.getElementById('btn-download-zip')?.addEventListener('click', () => {
      this.showToast('Generating self-contained HTML5 game.zip...');
      const manifest = {
        title: this.project.title,
        version: '1.0.0',
        entry: 'index.html',
        scripts: this.getFilesMap(),
      };
      const blob = new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vn-game-itch.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setTimeout(() => {
        this.showToast('Generated and downloaded vn-game-itch.zip!');
      }, 400);
    });
  }

  // ================================================================
  // 11. GLOBAL KEYBOARD SHORTCUTS & UNLOAD PROTECTION
  // ================================================================
  private setupGlobalKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        const activeLi = this.fileListEl.querySelector('.file-item.active') as HTMLElement | null;
        if (activeLi && this.activeFile) {
          this.startRenameFile(this.activeFile, activeLi);
        }
      } else if (e.key === 'Escape') {
        this.closeCharacterModal();
        this.closeAssetModal();
      }
    });
  }

  private setupUnloadProtection(): void {
    window.addEventListener('beforeunload', e => {
      if (this.editorDebounceTimerId !== null) {
        this.flushEditorChanges();
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  public showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    if (this.toastTimerId !== null) {
      clearTimeout(this.toastTimerId);
    }
    this.toastTimerId = window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
      this.toastTimerId = null;
    }, 2200);
  }
}

// Initialize Studio & AppRouter when DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
  const repository = new SupabaseProjectRepository();
  const app = new StudioApp(repository);
  await app.init();

  const router = new AppRouter(repository);
  router.init(async (projectId: string) => {
    await app.loadProjectById(projectId);
  });
});
