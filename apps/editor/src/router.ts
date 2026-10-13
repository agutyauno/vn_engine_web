// ================================================================
// SPA HASH ROUTER (ADR-019, SAD 3.6, UI/UX Spec)
// Multi-page navigation controller with route guards
// ================================================================

import { AuthService } from './services/authService';
import { LoginPage } from './pages/loginPage';
import { ProjectsPage } from './pages/projectsPage';
import type { IProjectRepository } from './repository/projectRepository';

export interface RouteParams {
  path: string;
  query: Record<string, string>;
}

export class AppRouter {
  private authService: AuthService;
  private repository: IProjectRepository;

  private viewLoginEl!: HTMLElement;
  private viewProjectsEl!: HTMLElement;
  private viewEditorEl!: HTMLElement;

  private loginPage!: LoginPage;
  private projectsPage!: ProjectsPage;
  private onEditorLoadCallback?: (projectId: string) => Promise<void>;

  constructor(repository: IProjectRepository) {
    this.repository = repository;
    this.authService = AuthService.getInstance();
  }

  public init(onEditorLoad: (projectId: string) => Promise<void>): void {
    this.onEditorLoadCallback = onEditorLoad;

    this.viewLoginEl = document.getElementById('view-login') as HTMLElement;
    this.viewProjectsEl = document.getElementById('view-projects') as HTMLElement;
    this.viewEditorEl = document.getElementById('view-editor') as HTMLElement;

    this.loginPage = new LoginPage(this.viewLoginEl);
    this.projectsPage = new ProjectsPage(this.viewProjectsEl, this.repository);

    // Listen to hash changes
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen to auth state changes for auto-redirection
    this.authService.onAuthStateChange(state => {
      const currentPath = this.parseHash().path;
      if (!state.isAuthenticated && currentPath !== '/login') {
        window.location.hash = '#/login';
      } else if (state.isAuthenticated && currentPath === '/login') {
        window.location.hash = '#/projects';
      }
    });

    // Initial navigation
    this.handleRoute();
  }

  public parseHash(): RouteParams {
    let hash = window.location.hash.trim();
    if (!hash || hash === '#') {
      hash = '#/';
    }

    const parts = hash.replace(/^#/, '').split('?');
    const rawPath = parts[0] || '/';
    const rawQuery = parts[1] || '';
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

    const query: Record<string, string> = {};
    if (rawQuery) {
      const pairs = rawQuery.split('&');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k) {
          query[decodeURIComponent(k)] = decodeURIComponent(v || '');
        }
      }
    }

    return { path, query };
  }

  public async handleRoute(): Promise<void> {
    const { path, query } = this.parseHash();
    const isAuthed = this.authService.isAuthenticated();

    // 1. ROUTE GUARDS
    if (!isAuthed && path !== '/login') {
      window.location.hash = '#/login';
      return;
    }

    if (isAuthed && (path === '/login' || path === '/' || path === '')) {
      window.location.hash = '#/projects';
      return;
    }

    if (path === '/editor') {
      const projectId = query.id;
      if (!projectId) {
        // Missing project ID: redirect back to projects dashboard
        window.location.hash = '#/projects';
        return;
      }
    }

    // 2. SWITCH VIEWS
    this.hideAllViews();

    if (path === '/login') {
      this.viewLoginEl.classList.add('active');
      this.loginPage.render();
    } else if (path === '/projects') {
      this.viewProjectsEl.classList.add('active');
      await this.projectsPage.mount();
    } else if (path === '/editor') {
      this.viewEditorEl.classList.add('active');
      const projectId = query.id;
      if (this.onEditorLoadCallback && projectId) {
        await this.onEditorLoadCallback(projectId);
      }
    } else {
      // Default fallback
      window.location.hash = isAuthed ? '#/projects' : '#/login';
    }
  }

  private hideAllViews(): void {
    if (this.viewLoginEl) this.viewLoginEl.classList.remove('active');
    if (this.viewProjectsEl) this.viewProjectsEl.classList.remove('active');
    if (this.viewEditorEl) this.viewEditorEl.classList.remove('active');
  }
}
