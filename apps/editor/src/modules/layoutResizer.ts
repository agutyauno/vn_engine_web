// ================================================================
// VN ENGINE STUDIO - LAYOUT RESIZER & SHELL ACTIONS MODULE
// Quản lý thanh kéo chia giao diện, chuyển tab sidebar, rename project & shortcuts
// ================================================================

import type { StudioContext } from './editorTypes';

export class LayoutResizer {
  private context: StudioContext;
  private projectTitleEl: HTMLElement;
  private previewIframe: HTMLIFrameElement;
  private lastActiveManagementTab: string = 'characters';

  private onRenameFileRequested?: () => void;
  private onCloseModalsRequested?: () => void;

  constructor(
    context: StudioContext,
    callbacks?: {
      onRenameFileRequested?: () => void;
      onCloseModalsRequested?: () => void;
    },
  ) {
    this.context = context;
    this.projectTitleEl = document.getElementById('project-title')!;
    this.previewIframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    this.onRenameFileRequested = callbacks?.onRenameFileRequested;
    this.onCloseModalsRequested = callbacks?.onCloseModalsRequested;

    this.setupProjectTitleRename();
    this.setupResizeHandles();
    this.setupSidebarTabs();
    this.setupGlobalKeyboardShortcuts();
    this.setupUnloadProtection();
  }

  private setupProjectTitleRename(): void {
    this.projectTitleEl?.addEventListener('click', () => {
      const project = this.context.getProject();
      const newTitle = window.prompt('Enter new project title:', project.title);
      if (newTitle && newTitle.trim()) {
        project.title = newTitle.trim();
        this.projectTitleEl.textContent = project.title;
        void this.context.saveProjectToStorage();
        this.context.showToast(`Project renamed: "${project.title}"`);
      }
    });
  }

  private setupResizeHandles(): void {
    const sidebarHandle = document.getElementById('sidebar-resize-handle');
    const workspace = document.getElementById('studio-workspace');

    // THANH KÉO DỌC: ĐIỀU CHỈNH ĐỘ RỘNG CODE EDITOR BÊN TRÁI (LEFT / RIGHT)
    if (sidebarHandle && workspace) {
      sidebarHandle.addEventListener('mousedown', e => {
        e.preventDefault();
        sidebarHandle.classList.add('dragging');
        if (this.previewIframe) {
          this.previewIframe.style.pointerEvents = 'none';
        }

        const onMouseMove = (moveEvent: MouseEvent) => {
          const workspaceRect = workspace.getBoundingClientRect();
          const newWidth = Math.max(
            300,
            Math.min(workspaceRect.width - 320, moveEvent.clientX - workspaceRect.left),
          );
          document.documentElement.style.setProperty('--editor-width', `${newWidth}px`);
          document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
          this.context.getEditorInstance()?.layout();
        };

        const onMouseUp = () => {
          sidebarHandle.classList.remove('dragging');
          if (this.previewIframe) {
            this.previewIframe.style.pointerEvents = 'auto';
          }
          this.context.getEditorInstance()?.layout();
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
          this.context.getEditorInstance()?.layout();
        };

        const onMouseUp = () => {
          drawerHandle.classList.remove('dragging');
          this.context.getEditorInstance()?.layout();
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
        this.context.getEditorInstance()?.layout();
      });
      resizeObserver.observe(monacoContainer);
    }
  }

  public switchWorkspaceTab(tabId: string): void {
    const tabs = document.querySelectorAll<HTMLButtonElement>('.workspace-tab, .sidebar-tab');
    const panes = document.querySelectorAll<HTMLElement>('.workspace-pane, .sidebar-pane');

    if (tabId !== 'preview') {
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
  }

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
        if (this.onRenameFileRequested) {
          this.onRenameFileRequested();
        }
      } else if (e.key === 'Escape') {
        if (this.onCloseModalsRequested) {
          this.onCloseModalsRequested();
        }
      }
    });
  }

  public getLastActiveManagementTab(): string {
    return this.lastActiveManagementTab;
  }

  private setupUnloadProtection(): void {
    window.addEventListener('beforeunload', () => {
      this.context.flushEditorChanges();
    });
  }
}
