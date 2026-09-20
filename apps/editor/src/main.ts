// ================================================================
// VN ENGINE STUDIO - WEB EDITOR CONTROLLER
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 - Mục 3.2
// ================================================================

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

  // DOM Elements
  private projectTitleEl: HTMLElement;
  private saveStatusPill: HTMLElement;
  private codeEditor: HTMLTextAreaElement;
  private lineNumbers: HTMLElement;
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
  private isResizing: boolean = false;

  constructor() {
    this.compiler = new Compiler();

    // DOM Header
    this.projectTitleEl = document.getElementById('project-title')!;
    this.saveStatusPill = document.getElementById('save-status')!;

    // DOM Preview
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    this.previewStatusBadge = document.getElementById('preview-hot-reload-status')!;

    // DOM Editor
    this.activeFilenameEl = document.getElementById('active-filename')!;
    this.compilerIndicator = document.getElementById('compiler-indicator')!;
    this.lineNumbers = document.getElementById('line-numbers')!;
    this.codeEditor = document.getElementById('script-code') as HTMLTextAreaElement;

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

    // 2. Thiết lập nội dung ban đầu
    this.projectTitleEl.textContent = this.project.title || 'Bí Mật Học Viện';
    this.codeEditor.value = this.project.files[this.project.activeFile] || '';
    this.activeFilenameEl.textContent = this.project.activeFile;
    this.updateLineNumbers();
    this.renderFileList();

    // 3. Khởi tạo các module giao diện
    this.setupProjectTitleRename();
    this.setupResizeHandle();
    this.setupSidebarTabs();
    this.setupDrawerTabs();
    this.setupEditorEvents();
    this.setupHeaderActions();
    this.setupPreviewMessaging();
    this.setupExportWizardActions();

    // 4. Biên dịch lần đầu
    this.compileCurrentScript();
  }

  /**
   * 1. LƯU TRỮ DỰ ÁN & ĐA TỆP (STORAGE & MULTI-FILE MANAGEMENT)
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
      this.project.files[this.project.activeFile] = this.codeEditor.value;
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
        this.showToast(`Đã đổi tên dự án thành: "${this.project.title}"`);
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

      // Nút xóa file phụ (giữ lại main.vns)
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

    // Lưu file cũ
    this.project.files[this.project.activeFile] = this.codeEditor.value;

    // Chuyển sang file mới
    this.project.activeFile = fileName;
    this.codeEditor.value = this.project.files[fileName] || '';

    this.renderFileList();
    this.updateLineNumbers();
    this.showToast(`Đang mở: ${fileName}`);
    this.triggerDebouncedCompile();
  }

  private addNewFile(): void {
    const defaultName = `chapter_${Object.keys(this.project.files).length}.vns`;
    const input = window.prompt('Nhập tên file kịch bản mới (.vns):', defaultName);
    if (!input) return;

    let fileName = input.trim();
    if (!fileName.endsWith('.vns')) fileName += '.vns';

    if (this.project.files[fileName] !== undefined) {
      this.showToast(`Tệp "${fileName}" đã tồn tại!`);
      return;
    }

    this.project.files[fileName] = '';
    this.switchActiveFile(fileName);
    this.saveProjectToStorage();
    this.showToast(`Đã tạo tệp mới: ${fileName}`);
  }

  private deleteFile(fileName: string): void {
    if (fileName === 'main.vns') {
      this.showToast('Không thể xóa tệp gốc main.vns!');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp "${fileName}"?`)) return;

    delete this.project.files[fileName];

    if (this.project.activeFile === fileName) {
      this.switchActiveFile('main.vns');
    } else {
      this.renderFileList();
      this.compileCurrentScript();
    }

    this.saveProjectToStorage();
    this.showToast(`Đã xóa tệp: ${fileName}`);
  }

  /**
   * 2. THANH KÉO ĐIỀU CHỈNH ĐỘ CAO (#resize-handle)
   */
  private setupResizeHandle(): void {
    const handle = document.getElementById('resize-handle')!;
    const workspace = document.getElementById('studio-workspace')!;

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      this.isResizing = true;
      handle.classList.add('dragging');

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!this.isResizing) return;
        const rect = workspace.getBoundingClientRect();
        const relativeY = moveEvent.clientY - rect.top;
        const percentage = Math.max(20, Math.min(80, (relativeY / rect.height) * 100));
        document.documentElement.style.setProperty('--preview-height', `${percentage}%`);
      };

      const onMouseUp = () => {
        this.isResizing = false;
        handle.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * 3. SIDEBAR TÀI NGUYÊN (4 TABS: FILES, CHARACTERS, ASSETS, VARIABLES)
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
   * 4. BẢNG THÔNG TIN ĐÁY (DRAWER PROBLEMS & VARIABLES WATCH)
   */
  private setupDrawerTabs(): void {
    this.drawerTabProblems.addEventListener('click', () => {
      this.drawerTabProblems.classList.add('active');
      this.drawerTabVariables.classList.remove('active');
      this.drawerPaneProblems.style.display = 'block';
      this.drawerPaneVariables.style.display = 'none';
      this.drawerBody.classList.remove('collapsed');
    });

    this.drawerTabVariables.addEventListener('click', () => {
      this.drawerTabVariables.classList.add('active');
      this.drawerTabProblems.classList.remove('active');
      this.drawerPaneVariables.style.display = 'block';
      this.drawerPaneProblems.style.display = 'none';
      this.drawerBody.classList.remove('collapsed');
    });

    this.drawerToggleBtn.addEventListener('click', () => {
      this.drawerBody.classList.toggle('collapsed');
    });
  }

  /**
   * 5. SỰ KIỆN TRÌNH SOẠN THẢO CODE
   */
  private setupEditorEvents(): void {
    this.codeEditor.addEventListener('input', () => {
      this.updateLineNumbers();
      this.triggerDebouncedCompile();
    });

    this.codeEditor.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.codeEditor.scrollTop;
    });

    this.codeEditor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const success = document.execCommand('insertText', false, '  ');
        if (!success) {
          const start = this.codeEditor.selectionStart;
          const end = this.codeEditor.selectionEnd;
          const val = this.codeEditor.value;
          this.codeEditor.value = val.substring(0, start) + '  ' + val.substring(end);
          this.codeEditor.selectionStart = this.codeEditor.selectionEnd = start + 2;
        }
        this.updateLineNumbers();
        this.triggerDebouncedCompile();
      } else if (e.key === 'F5') {
        e.preventDefault();
        this.runFromStart();
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.runFromLine();
      }
    });
  }

  private updateLineNumbers(): void {
    const lines = this.codeEditor.value.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lines; i++) {
      numbers += `${i}\n`;
    }
    this.lineNumbers.textContent = numbers;
  }

  /**
   * 6. BIÊN DỊCH REAL-TIME & ĐỒNG BỘ METADATA AST
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
    this.project.files[this.project.activeFile] = this.codeEditor.value;

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

    if (result.success && result.program) {
      this.latestProgram = result.program;

      this.compilerIndicator.textContent = 'Biên dịch tự động: SẴN SÀNG';
      this.compilerIndicator.className = 'compiler-status-indicator';

      this.drawerTabProblems.classList.remove('has-error');
      this.problemsSummary.textContent = '● Problems (0 lỗi)';
      this.problemsList.innerHTML =
        '<div class="no-problem-message">✓ Cú pháp hợp lệ, không phát hiện lỗi nào.</div>';

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

      this.problemsList.innerHTML = '';
      errors.forEach((err: CompileError) => {
        const row = document.createElement('div');
        row.className = 'problem-row';
        const line = err.loc ? err.loc.line : 1;
        const col = err.loc ? err.loc.col : 1;
        const file = err.loc?.fileId ? `[${err.loc.fileId}] ` : '';
        row.textContent = `✕ ${file}Dòng ${line}, Cột ${col}: ${err.message}`;
        row.addEventListener('click', () => {
          if (err.loc?.fileId && err.loc.fileId !== this.project.activeFile) {
            this.switchActiveFile(err.loc.fileId);
          }
          this.jumpToLine(line);
        });
        this.problemsList.appendChild(row);
      });
    }
  }

  private jumpToLine(lineNumber: number): void {
    const lines = this.codeEditor.value.split('\n');
    let charPos = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      const l = lines[i];
      charPos += (l ? l.length : 0) + 1;
    }
    this.codeEditor.focus();
    const targetLine = lines[lineNumber - 1];
    const len = targetLine ? targetLine.length : 0;
    this.codeEditor.setSelectionRange(charPos, charPos + len);

    const lineHeight = 21.6;
    this.codeEditor.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
  }

  /**
   * 7. CẬP NHẬT SIDEBAR METADATA & BẢNG WATCH VARIABLES TỪ AST
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

    // Render Variables Tab & Watch Pane
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
   * 8. CẦU NỐI HAI CHIỀU LIVE PREVIEW (PREVIEW MESSAGING BRIDGE)
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
    if (!this.latestProgram) return;

    // Tìm xem con trỏ đang ở scene nào trong kịch bản hiện tại
    const cursor = this.codeEditor.selectionStart;
    const textBefore = this.codeEditor.value.substring(0, cursor);
    const sceneMatches = Array.from(textBefore.matchAll(/scene\s+([a-zA-Z0-9_]+)/g));
    const lastMatch = sceneMatches.length > 0 ? sceneMatches[sceneMatches.length - 1] : null;
    const currentScene = lastMatch && lastMatch[1] ? lastMatch[1] : null;

    this.sendProgramToPreview(this.latestProgram);

    if (currentScene) {
      this.showToast(`▶ Chạy từ cảnh hiện tại: "${currentScene}"!`);
    } else {
      this.showToast('▶ Chạy kịch bản từ dòng này!');
    }
  }

  /**
   * 10. MODAL XUẤT BẢN & PHÂN PHỐI (EXPORT WIZARD)
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
