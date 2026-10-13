// ================================================================
// PROJECTS DASHBOARD VIEW (ADR-019, SAD 3.6, UI/UX Spec)
// Dedicated full-page project management portal
// ================================================================

import type { Project } from '@vn-engine/shared-types';
import type { IProjectRepository } from '../repository/projectRepository';
import { AuthService } from '../services/authService';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ProjectsPage {
  private container: HTMLElement;
  private repository: IProjectRepository;
  private authService: AuthService;
  private projects: Project[] = [];
  private projectToDelete: Project | null = null;

  constructor(container: HTMLElement, repository: IProjectRepository) {
    this.container = container;
    this.repository = repository;
    this.authService = AuthService.getInstance();
  }

  public async mount(): Promise<void> {
    await this.loadProjects();
    this.render();
  }

  private async loadProjects(): Promise<void> {
    try {
      this.projects = await this.repository.listProjects();
      if (this.projects.length === 0) {
        const seeded = await this.repository.seedDefaultProjectIfEmpty();
        this.projects = [seeded];
      }
    } catch (err) {
      console.error('[ProjectsPage] Error loading projects:', err);
      this.projects = [];
    }
  }

  public render(): void {
    const userLabel = this.authService.getCurrentUserLabel();
    const isGuest = this.authService.isGuest();

    this.container.innerHTML = `
      <div class="projects-page-wrapper">
        <!-- TOP NAVIGATION BAR -->
        <header class="projects-navbar">
          <div class="nav-left">
            <div class="studio-logo">VN-STUDIO</div>
            <span class="nav-portal-tag">PROJECT DASHBOARD</span>
          </div>

          <div class="nav-right">
            <div class="user-session-badge ${isGuest ? 'guest' : 'cloud'}">
              <span class="user-dot">●</span>
              <span class="user-label">${escapeHtml(userLabel)}</span>
            </div>
            <button class="wf-btn btn-sm btn-logout" id="btn-projects-signout" title="Sign out of studio">
              Sign Out
            </button>
          </div>
        </header>

        <!-- DASHBOARD HERO BANNER -->
        <main class="projects-content">
          <div class="projects-header-row">
            <div>
              <h1 class="projects-headline">Projects</h1>
              <p class="projects-subtext">Manage, create, and launch your visual novel interactive scripts</p>
            </div>
            <button class="wf-btn btn-primary btn-new-project" id="btn-open-create-modal">
              + New Project
            </button>
          </div>

          <!-- PROJECT CARDS GRID -->
          <div class="projects-grid" id="projects-grid">
            ${this.projects.map(p => this.renderProjectCard(p)).join('')}
          </div>
        </main>

        <!-- CREATE PROJECT MODAL -->
        <div class="modal-backdrop" id="modal-create-project" style="display: none;">
          <div class="modal-dialog">
            <div class="modal-header">
              <h2 class="modal-title">Create New Project</h2>
              <button class="modal-close-btn" id="btn-close-create-modal">✕</button>
            </div>
            <div class="modal-body">
              <label class="modal-label" for="new-project-title-input">Project Title</label>
              <input type="text" id="new-project-title-input" class="modal-input" placeholder="e.g. Mystery Manor" maxlength="60" />
            </div>
            <div class="modal-footer">
              <button class="wf-btn" id="btn-cancel-create">Cancel</button>
              <button class="wf-btn btn-primary" id="btn-confirm-create">Create Project</button>
            </div>
          </div>
        </div>

        <!-- DELETE PROJECT MODAL -->
        <div class="modal-backdrop" id="modal-delete-project" style="display: none;">
          <div class="modal-dialog">
            <div class="modal-header">
              <h2 class="modal-title">Delete Project</h2>
              <button class="modal-close-btn" id="btn-close-delete-modal">✕</button>
            </div>
            <div class="modal-body">
              <p class="modal-warning-text" id="delete-warning-text">
                Are you sure you want to delete this project? This action cannot be undone.
              </p>
            </div>
            <div class="modal-footer">
              <button class="wf-btn" id="btn-cancel-delete">Cancel</button>
              <button class="wf-btn btn-danger" id="btn-confirm-delete">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderProjectCard(project: Project): string {
    const isCloud =
      project.ownerId && project.ownerId !== 'local_guest' && project.ownerId !== 'local_user';
    const fileCount = project.files?.length || 1;

    return `
      <div class="project-card" data-project-id="${project.id}">
        <div class="project-card-header">
          <div class="project-card-badge ${isCloud ? 'badge-cloud' : 'badge-local'}">
            ${isCloud ? 'Cloud Sync' : 'Local Storage'}
          </div>
          <span class="project-card-version">v${project.version || 1}</span>
        </div>

        <div class="project-card-body">
          <h3 class="project-card-title">${escapeHtml(project.title)}</h3>
          <div class="project-card-meta">
            <span>📄 ${fileCount} script ${fileCount === 1 ? 'chapter' : 'chapters'}</span>
            <span>🌐 ${project.defaultLanguage.toUpperCase()}</span>
          </div>
        </div>

        <div class="project-card-footer">
          <button class="wf-btn btn-primary btn-open-editor" data-action="open" data-id="${project.id}">
            Open Editor →
          </button>
          <button class="wf-btn btn-sm btn-delete-project" data-action="delete" data-id="${project.id}" title="Delete project">
            🗑
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Sign out button
    const btnSignout = this.container.querySelector('#btn-projects-signout');
    btnSignout?.addEventListener('click', async () => {
      await this.authService.signOut();
      window.location.hash = '#/login';
    });

    // Create Modal triggers
    const btnOpenCreate = this.container.querySelector('#btn-open-create-modal');
    const modalCreate = this.container.querySelector('#modal-create-project') as HTMLElement;
    const btnCloseCreate = this.container.querySelector('#btn-close-create-modal');
    const btnCancelCreate = this.container.querySelector('#btn-cancel-create');
    const btnConfirmCreate = this.container.querySelector('#btn-confirm-create');
    const inputTitle = this.container.querySelector('#new-project-title-input') as HTMLInputElement;

    const openCreateModal = () => {
      if (modalCreate) {
        modalCreate.style.display = 'flex';
        inputTitle.value = '';
        inputTitle.focus();
      }
    };

    const closeCreateModal = () => {
      if (modalCreate) modalCreate.style.display = 'none';
    };

    btnOpenCreate?.addEventListener('click', openCreateModal);
    btnCloseCreate?.addEventListener('click', closeCreateModal);
    btnCancelCreate?.addEventListener('click', closeCreateModal);

    btnConfirmCreate?.addEventListener('click', async () => {
      const title = inputTitle.value.trim();
      if (!title) {
        inputTitle.focus();
        return;
      }
      closeCreateModal();
      const newProj = await this.repository.createProject(title, this.authService.getUserId());
      window.location.hash = `#/editor?id=${newProj.id}`;
    });

    inputTitle?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        btnConfirmCreate?.dispatchEvent(new Event('click'));
      } else if (e.key === 'Escape') {
        closeCreateModal();
      }
    });

    // Delete Modal triggers
    const modalDelete = this.container.querySelector('#modal-delete-project') as HTMLElement;
    const btnCloseDelete = this.container.querySelector('#btn-close-delete-modal');
    const btnCancelDelete = this.container.querySelector('#btn-cancel-delete');
    const btnConfirmDelete = this.container.querySelector('#btn-confirm-delete');
    const deleteWarningText = this.container.querySelector('#delete-warning-text') as HTMLElement;

    const closeDeleteModal = () => {
      if (modalDelete) modalDelete.style.display = 'none';
      this.projectToDelete = null;
    };

    btnCloseDelete?.addEventListener('click', closeDeleteModal);
    btnCancelDelete?.addEventListener('click', closeDeleteModal);

    btnConfirmDelete?.addEventListener('click', async () => {
      if (this.projectToDelete) {
        const id = this.projectToDelete.id;
        closeDeleteModal();
        await this.repository.deleteProject(id);
        await this.mount();
      }
    });

    // Card buttons delegation (Open & Delete)
    const grid = this.container.querySelector('#projects-grid');
    grid?.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === 'open') {
        window.location.hash = `#/editor?id=${id}`;
      } else if (action === 'delete') {
        const proj = this.projects.find(p => p.id === id);
        if (proj) {
          this.projectToDelete = proj;
          if (deleteWarningText) {
            deleteWarningText.textContent = `Are you sure you want to delete "${proj.title}"? All chapters and script files will be permanently removed.`;
          }
          if (modalDelete) modalDelete.style.display = 'flex';
        }
      }
    });
  }
}
