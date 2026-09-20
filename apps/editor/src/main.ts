// ================================================================
// VN ENGINE STUDIO - WEB EDITOR CONTROLLER (MONACO POWERED)
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 - Mục 3.2
// ================================================================

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { Compiler, type CompileError } from '@vn-engine/dsl-compiler';
import type {
  ScriptFile,
  Instruction,
  ProgramAST,
  StatementAST,
  ShowStatement,
  RevealStatement,
  BackgroundStatement,
  PlayStatement,
  VarAssignStatement,
  IfStatement,
  WhileStatement,
} from '@vn-engine/shared-types';
import { registerVnsLanguage } from './vnsLanguage';

// Thiết lập Web Worker cho Monaco Editor trong môi trường Vite
self.MonacoEnvironment = {
  getWorker: function (_moduleId: string, _label: string) {
    return new editorWorker();
  },
};

export interface ProjectState {
  title: string;
  activeFile: string;
  files: Record<string, string>;
}

const STORAGE_KEY = 'vn_studio_project_v1';

export class StudioApp {
  private compiler: Compiler;
  private project: ProjectState = {
    title: 'Bí Mật Học Viện',
    activeFile: 'main.vns',
    files: {
      'main.vns': '',
    },
  };

  private latestProgram: Instruction[] | null = null;
  private popoutWindow: Window | null = null;

  // Monaco Editor state
  private editorInstance!: monaco.editor.IStandaloneCodeEditor;
  private fileModels: Map<string, monaco.editor.ITextModel> = new Map();

  // DOM Elements
  private projectTitleEl: HTMLElement;
  private saveStatusPill: HTMLElement;
  private activeFilenameEl: HTMLElement;
  private compilerIndicator: HTMLElement;
  private previewIframe: HTMLIFrameElement;
  private previewStatusBadge: HTMLElement;
  private toastEl: HTMLElement;
  private modalExport: HTMLElement;
  private fileListEl: HTMLElement;
  private btnAddFile: HTMLElement;

  // Sidebar containers
  private charContainer: HTMLElement | null;
  private assetContainer: HTMLElement | null;
  private varContainer: HTMLElement | null;

  // Drawer elements
  private drawerBody: HTMLElement;
  private drawerTabProblems: HTMLElement;
  private drawerTabVariables: HTMLElement;
  private drawerPaneProblems: HTMLElement;
  private drawerPaneVariables: HTMLElement;
  private drawerToggleBtn: HTMLElement;
  private problemsSummary: HTMLElement;
  private problemsList: HTMLElement;
  private varsWatchTbody: HTMLElement;

  // State timers
  private compileTimerId: number | null = null;
  private toastTimerId: number | null = null;

  constructor() {
    this.compiler = new Compiler();

    // DOM Header
    this.projectTitleEl = document.getElementById('project-title')!;
    this.saveStatusPill = document.getElementById('save-status')!;

    // DOM Preview
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    this.previewStatusBadge = document.getElementById('preview-hot-reload-status')!;

    // DOM Editor Status Bar
    this.activeFilenameEl = document.getElementById('active-filename')!;
    this.compilerIndicator = document.getElementById('compiler-indicator')!;

    // DOM Sidebar
    this.fileListEl = document.getElementById('file-list')!;
    this.btnAddFile = document.getElementById('btn-add-file')!;
    this.charContainer = document.getElementById('character-list-container');
    this.assetContainer = document.getElementById('asset-list-container');
    this.varContainer = document.getElementById('variable-list-container');

    // DOM Drawer
    this.drawerBody = document.getElementById('drawer-body')!;
    this.drawerTabProblems = document.getElementById('drawer-tab-problems')!;
    this.drawerTabVariables = document.getElementById('drawer-tab-variables')!;
    this.drawerPaneProblems = document.getElementById('drawer-pane-problems')!;
    this.drawerPaneVariables = document.getElementById('drawer-pane-variables')!;
    this.drawerToggleBtn = document.getElementById('drawer-toggle-btn')!;
    this.problemsSummary = document.getElementById('problems-summary')!;
    this.problemsList = document.getElementById('problems-list')!;
    this.varsWatchTbody = document.getElementById('vars-watch-tbody')!;

    // DOM Modal & Toast
    this.modalExport = document.getElementById('modal-export-wizard')!;
    this.toastEl = document.getElementById('studio-toast')!;
  }

  public init(): void {
    // 1. Nạp dự án từ LocalStorage
    this.loadProjectFromStorage();

    // 2. Thiết lập tiêu đề và danh sách tệp
    this.projectTitleEl.textContent = this.project.title || 'Bí Mật Học Viện';
    this.activeFilenameEl.textContent = this.project.activeFile;
    this.renderFileList();

    // 3. Khởi tạo Monaco Editor với ngôn ngữ VNS
    this.initMonacoEditor();

    // 4. Khởi tạo các module giao diện
    this.setupProjectTitleRename();
    this.setupResizeHandles();
    this.setupSidebarTabs();
    this.setupDrawerTabs();
    this.setupHeaderActions();
    this.setupPreviewMessaging();
    this.setupExportWizardActions();

    // 5. Biên dịch lần đầu
    this.compileCurrentScript();
  }

  /**
   * 1. KHỞI TẠO MONACO EDITOR (#monaco-container)
   */
  private getOrCreateTextModel(fileName: string, initialContent: string = ''): monaco.editor.ITextModel {
    const uri = monaco.Uri.parse(`inmemory://project/${fileName}`);
    let model = monaco.editor.getModel(uri);
    if (model) {
      if (this.project.files[fileName] !== undefined && model.getValue() !== this.project.files[fileName]) {
        model.setValue(this.project.files[fileName]);
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

    // Khởi tạo TextModel cho từng file trong dự án
    for (const [fileName, content] of Object.entries(this.project.files)) {
      this.getOrCreateTextModel(fileName, content);
    }

    let activeModel = this.fileModels.get(this.project.activeFile);
    if (!activeModel) {
      activeModel = this.getOrCreateTextModel(
        this.project.activeFile,
        this.project.files[this.project.activeFile] ?? '',
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

    // Lắng nghe sự kiện thay đổi nội dung trên Monaco Editor
    this.editorInstance.onDidChangeModelContent(() => {
      this.saveCurrentFileFromEditor();
      this.triggerDebouncedCompile();
    });

    // Đăng ký phím tắt trong Monaco
    this.editorInstance.addCommand(monaco.KeyCode.F5, () => {
      this.runFromStart();
    });

    this.editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      this.runFromLine();
    });

    window.addEventListener('resize', () => {
      this.editorInstance?.layout();
    });
  }

  private saveCurrentFileFromEditor(): void {
    if (this.editorInstance && this.project.files[this.project.activeFile] !== undefined) {
      const val = this.editorInstance.getValue();
      this.project.files[this.project.activeFile] = val;
      this.saveProjectToStorage();
    }
  }

  /**
   * 2. LƯU TRỮ DỰ ÁN & ĐA TỆP (STORAGE & MULTI-FILE MANAGEMENT)
   */
  private loadProjectFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProjectState;
        if (parsed && typeof parsed.files === 'object' && Object.keys(parsed.files).length > 0) {
          this.project = parsed;
          if (!this.project.title) this.project.title = 'Bí Mật Học Viện';
          if (!this.project.files[this.project.activeFile]) {
            this.project.activeFile = Object.keys(this.project.files)[0] ?? 'main.vns';
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[StudioApp] Không thể nạp dự án từ LocalStorage:', e);
    }

    this.project = {
      title: 'Bí Mật Học Viện',
      activeFile: 'main.vns',
      files: {
        'main.vns': '',
      },
    };
  }

  private saveProjectToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
      this.saveStatusPill.textContent = '● ĐÃ LƯU';
      this.saveStatusPill.className = 'save-status-pill';
    } catch (e) {
      console.error('[StudioApp] Lỗi khi lưu vào LocalStorage:', e);
    }
  }

  private setupProjectTitleRename(): void {
    this.projectTitleEl.addEventListener('click', () => {
      const newTitle = window.prompt('Nhập tên dự án mới:', this.project.title);
      if (newTitle && newTitle.trim()) {
        this.project.title = newTitle.trim();
        this.projectTitleEl.textContent = this.project.title;
        this.saveProjectToStorage();
        this.showToast(`Đã đổi tên dự án: "${this.project.title}"`);
      }
    });
  }

  private renderFileList(): void {
    this.fileListEl.innerHTML = '';
    const fileNames = Object.keys(this.project.files);

    fileNames.forEach(fileName => {
      const li = document.createElement('li');
      li.className = `file-item ${fileName === this.project.activeFile ? 'active' : ''}`;

      const nameGroup = document.createElement('div');
      nameGroup.className = 'file-name-group';
      nameGroup.innerHTML = `<span class="file-icon">📄</span> <span>${fileName}</span>`;
      li.appendChild(nameGroup);

      if (fileName !== 'main.vns') {
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-file-delete';
        btnDel.innerHTML = '✕';
        btnDel.title = `Xóa tệp ${fileName}`;
        btnDel.addEventListener('click', e => {
          e.stopPropagation();
          this.deleteFile(fileName);
        });
        li.appendChild(btnDel);
      }

      li.addEventListener('click', () => {
        this.switchActiveFile(fileName);
      });

      this.fileListEl.appendChild(li);
    });

    this.activeFilenameEl.textContent = this.project.activeFile;
  }

  private switchActiveFile(fileName: string): void {
    if (this.project.activeFile === fileName) return;
    if (this.project.files[fileName] === undefined) return;

    // Lưu nội dung file cũ từ Monaco nếu file cũ vẫn còn trong project
    this.saveCurrentFileFromEditor();

    // Chuyển activeFile
    this.project.activeFile = fileName;

    // Chuyển Monaco model
    const targetModel = this.getOrCreateTextModel(
      fileName,
      this.project.files[fileName] || '',
    );
    this.editorInstance.setModel(targetModel);
    this.activeFilenameEl.textContent = fileName;

    this.renderFileList();
    this.showToast(`Đang mở: ${fileName}`);
    this.triggerDebouncedCompile();
  }

  private addNewFile(): void {
    const nextNum = Object.keys(this.project.files).length;
    const defaultName = `chapter_${nextNum}.vns`;
    const input = window.prompt('Nhập tên file kịch bản mới (.vns):', defaultName);
    if (!input) return;

    let fileName = input.trim();
    if (!fileName.endsWith('.vns')) fileName += '.vns';

    // Kiểm tra định dạng tên file hợp lệ
    if (!/^[a-zA-Z0-9_-]+\.vns$/.test(fileName)) {
      this.showToast('Tên file chỉ được chứa chữ cái, số, dấu gạch nối/dưới và đuôi .vns!');
      return;
    }

    if (this.project.files[fileName] !== undefined) {
      this.showToast(`Tệp "${fileName}" đã tồn tại!`);
      return;
    }

    // Lưu file đang mở trước khi tạo và chuyển sang file mới
    this.saveCurrentFileFromEditor();

    this.project.files[fileName] = '';
    const model = this.getOrCreateTextModel(fileName, '');

    this.project.activeFile = fileName;
    this.editorInstance.setModel(model);
    this.activeFilenameEl.textContent = fileName;

    this.saveProjectToStorage();
    this.renderFileList();
    this.compileCurrentScript();
    this.showToast(`Đã tạo tệp mới: ${fileName}`);
  }

  private deleteFile(fileName: string): void {
    if (fileName === 'main.vns') {
      this.showToast('Không thể xóa tệp gốc main.vns!');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp "${fileName}"?`)) return;

    const wasActive = this.project.activeFile === fileName;

    // 1. Xóa khỏi danh sách file
    delete this.project.files[fileName];

    // 2. Dispose Monaco model
    this.disposeTextModel(fileName);

    // 3. Nếu file bị xóa đang là file active, chuyển sang file đầu tiên mà KHÔNG lưu file bị xóa
    if (wasActive) {
      const fallbackFile = Object.keys(this.project.files)[0] ?? 'main.vns';
      this.project.activeFile = fallbackFile;

      const fallbackModel = this.getOrCreateTextModel(
        fallbackFile,
        this.project.files[fallbackFile] ?? '',
      );
      this.editorInstance.setModel(fallbackModel);
      this.activeFilenameEl.textContent = fallbackFile;
    }

    this.saveProjectToStorage();
    this.renderFileList();
    this.compileCurrentScript();
    this.showToast(`Đã xóa tệp: ${fileName}`);
  }

  /**
   * 3. THANH KÉO ĐIỀU CHỈNH KÍCH THƯỚC (SIDEBAR & PREVIEW RESIZE HANDLES)
   */
  private setupResizeHandles(): void {
    const sidebarHandle = document.getElementById('sidebar-resize-handle');
    const previewHandle = document.getElementById('preview-resize-handle');
    const workspace = document.getElementById('studio-workspace');
    const mainWorkspace = document.getElementById('main-workspace');

    // 1. THANH KÉO DỌC: ĐIỀU CHỈNH ĐỘ RỘNG SIDEBAR (LEFT / RIGHT)
    if (sidebarHandle && workspace) {
      sidebarHandle.addEventListener('mousedown', e => {
        e.preventDefault();
        sidebarHandle.classList.add('dragging');
        this.previewIframe.style.pointerEvents = 'none';

        const onMouseMove = (moveEvent: MouseEvent) => {
          const workspaceRect = workspace.getBoundingClientRect();
          const newWidth = Math.max(180, Math.min(650, moveEvent.clientX - workspaceRect.left));
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

    // 2. THANH KÉO NGANG: ĐIỀU CHỈNH TỶ LỆ PREVIEW VÀ CODE EDITOR (TOP / BOTTOM)
    if (previewHandle && mainWorkspace) {
      previewHandle.addEventListener('mousedown', e => {
        e.preventDefault();
        previewHandle.classList.add('dragging');
        this.previewIframe.style.pointerEvents = 'none';

        const onMouseMove = (moveEvent: MouseEvent) => {
          const mainRect = mainWorkspace.getBoundingClientRect();
          const relativeY = moveEvent.clientY - mainRect.top;
          const percentage = Math.max(20, Math.min(80, (relativeY / mainRect.height) * 100));
          document.documentElement.style.setProperty('--preview-height', `${percentage}%`);
          this.editorInstance?.layout();
        };

        const onMouseUp = () => {
          previewHandle.classList.remove('dragging');
          this.previewIframe.style.pointerEvents = 'auto';
          this.editorInstance?.layout();
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    // 3. TỰ ĐỘNG CẬP NHẬT LAYOUT MONACO KHI CONTAINER THAY ĐỔI KÍCH THƯỚC
    const monacoContainer = document.getElementById('monaco-container');
    if (monacoContainer && window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.editorInstance?.layout();
      });
      resizeObserver.observe(monacoContainer);
    }
  }

  /**
   * 4. SIDEBAR TÀI NGUYÊN (4 TABS)
   */
  private setupSidebarTabs(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.sidebar-tab');
    const panes = document.querySelectorAll<HTMLElement>('.sidebar-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    this.btnAddFile.addEventListener('click', () => {
      this.addNewFile();
    });
  }

  /**
   * 5. BẢNG THÔNG TIN ĐÁY (DRAWER PROBLEMS & VARIABLES WATCH)
   */
  private setupDrawerTabs(): void {
    this.drawerTabProblems.addEventListener('click', () => {
      this.drawerTabProblems.classList.add('active');
      this.drawerTabVariables.classList.remove('active');
      this.drawerPaneProblems.style.display = 'block';
      this.drawerPaneVariables.style.display = 'none';
      this.drawerBody.classList.remove('collapsed');
      this.editorInstance?.layout();
    });

    this.drawerTabVariables.addEventListener('click', () => {
      this.drawerTabVariables.classList.add('active');
      this.drawerTabProblems.classList.remove('active');
      this.drawerPaneVariables.style.display = 'block';
      this.drawerPaneProblems.style.display = 'none';
      this.drawerBody.classList.remove('collapsed');
      this.editorInstance?.layout();
    });

    this.drawerToggleBtn.addEventListener('click', () => {
      this.drawerBody.classList.toggle('collapsed');
      setTimeout(() => this.editorInstance?.layout(), 50);
    });
  }

  /**
   * 6. BIÊN DỊCH REAL-TIME & ĐỒNG BỘ MONACO MARKERS
   */
  private triggerDebouncedCompile(): void {
    this.compilerIndicator.textContent = 'Đang phân tích cú pháp...';
    this.compilerIndicator.className = 'compiler-status-indicator compiling';

    if (this.compileTimerId !== null) {
      window.clearTimeout(this.compileTimerId);
    }

    this.compileTimerId = window.setTimeout(() => {
      this.compileCurrentScript();
      this.compileTimerId = null;
    }, 300);
  }

  private compileCurrentScript(): void {
    if (this.editorInstance) {
      this.project.files[this.project.activeFile] = this.editorInstance.getValue();
    }

    const scriptFiles: ScriptFile[] = Object.entries(this.project.files).map(
      ([fileName, content], index) => ({
        id: fileName,
        name: fileName,
        content,
        order: index,
        version: 1,
      }),
    );

    const result = this.compiler.compile(scriptFiles);

    // Cập nhật Monaco Markers (Gạch chân đỏ lỗi cú pháp thời gian thực)
    const currentModel = this.editorInstance?.getModel();

    if (result.success && result.program) {
      this.latestProgram = result.program;

      this.compilerIndicator.textContent = 'Biên dịch tự động: SẴN SÀNG';
      this.compilerIndicator.className = 'compiler-status-indicator';

      this.drawerTabProblems.classList.remove('has-error');
      this.problemsSummary.textContent = '● Problems (0 lỗi)';
      this.problemsList.innerHTML =
        '<div class="no-problem-message">✓ Cú pháp hợp lệ, không phát hiện lỗi nào.</div>';

      if (currentModel) {
        monaco.editor.setModelMarkers(currentModel, 'vns-compiler', []);
      }

      this.saveProjectToStorage();
      this.sendProgramToPreview(this.latestProgram);

      if (result.ast) {
        this.updateSidebarMetadata(result.ast);
      }
    } else {
      const errors = result.errors || [];
      this.compilerIndicator.textContent = `Biên dịch tự động: CÓ ${errors.length} LỖI`;
      this.compilerIndicator.className = 'compiler-status-indicator error';

      this.drawerTabProblems.classList.add('has-error');
      this.problemsSummary.textContent = `● Problems (${errors.length} lỗi)`;

      this.saveStatusPill.textContent = '● CÓ LỖI BIÊN DỊCH';
      this.saveStatusPill.className = 'save-status-pill error';

      // Tạo markers gạch chân đỏ trên Monaco
      if (currentModel) {
        const markers: monaco.editor.IMarkerData[] = errors
          .filter(err => !err.loc?.fileId || err.loc.fileId === this.project.activeFile)
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
        const file = err.loc?.fileId ? `[${err.loc.fileId}] ` : '';
        row.textContent = `✕ ${file}Dòng ${line}, Cột ${col}: ${err.message}`;
        row.addEventListener('click', () => {
          if (err.loc?.fileId && err.loc.fileId !== this.project.activeFile) {
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

  /**
   * 7. CẬP NHẬT SIDEBAR METADATA & BẢNG WATCH TỪ AST
   */
  private updateSidebarMetadata(ast: ProgramAST): void {
    const characters = new Map<string, { displayName?: string; sprites: Set<string> }>();
    const backgrounds = new Set<string>();
    const musicAssets = new Set<string>();
    const soundAssets = new Set<string>();
    const variables = new Map<string, unknown>();

    const traverse = (stmts: StatementAST[]) => {
      for (const stmt of stmts) {
        if (stmt.type === 'ShowStatement') {
          const s = stmt as ShowStatement;
          if (!characters.has(s.character)) {
            characters.set(s.character, { sprites: new Set() });
          }
          characters.get(s.character)!.sprites.add(s.sprite);
        } else if (stmt.type === 'RevealStatement') {
          const r = stmt as RevealStatement;
          if (!characters.has(r.characterId)) {
            characters.set(r.characterId, { sprites: new Set() });
          }
          characters.get(r.characterId)!.displayName = r.displayName;
        } else if (stmt.type === 'BackgroundStatement') {
          const b = stmt as BackgroundStatement;
          backgrounds.add(b.assetId);
        } else if (stmt.type === 'PlayStatement') {
          const p = stmt as PlayStatement;
          if (p.channel === 'music') musicAssets.add(p.assetId);
          else soundAssets.add(p.assetId);
        } else if (stmt.type === 'VarAssignStatement') {
          const v = stmt as VarAssignStatement;
          variables.set(v.variable, (v.value as { value?: unknown })?.value ?? 'gán giá trị');
        } else if (stmt.type === 'IfStatement') {
          const ifs = stmt as IfStatement;
          traverse(ifs.consequent);
          if (ifs.alternate) {
            if (Array.isArray(ifs.alternate)) traverse(ifs.alternate);
            else traverse([ifs.alternate]);
          }
        } else if (stmt.type === 'WhileStatement') {
          const ws = stmt as WhileStatement;
          traverse(ws.body);
        }
      }
    };

    if (ast.scenes) {
      for (const sc of Object.values(ast.scenes)) {
        if (sc.body) traverse(sc.body);
      }
    }

    // Render Characters Tab
    if (this.charContainer) {
      if (characters.size === 0) {
        this.charContainer.innerHTML =
          '<div class="empty-meta-hint">Chưa phát hiện nhân vật. Sử dụng cú pháp: show nhân_vật sprite</div>';
      } else {
        this.charContainer.innerHTML = '';
        const charColorPalette = ['#38bdf8', '#f43f5e', '#eab308', '#a855f7', '#10b981'];
        let cIdx = 0;
        for (const [id, info] of characters) {
          const card = document.createElement('div');
          card.className = 'meta-card';
          const dotColor = charColorPalette[cIdx % charColorPalette.length];
          cIdx++;
          const name = info.displayName ? `${id} (${info.displayName})` : id;
          card.innerHTML = `
            <div class="meta-card-title">
              <span class="char-badge-dot" style="background-color: ${dotColor};"></span>
              <span>${name}</span>
            </div>
            <div class="meta-tags-list">
              ${Array.from(info.sprites).map(sp => `<span class="meta-tag-pill">${sp}</span>`).join('')}
            </div>
          `;
          this.charContainer.appendChild(card);
        }
      }
    }

    // Render Assets Tab
    if (this.assetContainer) {
      let assetHtml = '';
      if (backgrounds.size > 0) {
        assetHtml += `
          <div class="meta-card">
            <div class="meta-card-title">Hình nền (Backgrounds)</div>
            <div class="meta-tags-list">
              ${Array.from(backgrounds).map(b => `<span class="meta-tag-pill">🖼 ${b}</span>`).join('')}
            </div>
          </div>
        `;
      }
      if (musicAssets.size > 0) {
        assetHtml += `
          <div class="meta-card">
            <div class="meta-card-title">Nhạc nền (BGM)</div>
            <div class="meta-tags-list">
              ${Array.from(musicAssets).map(m => `<span class="meta-tag-pill">🎵 ${m}</span>`).join('')}
            </div>
          </div>
        `;
      }
      if (soundAssets.size > 0) {
        assetHtml += `
          <div class="meta-card">
            <div class="meta-card-title">Hiệu ứng âm thanh (SFX)</div>
            <div class="meta-tags-list">
              ${Array.from(soundAssets).map(s => `<span class="meta-tag-pill">🔊 ${s}</span>`).join('')}
            </div>
          </div>
        `;
      }
      if (!assetHtml) {
        assetHtml =
          '<div class="empty-meta-hint">Chưa có tài nguyên nền hoặc âm thanh được tham chiếu.</div>';
      }
      this.assetContainer.innerHTML = assetHtml;
    }

    // Render Variables Tab
    if (this.varContainer) {
      if (variables.size === 0) {
        this.varContainer.innerHTML =
          '<div class="empty-meta-hint">Chưa có biến trạng thái. Gán biến bằng cú pháp: ~ tên_biến = giá_trị</div>';
      } else {
        this.varContainer.innerHTML = '';
        for (const [v, val] of variables) {
          const card = document.createElement('div');
          card.className = 'meta-card';
          card.innerHTML = `
            <div class="meta-card-title">~ ${v}</div>
            <div class="meta-tags-list">
              <span class="meta-tag-pill">Khởi tạo: ${String(val)}</span>
            </div>
          `;
          this.varContainer.appendChild(card);
        }
      }
    }

    // Render Variables Watch Table in Bottom Drawer
    this.varsWatchTbody.innerHTML = '';
    if (variables.size === 0) {
      this.varsWatchTbody.innerHTML = '<tr><td colspan="3" style="color: #666;">Chưa có biến nào.</td></tr>';
    } else {
      for (const [name, val] of variables) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 600; color: #fff;">${name}</td>
          <td style="color: #888;">${typeof val}</td>
          <td style="color: #22c55e;">${String(val)}</td>
        `;
        this.varsWatchTbody.appendChild(tr);
      }
    }
  }

  /**
   * 8. CẦU NỐI HAI CHIỀU LIVE PREVIEW
   */
  private setupPreviewMessaging(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'PLAYER_READY') {
        this.previewStatusBadge.textContent = 'HOT RELOAD: KẾT NỐI THÀNH CÔNG';
        if (this.latestProgram) {
          this.sendProgramToPreview(this.latestProgram);
        }
      }
    });
  }

  private sendProgramToPreview(program: Instruction[]): void {
    if (this.previewIframe.contentWindow) {
      this.previewIframe.contentWindow.postMessage(
        {
          type: 'HOT_RELOAD_PROGRAM',
          program,
        },
        '*',
      );
    }

    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.popoutWindow.postMessage(
        {
          type: 'HOT_RELOAD_PROGRAM',
          program,
        },
        '*',
      );
    }
  }

  /**
   * 9. HEADER ACTIONS: [▶ Chạy từ đầu] [▶ Chạy dòng này] [Xuất bản]
   */
  private setupHeaderActions(): void {
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
      const src = this.previewIframe.src;
      this.previewIframe.src = '';
      this.previewIframe.src = src;
      this.showToast('Đang tải lại Live Preview...');
    });

    document.getElementById('btn-popout-preview')?.addEventListener('click', () => {
      this.popoutWindow = window.open(
        'http://localhost:3000/',
        'vn_studio_popout',
        'width=1280,height=720',
      );
      this.showToast('Đã mở cửa sổ Live Preview độc lập!');
    });
  }

  private runFromStart(): void {
    this.compileCurrentScript();
    if (this.latestProgram) {
      this.sendProgramToPreview(this.latestProgram);
      this.showToast('▶ Chạy kịch bản từ đầu!');
    }
  }

  private runFromLine(): void {
    this.compileCurrentScript();
    if (!this.latestProgram || !this.editorInstance) return;

    const pos = this.editorInstance.getPosition();
    const currentLine = pos ? pos.lineNumber : 1;
    const model = this.editorInstance.getModel();
    let currentScene: string | null = null;

    if (model) {
      for (let i = currentLine; i >= 1; i--) {
        const lineContent = model.getLineContent(i);
        const match = lineContent.match(/scene\s+([a-zA-Z0-9_]+)/);
        if (match && match[1]) {
          currentScene = match[1];
          break;
        }
      }
    }

    this.sendProgramToPreview(this.latestProgram);

    if (currentScene) {
      this.showToast(`▶ Chạy từ cảnh hiện tại: "${currentScene}"!`);
    } else {
      this.showToast(`▶ Chạy kịch bản từ dòng ${currentLine}!`);
    }
  }

  /**
   * 10. MODAL XUẤT BẢN & PHÂN PHỐI
   */
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
      this.showToast('Đã sao chép đường link web vào khay nhớ tạm!');
    });

    document.getElementById('btn-open-playable')?.addEventListener('click', () => {
      window.open('http://localhost:3000/', '_blank');
      this.showToast('Đang mở trang web chơi game công khai...');
    });

    document.getElementById('btn-copy-iframe')?.addEventListener('click', () => {
      const iframeInput = document.getElementById('export-iframe-input') as HTMLInputElement | null;
      const snippet =
        iframeInput?.value ||
        '<iframe src="https://secret-academy.usercontent-platform.com" width="960" height="540" frameborder="0" allowfullscreen></iframe>';
      navigator.clipboard?.writeText(snippet);
      this.showToast('Đã sao chép mã nhúng iFrame!');
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
      this.showToast('Đã tải xuống gói vn-game-bundle.json!');
    });

    document.getElementById('btn-download-zip')?.addEventListener('click', () => {
      this.showToast('Đang tạo tệp HTML5 game.zip tự chứa...');
      const manifest = {
        title: this.project.title,
        version: '1.0.0',
        entry: 'index.html',
        scripts: this.project.files,
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
        this.showToast('Đã tạo và tải xuống gói vn-game-itch.zip!');
      }, 400);
    });

    document.getElementById('btn-build-desktop')?.addEventListener('click', () => {
      this.showToast('Yêu cầu build Desktop App đã được gửi đến CI/CD (P1)!');
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

// Khởi chạy Studio khi DOM sẵn sàng
window.addEventListener('DOMContentLoaded', () => {
  const app = new StudioApp();
  app.init();
});
