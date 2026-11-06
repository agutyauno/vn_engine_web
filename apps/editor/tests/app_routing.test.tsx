// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import { App, parseHashRoute } from '../src/App';

describe('App Routing & Navigation (TDD)', () => {
  let repo: IndexedDBProjectRepository;

  beforeEach(() => {
    window.location.hash = '';
    repo = new IndexedDBProjectRepository(`test-app-routing-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    cleanup();
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  describe('parseHashRoute helper', () => {
    it('parses empty or # or #/projects as hub route', () => {
      expect(parseHashRoute('')).toEqual({ view: 'hub' });
      expect(parseHashRoute('#')).toEqual({ view: 'hub' });
      expect(parseHashRoute('#/')).toEqual({ view: 'hub' });
      expect(parseHashRoute('#/projects')).toEqual({ view: 'hub' });
      expect(parseHashRoute('#/hub')).toEqual({ view: 'hub' });
    });

    it('parses #/editor/:id as studio route with projectId', () => {
      expect(parseHashRoute('#/editor/proj-123')).toEqual({
        view: 'studio',
        projectId: 'proj-123',
      });
      expect(parseHashRoute('editor/proj-456')).toEqual({
        view: 'studio',
        projectId: 'proj-456',
      });
    });

    it('parses #/studio/:id as studio route with projectId', () => {
      expect(parseHashRoute('#/studio/proj-abc')).toEqual({
        view: 'studio',
        projectId: 'proj-abc',
      });
    });
  });

  describe('App Component Routing Flow', () => {
    it('UT-APP-01: renders ProjectHubView by default when hash is empty', async () => {
      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
      });

      expect(screen.getByTestId('input-project-search')).toBeInTheDocument();
      expect(screen.queryByTestId('studio-workspace')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-back-hub')).not.toBeInTheDocument();
    });

    it('UT-APP-02: transitions to StudioWorkspacePage when a project is opened from Hub', async () => {
      const created = await repo.createProject({
        title: 'Cyberpunk Chronicles',
        description: 'Neo Tokyo VN',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByText('Cyberpunk Chronicles')).toBeInTheDocument();
      });

      const openButton = screen.getByTestId(`btn-open-project-${created.id}`);
      fireEvent.click(openButton);

      await waitFor(() => {
        expect(screen.getByTestId('header-project-title')).toHaveTextContent('Cyberpunk Chronicles');
      });

      expect(screen.getByTestId('btn-back-hub')).toBeInTheDocument();
      expect(window.location.hash).toBe(`#/editor/${created.id}`);
    });

    it('UT-APP-03: transitions back to ProjectHubView when Back to Hub is clicked', async () => {
      const created = await repo.createProject({
        title: 'Retro Romance',
        description: 'Classic Visual Novel',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByText('Retro Romance')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId(`btn-open-project-${created.id}`));

      await waitFor(() => {
        expect(screen.getByTestId('header-project-title')).toHaveTextContent('Retro Romance');
      });

      const backButton = screen.getByTestId('btn-back-hub');
      fireEvent.click(backButton);

      await waitFor(() => {
        expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText('Retro Romance')).toBeInTheDocument();
      });
      expect(window.location.hash).toBe('#/projects');
    });

    it('UT-APP-04: boots directly into Studio when URL hash contains a project ID on initial load', async () => {
      const created = await repo.createProject({
        title: 'Deep Space Mystery',
        description: 'Sci-Fi Visual Novel',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      window.location.hash = `#/editor/${created.id}`;

      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('header-project-title')).toHaveTextContent('Deep Space Mystery');
      });

      expect(screen.getByTestId('btn-back-hub')).toBeInTheDocument();
    });

    it('UT-APP-05: handles hashchange event dynamically from studio to hub', async () => {
      const created = await repo.createProject({
        title: 'Dynamic Hash Test',
        displaySettings: {
          width: 1920,
          height: 1080,
          orientation: 'landscape',
          lockAspectRatio: true,
        },
      });

      render(<App repository={repo} initialRoute={{ view: 'studio', projectId: created.id }} />);

      await waitFor(() => {
        expect(screen.getByTestId('header-project-title')).toHaveTextContent('Dynamic Hash Test');
      });

      // Emulate user clicking browser back to #/projects
      window.location.hash = '#/projects';
      fireEvent(window, new HashChangeEvent('hashchange'));

      await waitFor(() => {
        expect(screen.getByTestId('btn-new-project')).toBeInTheDocument();
      });
    });
  });
});
