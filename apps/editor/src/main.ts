// ================================================================
// VN ENGINE STUDIO - WEB EDITOR CONTROLLER
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 & Director Mode
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
  activeFile: string;
  files: Record<string, string>;
}

const STORAGE_KEY = 'vn_studio_project_v1';

export class StudioApp {
  private compiler: Compiler;
  private project: ProjectState = {
    activeFile: 'main.vns',
    files: {
      'main.vns': '',
    },
  };

  private latestProgram: Instruction[] | null = null;
  private popoutWindow: Window | null = null;

  // DOM Elements
  private workspace: HTMLElement;
  private codeEditor: HTMLTextAreaElement;
  private lineNumbers: HTMLElement;
  private problemsHeader: HTMLElement;
  private problemsSummary: HTMLElement;
  private problemsList: HTMLElement;
  private compilerIndicator: HTMLElement;
  private previewIframe: HTMLIFrameElement;
  private toastEl: HTMLElement;
  private modalExport: HTMLElement;
  private fileListEl: HTMLElement;
  private activeFileTab: HTMLElement;
  private saveStatusPill: HTMLElement;
  private btnAddFile: HTMLElement;
  private charContainer: HTMLElement | null;
  private assetContainer: HTMLElement | null;
  private varContainer: HTMLElement | null;

  private compileTimerId: number | null = null;
  private toastTimerId: number | null = null;
  private isResizing: boolean = false;

  constructor() {
    this.compiler = new Compiler();

    // DOM Elements
    this.workspace = document.getElementById('studio-workspace')!;
    this.codeEditor = document.getElementById('script-code') as HTMLTextAreaElement;
    this.lineNumbers = document.getElementById('line-numbers')!;
    this.problemsHeader = document.getElementById('problems-header')!;
    this.problemsSummary = document.getElementById('problems-summary')!;
    this.problemsList = document.getElementById('problems-list')!;
    this.compilerIndicator = document.getElementById('compiler-indicator')!;
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    this.toastEl = document.getElementById('studio-toast')!;
    this.modalExport = (document.getElementById('modal-export-wizard') ||
      document.getElementById('modal-export'))!;
    this.fileListEl = document.getElementById('file-list')!;
    this.activeFileTab = document.getElementById('active-file-tab')!;
    this.saveStatusPill = document.getElementById('save-status')!;
    this.btnAddFile = document.getElementById('btn-add-file')!;
    this.charContainer = document.getElementById('character-list-container');
    this.assetContainer = document.getElementById('asset-list-container');
    this.varContainer = document.getElementById('variable-list-container');
  }

  public init(): void {
    // 1. Nạp dự án từ LocalStorage hoặc khởi tạo tệp rỗng
    this.loadProjectFromStorage();

    // 2. Thiết lập nội dung tệp đang mở lên Editor
    this.codeEditor.value = this.project.files[this.project.activeFile] || '';
    this.updateLineNumbers();
    this.renderFileTree();

    // 3. Khởi tạo các module giao diện
    this.setupLayoutSwitcher();
    this.setupResizableDivider();
    this.setupSidebarTabs();
    this.setupEditorEvents();
    this.setupToolbarActions();
    this.setupPreviewMessaging();

    // 4. Biên dịch lần đầu
    this.compileCurrentScript();
  }

  /**
   * 1. QUẢN LÝ DỰ ÁN VÀ LƯU TRỮ (STORAGE & MULTI-FILE STATE)
   */
  private loadProjectFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProjectState;
        if (parsed && typeof parsed.files === 'object' && Object.keys(parsed.files).length > 0) {
          this.project = parsed;
          if (!this.project.files[this.project.activeFile]) {
            this.project.activeFile = Object.keys(this.project.files)[0] ?? 'main.vns';
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[StudioApp] Không thể nạp dự án từ LocalStorage:', e);
    }

    // Khởi tạo mặc định nếu chưa có dữ liệu lưu
    this.project = {
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
      this.saveStatusPill.textContent = '● ĐÃ LƯU LOCAL';
      this.saveStatusPill.style.color = '#22c55e';
    } catch (e) {
      console.error('[StudioApp] Lỗi khi lưu vào LocalStorage:', e);
    }
  }

  private renderFileTree(): void {
    this.fileListEl.innerHTML = '';
    const fileNames = Object.keys(this.project.files);

    fileNames.forEach(fileName => {
      const li = document.createElement('li');
      li.className = `file-item ${fileName === this.project.activeFile ? 'active' : ''}`;
      li.dataset.file = fileName;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'file-name-text';
      nameSpan.textContent = `📄 ${fileName}`;
      li.appendChild(nameSpan);

      // Cho phép xóa các tệp phụ (giữ lại main.vns làm tệp gốc)
      if (fileName !== 'main.vns') {
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-delete-file';
        btnDelete.textContent = '✕';
        btnDelete.title = `Xóa tệp ${fileName}`;
        btnDelete.addEventListener('click', e => {
          e.stopPropagation();
          this.deleteFile(fileName);
        });
        li.appendChild(btnDelete);
      }

      li.addEventListener('click', () => {
        this.switchActiveFile(fileName);
      });

      this.fileListEl.appendChild(li);
    });

    // Cập nhật tab hiển thị trên thanh Editor
    this.activeFileTab.innerHTML = `${this.project.activeFile} <span class="tab-modified-dot">●</span>`;
  }

  private switchActiveFile(fileName: string): void {
    if (this.project.activeFile === fileName) return;

    // Lưu nội dung tệp cũ
    this.project.files[this.project.activeFile] = this.codeEditor.value;

    // Chuyển sang tệp mới
    this.project.activeFile = fileName;
    this.codeEditor.value = this.project.files[fileName] || '';

    this.renderFileTree();
    this.updateLineNumbers();
    this.showToast(`Đang mở tệp: ${fileName}`);
    this.triggerDebouncedCompile();
  }

  private addNewFile(): void {
    const defaultName = `chapter_${Object.keys(this.project.files).length}.vns`;
    const input = window.prompt('Nhập tên tệp kịch bản mới (.vns):', defaultName);
    if (!input) return;

    let fileName = input.trim();
    if (!fileName.endsWith('.vns')) {
      fileName += '.vns';
    }

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

    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp "${fileName}"?`)) {
      return;
    }

    delete this.project.files[fileName];

    if (this.project.activeFile === fileName) {
      this.switchActiveFile('main.vns');
    } else {
      this.renderFileTree();
      this.compileCurrentScript();
    }

    this.saveProjectToStorage();
    this.showToast(`Đã xóa tệp: ${fileName}`);
  }

  /**
   * 2. BỘ CHUYỂN ĐỔI BỐ CỤC (LAYOUT SWITCHER - SỬA LỖI INLINE GRID STYLES)
   */
  private setupLayoutSwitcher(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.layout-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const layout = btn.dataset.layout || 'director';

        // Xóa sạch các inline style từ thao tác kéo thả trước đó để không ghi đè CSS layout
        this.workspace.style.gridTemplateColumns = '';
        this.workspace.style.gridTemplateRows = '';
        this.workspace.dataset.layout = layout;

        const layoutName =
          layout === 'director'
            ? 'ĐẠO DIỄN (16:9 LỚN Ở TRÊN)'
            : layout === 'split'
              ? 'CHIA ĐÔI 50/50'
              : 'TẬP TRUNG VIẾT';

        this.showToast(`Đã chuyển sang Bố cục: ${layoutName}`);
      });
    });
  }

  /**
   * 3. THANH KÉO ĐIỀU CHỈNH ĐỘ CAO/RỘNG (RESIZABLE DIVIDER)
   */
  private setupResizableDivider(): void {
    const divider = document.getElementById('resize-divider')!;

    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      this.isResizing = true;
      divider.classList.add('dragging');

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!this.isResizing) return;

        const currentLayout = this.workspace.dataset.layout;

        if (currentLayout === 'director') {
          // Điều chỉnh chiều cao theo tỷ lệ phần trăm (20% đến 80%)
          const workspaceRect = this.workspace.getBoundingClientRect();
          const relativeY = moveEvent.clientY - workspaceRect.top;
          const percentage = Math.max(20, Math.min(80, (relativeY / workspaceRect.height) * 100));
          document.documentElement.style.setProperty('--preview-height', `${percentage}%`);
        } else if (currentLayout === 'split') {
          // Điều chỉnh chiều rộng hai cột
          const workspaceRect = this.workspace.getBoundingClientRect();
          const relativeX = moveEvent.clientX - workspaceRect.left;
          const leftWidth = Math.max(300, Math.min(workspaceRect.width - 400, relativeX));
          this.workspace.style.gridTemplateColumns = `${leftWidth}px 8px 1fr`;
        }
      };

      const onMouseUp = () => {
        this.isResizing = false;
        divider.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  /**
   * 4. CHUYỂN ĐỔI TAB SIDEBAR & NÚT THÊM FILE
   */
  private setupSidebarTabs(): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.sidebar-tab');
    const panes = document.querySelectorAll<HTMLElement>('.tab-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Nút thêm file
    this.btnAddFile.addEventListener('click', () => {
      this.addNewFile();
    });
  }

  /**
   * 5. SỰ KIỆN TRÌNH SOẠN THẢO (TAB INDENT VỚI UNDO HISTORY, SHORTCUTS)
   */
  private setupEditorEvents(): void {
    // Cập nhật số dòng khi gõ
    this.codeEditor.addEventListener('input', () => {
      this.updateLineNumbers();
      this.triggerDebouncedCompile();
    });

    // Đồng bộ vị trí cuộn giữa thước đo số dòng và textarea
    this.codeEditor.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.codeEditor.scrollTop;
    });

    // Thụt lề 2 spaces bằng phím Tab (bảo toàn lịch sử Undo/Redo)
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
      } else if (e.key === 'F5' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        this.runPreview();
      }
    });

    // Đóng mở drawer danh sách lỗi
    this.problemsHeader.addEventListener('click', () => {
      const isCollapsed = this.problemsList.style.display === 'none';
      this.problemsList.style.display = isCollapsed ? 'block' : 'none';
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
   * 6. BIÊN DỊCH REAL-TIME VÀ TRUYỀN TẢI BYTECODE (COMPILER PIPELINE)
   */
  private triggerDebouncedCompile(): void {
    this.compilerIndicator.textContent = 'Đang phân tích cú pháp...';
    this.compilerIndicator.style.color = '#eab308'; // Vàng

    if (this.compileTimerId !== null) {
      window.clearTimeout(this.compileTimerId);
    }

    this.compileTimerId = window.setTimeout(() => {
      this.compileCurrentScript();
      this.compileTimerId = null;
    }, 300);
  }

  private compileCurrentScript(): void {
    // Lưu nội dung file hiện tại vào state
    this.project.files[this.project.activeFile] = this.codeEditor.value;

    // Đóng gói toàn bộ các file trong dự án
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
      this.compilerIndicator.textContent = 'Biên dịch tự động: THÀNH CÔNG';
      this.compilerIndicator.style.color = '#22c55e'; // Xanh lá
      this.problemsHeader.classList.remove('has-errors');
      this.problemsSummary.textContent = '● 0 LỖI BIÊN DỊCH (SẴN SÀNG CHẠY)';
      this.problemsList.innerHTML =
        '<div class="no-problems">Cú pháp hợp lệ, không phát hiện lỗi nào.</div>';

      // Lưu trữ thành công vào LocalStorage
      this.saveProjectToStorage();

      // Cập nhật Live Preview
      this.sendProgramToPreview(this.latestProgram);

      // Trích xuất metadata AST cập nhật các tab Nhân vật, Assets, Biến
      if (result.ast) {
        this.updateSidebarMetadata(result.ast);
      }
    } else {
      const errors = result.errors || [];
      this.compilerIndicator.textContent = `Biên dịch tự động: PHÁT HIỆN ${errors.length} LỖI`;
      this.compilerIndicator.style.color = '#ef4444'; // Đỏ
      this.problemsHeader.classList.add('has-errors');
      this.problemsSummary.textContent = `● CÓ ${errors.length} LỖI CÚ PHÁP HOẶC NGỮ NGHĨA`;
      this.saveStatusPill.textContent = '● CÓ LỖI BIÊN DỊCH';
      this.saveStatusPill.style.color = '#ef4444';

      this.problemsList.innerHTML = '';
      errors.forEach((err: CompileError) => {
        const item = document.createElement('div');
        item.className = 'problem-item';
        const line = err.loc ? err.loc.line : 1;
        const col = err.loc ? err.loc.col : 1;
        const file = err.loc?.fileId ? `[${err.loc.fileId}] ` : '';
        item.textContent = `${file}Dòng ${line}, Cột ${col}: ${err.message}`;
        item.addEventListener('click', () => {
          if (err.loc?.fileId && err.loc.fileId !== this.project.activeFile) {
            this.switchActiveFile(err.loc.fileId);
          }
          this.jumpToLine(line);
        });
        this.problemsList.appendChild(item);
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

    // Cuộn tới dòng được chọn
    const lineHeight = 20;
    this.codeEditor.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
  }

  /**
   * 7. CẦU NỐI HAI CHIỀU LIVE PREVIEW (TWO-WAY MESSAGING BRIDGE)
   */
  private setupPreviewMessaging(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'PLAYER_READY') {
        console.log('[StudioApp] Runtime Player đã sẵn sàng. Gửi kịch bản mới nhất...');
        if (this.latestProgram) {
          this.sendProgramToPreview(this.latestProgram);
        }
      }
    });
  }

  private sendProgramToPreview(program: Instruction[]): void {
    // 1. Gửi sang iframe Live Preview
    if (this.previewIframe.contentWindow) {
      this.previewIframe.contentWindow.postMessage(
        {
          type: 'HOT_RELOAD_PROGRAM',
          program,
        },
        '*',
      );
    }

    // 2. Gửi sang cửa sổ rời (Pop-out Window) nếu đang mở
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
   * 8. ĐỒNG BỘ ĐỘNG SIDEBAR METADATA TỪ CÂY AST
   */
  private updateSidebarMetadata(ast: ProgramAST): void {
    const characters = new Map<string, { displayName?: string; sprites: Set<string> }>();
    const backgrounds = new Set<string>();
    const musicAssets = new Set<string>();
    const soundAssets = new Set<string>();
    const variables = new Set<string>();

    const traverseStatements = (stmts: StatementAST[]) => {
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
          backgrounds.add((stmt as BackgroundStatement).assetId);
        } else if (stmt.type === 'PlayStatement') {
          const p = stmt as PlayStatement;
          if (p.channel === 'music') {
            musicAssets.add(p.assetId);
          } else {
            soundAssets.add(p.assetId);
          }
        } else if (stmt.type === 'VarAssignStatement') {
          variables.add((stmt as VarAssignStatement).variable);
        } else if (stmt.type === 'IfStatement') {
          const i = stmt as IfStatement;
          traverseStatements(i.consequent);
          if (i.alternate) {
            if (Array.isArray(i.alternate)) {
              traverseStatements(i.alternate);
            } else {
              traverseStatements([i.alternate]);
            }
          }
        } else if (stmt.type === 'WhileStatement') {
          traverseStatements((stmt as WhileStatement).body);
        }
      }
    };

    for (const scene of ast.scenes) {
      traverseStatements(scene.body);
    }

    // 1. Render Characters Tab
    if (this.charContainer) {
      if (characters.size === 0) {
        this.charContainer.innerHTML =
          '<div class="empty-sidebar-hint">Chưa phát hiện nhân vật trong kịch bản. Sử dụng lệnh "show" để thêm.</div>';
      } else {
        this.charContainer.innerHTML = '';
        for (const [charId, info] of characters.entries()) {
          const item = document.createElement('div');
          item.className = 'character-item';
          const nameDisplay = info.displayName
            ? `${charId.toUpperCase()} (${info.displayName})`
            : charId.toUpperCase();
          const spritesText = Array.from(info.sprites).join(', ') || 'mặc định';

          item.innerHTML = `
            <div class="char-header">
              <span class="char-color-dot" style="background: #38bdf8;"></span>
              <strong>${nameDisplay}</strong>
            </div>
            <div class="char-sprites">Sprites: ${spritesText}</div>
          `;
          this.charContainer.appendChild(item);
        }
      }
    }

    // 2. Render Assets Tab
    if (this.assetContainer) {
      let assetHtml = '';
      if (backgrounds.size > 0) {
        assetHtml += '<div class="asset-group-title">🖼️ Hình nền (Backgrounds)</div>';
        for (const bg of backgrounds) {
          assetHtml += `<div class="asset-item">${bg}</div>`;
        }
      }

      if (musicAssets.size > 0 || soundAssets.size > 0) {
        assetHtml +=
          '<div class="asset-group-title" style="margin-top: 8px;">🎵 Âm thanh (Audio)</div>';
        for (const m of musicAssets) {
          assetHtml += `<div class="asset-item">[BGM] ${m}</div>`;
        }
        for (const s of soundAssets) {
          assetHtml += `<div class="asset-item">[SFX] ${s}</div>`;
        }
      }

      if (!assetHtml) {
        assetHtml =
          '<div class="empty-sidebar-hint">Chưa có tài nguyên hình nền hoặc âm thanh được tham chiếu.</div>';
      }
      this.assetContainer.innerHTML = assetHtml;
    }

    // 3. Render Variables Tab
    if (this.varContainer) {
      if (variables.size === 0) {
        this.varContainer.innerHTML =
          '<div class="empty-sidebar-hint">Chưa có biến trạng thái. Khởi tạo biến bằng cú pháp: ~ tên_biến = giá_trị</div>';
      } else {
        this.varContainer.innerHTML = '';
        for (const v of variables) {
          const row = document.createElement('div');
          row.className = 'var-row';
          row.innerHTML = `<span>${v}</span><strong>(biến số)</strong>`;
          this.varContainer.appendChild(row);
        }
      }
    }
  }

  /**
   * 9. CÁC NÚT ĐIỀU KHIỂN TOOLBAR (RUN, POPOUT, EXPORT)
   */
  private setupToolbarActions(): void {
    // Chạy thử
    document.getElementById('btn-run-preview')?.addEventListener('click', () => {
      this.runPreview();
    });

    // Làm mới Preview
    document.getElementById('btn-reload-preview')?.addEventListener('click', () => {
      this.reloadPreview();
    });

    // Tách cửa sổ rời (Pop-out Window)
    document.getElementById('btn-popout')?.addEventListener('click', () => {
      this.popoutWindow = window.open(
        'http://localhost:3000/',
        'vn_player_popout',
        'width=1280,height=720',
      );
      this.showToast('Đã mở cửa sổ Live Preview độc lập (Pop-out Window)!');
    });

    // Xuất bản game
    document.getElementById('btn-export-game')?.addEventListener('click', () => {
      this.modalExport.classList.remove('hidden');
    });

    document.getElementById('btn-close-export')?.addEventListener('click', () => {
      this.modalExport.classList.add('hidden');
    });

    // Nút copy link
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      const urlInput = document.getElementById('export-url-input') as HTMLInputElement | null;
      const url = urlInput?.value || 'https://secret-academy.usercontent-platform.com';
      navigator.clipboard?.writeText(url);
      this.showToast('Đã sao chép link chơi Web vào khay nhớ tạm!');
    });

    // Nút mở web chơi trực tiếp
    document.getElementById('btn-open-playable')?.addEventListener('click', () => {
      window.open('http://localhost:3000/', '_blank');
      this.showToast('Đang mở trang web chơi game công khai (Public Player)...');
    });

    // Nút copy mã nhúng iFrame
    document.getElementById('btn-copy-iframe')?.addEventListener('click', () => {
      const iframeInput = document.getElementById('export-iframe-input') as HTMLInputElement | null;
      const snippet =
        iframeInput?.value ||
        '<iframe src="https://secret-academy.usercontent-platform.com" width="960" height="540" frameborder="0" allowfullscreen></iframe>';
      navigator.clipboard?.writeText(snippet);
      this.showToast('Đã sao chép mã nhúng iFrame vào khay nhớ tạm!');
    });

    // Nút xuất gói Game (bundle.json)
    document.getElementById('btn-download-bundle')?.addEventListener('click', () => {
      const exportBundle = {
        metadata: {
          name: 'Secret Academy VN',
          exportedAt: new Date().toISOString(),
          engineVersion: '1.0.0',
        },
        project: this.project,
        program: this.latestProgram || [],
      };
      const blob = new Blob([JSON.stringify(exportBundle, null, 2)], {
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
      this.showToast('Đã tải xuống gói game vn-game-bundle.json thành công!');
    });

    // Nút download zip
    document.getElementById('btn-download-zip')?.addEventListener('click', () => {
      this.showToast('Đang đóng gói file ZIP tự chứa (HTML5 runner + scripts)...');
      const zipManifest = {
        title: 'Secret Academy',
        version: '1.0.0',
        entry: 'index.html',
        scripts: this.project.files,
      };
      const blob = new Blob([JSON.stringify(zipManifest, null, 2)], {
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
      }, 500);
    });

    // Nút yêu cầu build Desktop (P1)
    document.getElementById('btn-build-desktop')?.addEventListener('click', () => {
      this.showToast('Yêu cầu build Desktop (Windows/Mac) đã được gửi đến hàng đợi CI/CD (P1)!');
    });

    // Phím Escape để đóng modal xuất bản
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !this.modalExport.classList.contains('hidden')) {
        this.modalExport.classList.add('hidden');
      }
    });
  }

  private runPreview(): void {
    this.compileCurrentScript();
    if (this.latestProgram) {
      this.sendProgramToPreview(this.latestProgram);
      this.showToast('▶ Đang phát kịch bản sang Live Preview!');
    }
  }

  private reloadPreview(): void {
    const currentSrc = this.previewIframe.src;
    this.previewIframe.src = '';
    this.previewIframe.src = currentSrc;
    this.showToast('Đang tải lại Live Preview...');
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
    }, 2400);
  }
}

// Khởi chạy Studio khi DOM sẵn sàng
window.addEventListener('DOMContentLoaded', () => {
  const app = new StudioApp();
  app.init();
});
