// apps/editor/tests/sidebar_collapsible.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityBar } from '../src/components/studio/ActivityBar';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { FileExplorerPane } from '../src/components/studio/FileExplorerPane';
import { useEditorUIStore } from '../src/core/stores/uiStore';
import type { ProjectRepository } from '../src/core/contracts/repository';
import type { Project } from '@vn-engine/shared-types';

function createMockRepo(initialProject: Project): ProjectRepository {
  let proj = { ...initialProject };
  return {
    getProject: vi.fn(async () => proj),
    updateProject: vi.fn(async (p: Project) => {
      proj = { ...p };
      return proj;
    }),
    saveAssetFile: vi.fn(async () => '/mock-storage-url'),
    deleteAssetFile: vi.fn(async () => {}),
  } as unknown as ProjectRepository;
}

const mockProject: Project = {
  id: 'test-project-sidebar',
  title: 'Test Sidebar Project',
  version: 1,
  ownerId: 'owner-test',
  defaultLanguage: 'vi',
  files: [
    {
      id: 'file-main',
      name: 'main.vns',
      content: 'scene start {\n  alice: "Hello"\n}',
      order: 0,
      version: 1,
    },
  ],
  characters: [],
  assets: [],
  variables: [],
  uiScreens: [],
  customScripts: [],
};

describe('Collapsible & Fluid Resizable Navigation Sidebar', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true, writable: true });
    useEditorUIStore.setState({
      activeTab: 'scripts',
      navWidth: 260,
      previewWidth: 440,
      drawerHeight: 200,
      isDrawerOpen: false,
    });
  });

  // TC-SIDEBAR-01: Nhấp vào tab đang active trên ActivityBar sẽ đóng sidebar
  it('TC-SIDEBAR-01: should collapse navigation sidebar when clicking the currently active ActivityBar tab', () => {
    const handleSelectTab = vi.fn();

    render(
      <ActivityBar
        activeTab="scripts"
        onSelectTab={handleSelectTab}
      />
    );

    const scriptsButton = screen.getByTestId('tab-scripts');
    fireEvent.click(scriptsButton);

    // Expect onSelectTab to be called with null (toggle off)
    expect(handleSelectTab).toHaveBeenCalledWith(null);
  });

  it('TC-SIDEBAR-01 (Integration): clicking active tab in workspace collapses nav column to 48px', () => {
    const repo = createMockRepo(mockProject);
    render(
      <StudioWorkspacePage
        projectId="test-project-sidebar"
        repository={repo}
        initialProject={mockProject}
      />
    );

    const navColumn = screen.getByTestId('col-navigation');
    expect(navColumn).toHaveStyle({ width: '260px' });

    // Click active 'scripts' tab
    const scriptsTabBtn = screen.getByTestId('tab-scripts');
    fireEvent.click(scriptsTabBtn);

    // Sidebar should be collapsed to 48px
    expect(navColumn).toHaveStyle({ width: '48px' });
    expect(useEditorUIStore.getState().activeTab).toBeNull();
  });

  // TC-SIDEBAR-02: Nhấp vào tab bất kỳ khi sidebar đang đóng sẽ mở lại sidebar với navWidth đã lưu
  it('TC-SIDEBAR-02: should expand sidebar back to stored navWidth when clicking a tab while collapsed', () => {
    useEditorUIStore.setState({ activeTab: null, navWidth: 320 });
    const repo = createMockRepo(mockProject);

    render(
      <StudioWorkspacePage
        projectId="test-project-sidebar"
        repository={repo}
        initialProject={mockProject}
      />
    );

    const navColumn = screen.getByTestId('col-navigation');
    expect(navColumn).toHaveStyle({ width: '48px' });

    // Click 'scripts' tab to expand
    const scriptsTabBtn = screen.getByTestId('tab-scripts');
    fireEvent.click(scriptsTabBtn);

    expect(navColumn).toHaveStyle({ width: '320px' });
    expect(useEditorUIStore.getState().activeTab).toBe('scripts');
  });

  // TC-SIDEBAR-03: Nhấn phím tắt Ctrl+B toggle đóng/mở sidebar navigation
  it('TC-SIDEBAR-03: should toggle sidebar collapse and expand when pressing Ctrl+B or Cmd+B', () => {
    const repo = createMockRepo(mockProject);
    render(
      <StudioWorkspacePage
        projectId="test-project-sidebar"
        repository={repo}
        initialProject={mockProject}
      />
    );

    const navColumn = screen.getByTestId('col-navigation');
    expect(navColumn).toHaveStyle({ width: '260px' });

    // 1st Ctrl+B: Collapses sidebar
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(navColumn).toHaveStyle({ width: '48px' });
    expect(useEditorUIStore.getState().activeTab).toBeNull();

    // 2nd Ctrl+B: Re-expands sidebar
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(navColumn).toHaveStyle({ width: '260px' });
    expect(useEditorUIStore.getState().activeTab).toBe('scripts');
  });

  // TC-SIDEBAR-04: Khi sidebar đóng (collapsed), thanh kéo splitter nav không hiển thị hoặc bị ẩn
  it('TC-SIDEBAR-04: should hide or not render the navigation ColumnSplitter when sidebar is collapsed', () => {
    useEditorUIStore.setState({ activeTab: null, navWidth: 260 });
    const repo = createMockRepo(mockProject);

    render(
      <StudioWorkspacePage
        projectId="test-project-sidebar"
        repository={repo}
        initialProject={mockProject}
      />
    );

    const navSplitter = document.querySelector('[data-testid="column-splitter-nav"]');
    if (navSplitter) {
      expect(navSplitter.className).toMatch(/hidden/);
    } else {
      expect(navSplitter).toBeNull();
    }
  });

  // TC-SIDEBAR-05: FileExplorerPane và AssetLibraryPane sử dụng class co giãn flex-1 min-w-0
  it('TC-SIDEBAR-05: FileExplorerPane should have fluid class flex-1 min-w-0 and no hardcoded w-64', () => {
    render(
      <FileExplorerPane
        files={mockProject.files}
        activeFileId="file-main"
        onSelectFile={() => {}}
        onCreateFile={() => {}}
        onRenameFile={() => {}}
        onDeleteFile={() => {}}
      />
    );

    const explorerPane = screen.getByTestId('pane-file-explorer');
    expect(explorerPane.className).toContain('flex-1');
    expect(explorerPane.className).toContain('min-w-0');
    expect(explorerPane.className).not.toContain('w-64');
  });

  it('TC-SIDEBAR-05: Asset placeholder in StudioWorkspacePage should have flex-1 min-w-0 and no hardcoded w-72', () => {
    useEditorUIStore.setState({ activeTab: 'assets', navWidth: 350 });
    const repo = createMockRepo(mockProject);

    render(
      <StudioWorkspacePage
        projectId="test-project-sidebar"
        repository={repo}
        initialProject={mockProject}
      />
    );

    const assetPlaceholder = screen.getByTestId('pane-assets-placeholder');
    expect(assetPlaceholder.className).toContain('flex-1');
    expect(assetPlaceholder.className).toContain('min-w-0');
    expect(assetPlaceholder.className).not.toContain('w-72');
  });
});
