// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project } from '@vn-engine/shared-types';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import { usePreviewStore } from '../src/core/stores/livePreviewStore';

const testProject: Project = {
  id: 'proj-runner-test',
  title: 'Runner VN Project',
  version: 1,
  ownerId: 'user-1',
  defaultLanguage: 'vi',
  updatedAt: Date.now(),
  characters: [],
  assets: [],
  variables: [],
  uiScreens: [],
  customScripts: [],
  displaySettings: {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
    lockAspectRatio: true,
  },
  files: [
    {
      id: 'file-1',
      name: 'main.vns',
      content: 'scene intro\n"Teacher" "Good morning!"\nscene climax\n"Alice" "Here we are!"\n',
      order: 0,
      version: 1,
    },
  ],
};

describe('Decoupled Studio Preview Runner (TASK-decouple-preview-and-hotreload)', () => {
  let repo: IndexedDBProjectRepository;
  let openSpy: any;

  beforeEach(async () => {
    repo = new IndexedDBProjectRepository(`runner_test_${Date.now()}_${Math.random()}`);
    await repo.updateProject(testProject);

    openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      return {
        focus: vi.fn(),
        postMessage: vi.fn(),
        closed: false,
      } as unknown as Window;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders workspace with full width and no embedded preview dock', () => {
    render(
      <StudioWorkspacePage
        projectId={testProject.id}
        repository={repo}
        initialProject={testProject}
      />
    );

    expect(screen.queryByTestId('col-preview-dock')).not.toBeInTheDocument();
    expect(screen.getByTestId('col-workspace')).toBeInTheDocument();
  });

  it('populates available scenes in the header dropdown', () => {
    render(
      <StudioWorkspacePage
        projectId={testProject.id}
        repository={repo}
        initialProject={testProject}
      />
    );

    const sceneSelect = screen.getByTestId('select-header-scene');
    expect(sceneSelect).toBeInTheDocument();
    expect(sceneSelect).toHaveTextContent('intro');
    expect(sceneSelect).toHaveTextContent('climax');
  });

  it('opens popout window when Play (F5) button is clicked', () => {
    render(
      <StudioWorkspacePage
        projectId={testProject.id}
        repository={repo}
        initialProject={testProject}
      />
    );

    const playBtn = screen.getByTestId('btn-header-play');
    fireEvent.click(playBtn);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('popout=true'),
      'VN_Preview_Popout',
      expect.any(String)
    );
  });

  it('opens popout window when Run from Cursor (Alt+F5) button is clicked', () => {
    render(
      <StudioWorkspacePage
        projectId={testProject.id}
        repository={repo}
        initialProject={testProject}
      />
    );

    const runCursorBtn = screen.getByTestId('btn-header-run-cursor');
    fireEvent.click(runCursorBtn);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('popout=true'),
      'VN_Preview_Popout',
      expect.any(String)
    );
  });

  it('TC-RUN-01: resets connectionStatus to standby when opening a new popout window', () => {
    // Simulate connectionStatus had previously been connected
    usePreviewStore.getState().setConnectionStatus('connected');
    expect(usePreviewStore.getState().connectionStatus).toBe('connected');

    render(
      <StudioWorkspacePage
        projectId={testProject.id}
        repository={repo}
        initialProject={testProject}
      />
    );

    const playBtn = screen.getByTestId('btn-header-play');
    fireEvent.click(playBtn);

    // Opening a new popout must reset connectionStatus to standby for handshake
    expect(usePreviewStore.getState().connectionStatus).toBe('standby');
  });
});
