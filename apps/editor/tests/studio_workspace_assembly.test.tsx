// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Project, ScriptFile } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../src/core/contracts/repository';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { useProjectStore } from '../src/core/stores/projectStore';
import { useEditorUIStore } from '../src/core/stores/uiStore';
import { setupTestStore } from './testStoreHelpers';

describe('StudioWorkspacePage Assembly & Cutover (Phase 5 TDD)', () => {
  let setPointerCaptureMock: ReturnType<typeof vi.fn>;
  let releasePointerCaptureMock: ReturnType<typeof vi.fn>;

  const sampleFiles: ScriptFile[] = [
    {
      id: 'file-1',
      name: 'chapter1.vns',
      order: 0,
      version: 1,
      content: 'scene school:\n"Alice" "Hello from Chapter 1!"\n',
    },
    {
      id: 'file-2',
      name: 'chapter2.vns',
      order: 1,
      version: 1,
      content: 'scene sunset:\n"Bob" "Hello from Chapter 2!"\n',
    },
  ];

  const sampleProject: Project = {
    id: 'proj-assembly-test',
    title: 'Workspace Assembly Project',
    version: 1,
    ownerId: 'author-tdd',
    defaultLanguage: 'vi',
    updatedAt: Date.now(),
    variables: [],
    uiScreens: [],
    customScripts: [],
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      lockAspectRatio: true,
    },
    files: sampleFiles,
    characters: [],
    assets: [],
  };

  function createMockRepository(initialProject: Project): ProjectRepository {
    let proj: Project = JSON.parse(JSON.stringify(initialProject));
    return {
      listProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn().mockImplementation(async (id: string) => (id === proj.id ? proj : null)),
      createProject: vi.fn().mockResolvedValue(proj),
      updateProject: vi.fn().mockImplementation(async (updated: Project) => {
        proj = JSON.parse(JSON.stringify(updated));
      }),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      duplicateProject: vi.fn().mockResolvedValue(proj),
      getStorageUsage: vi.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 1000000 }),
      getAssetBlob: vi.fn().mockResolvedValue(null),
      saveAssetBlob: vi.fn().mockResolvedValue(undefined),
      deleteAssetBlob: vi.fn().mockResolvedValue(undefined),
    };
  }

  function getNavSplitter(): HTMLElement {
    const vertical = screen.getAllByRole('separator').filter(
      (el) => el.getAttribute('aria-orientation') === 'vertical'
    );
    if (vertical.length === 0) throw new Error('No vertical separator found for nav');
    return vertical[0] as HTMLElement;
  }

  function getPreviewSplitter(): HTMLElement {
    const vertical = screen.getAllByRole('separator').filter(
      (el) => el.getAttribute('aria-orientation') === 'vertical'
    );
    if (vertical.length < 2) throw new Error('No second vertical separator found for preview');
    return vertical[1] as HTMLElement;
  }

  function getDrawerSplitter(): HTMLElement {
    const horizontal = screen.getAllByRole('separator').find(
      (el) => el.getAttribute('aria-orientation') === 'horizontal'
    );
    if (!horizontal) throw new Error('No horizontal separator found for drawer');
    return horizontal as HTMLElement;
  }

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true, writable: true });
    setupTestStore();
    setPointerCaptureMock = vi.fn();
    releasePointerCaptureMock = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = setPointerCaptureMock;
    window.HTMLElement.prototype.releasePointerCapture = releasePointerCaptureMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TC-ASSEMBLY-01: Workspace Initialization & Store Sync
  it('TC-ASSEMBLY-01: initializes project and UI stores on mount and renders active script', async () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    // Store synchronization verification
    expect(useProjectStore.getState().project?.id).toBe(sampleProject.id);
    expect(useProjectStore.getState().project?.title).toBe('Workspace Assembly Project');
    expect(useEditorUIStore.getState().activeFileId).toBe('file-1');
    expect(useEditorUIStore.getState().openFileIds).toContain('file-1');

    // DOM rendering verification
    expect(screen.getByTestId('header-project-title')).toHaveTextContent('Workspace Assembly Project');
    expect(screen.getByTestId('editor-tab-file-1')).toBeInTheDocument();
  });

  // TC-ASSEMBLY-02: Nav Splitter Drag & Double-Click Reset
  it('TC-ASSEMBLY-02: drags nav splitter to resize nav width and resets on double-click (260px)', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    const colNav = screen.getByTestId('col-navigation');
    expect(useEditorUIStore.getState().navWidth).toBe(260);

    const navSplitter = getNavSplitter();

    // Drag nav splitter right (+40px)
    fireEvent.pointerDown(navSplitter, { clientX: 260, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 100, pointerId: 1 });

    expect(useEditorUIStore.getState().navWidth).toBe(300);
    expect(colNav).toHaveStyle({ width: '300px' });

    // Double-click to reset to 260px
    fireEvent.doubleClick(navSplitter);
    expect(useEditorUIStore.getState().navWidth).toBe(260);
    expect(colNav).toHaveStyle({ width: '260px' });
  });

  // TC-ASSEMBLY-03: Preview Splitter Drag & Double-Click Reset
  it('TC-ASSEMBLY-03: drags preview splitter to resize preview width and resets on double-click (440px)', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    const colPreview = screen.getByTestId('col-preview-dock');
    expect(useEditorUIStore.getState().previewWidth).toBe(440);

    const previewSplitter = getPreviewSplitter();

    // Drag preview splitter left by 50px (expanding preview width from 440 to 490)
    fireEvent.pointerDown(previewSplitter, { clientX: 800, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 750, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 750, clientY: 100, pointerId: 1 });

    expect(useEditorUIStore.getState().previewWidth).toBe(490);
    expect(colPreview).toHaveStyle({ width: '490px' });

    // Double-click to reset to 440px
    fireEvent.doubleClick(previewSplitter);
    expect(useEditorUIStore.getState().previewWidth).toBe(440);
    expect(colPreview).toHaveStyle({ width: '440px' });
  });

  // TC-ASSEMBLY-04: Drawer Splitter Drag & Double-Click Reset
  it('TC-ASSEMBLY-04: drags drawer splitter to resize drawer height and resets on double-click (200px)', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    expect(useEditorUIStore.getState().drawerHeight).toBe(200);

    const drawerSplitter = getDrawerSplitter();

    // Drag drawer splitter up by 50px (expanding drawer from 200 to 250)
    fireEvent.pointerDown(drawerSplitter, { clientX: 400, clientY: 600, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 400, clientY: 550, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 550, pointerId: 1 });

    expect(useEditorUIStore.getState().drawerHeight).toBe(250);

    // Double-click to reset to 200px
    fireEvent.doubleClick(drawerSplitter);
    expect(useEditorUIStore.getState().drawerHeight).toBe(200);
  });

  // TC-ASSEMBLY-05: Unsaved Changes Guard: Save & Continue
  it('TC-ASSEMBLY-05: Unsaved Changes Guard opens on back click when dirty, saving and continuing when confirmed', async () => {
    const mockRepo = createMockRepository(sampleProject);
    const handleBackToHub = vi.fn();

    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
        onBackToHub={handleBackToHub}
      />
    );

    // Dirty the workspace by editing script content
    const textarea = screen.getByTestId('monaco-fallback-textarea');
    fireEvent.change(textarea, { target: { value: 'scene modified:\n"Alice" "Dirty changes"\n' } });

    // Click Back to Hub button
    const backBtn = screen.getByTestId('btn-back-hub');
    fireEvent.click(backBtn);

    // Unsaved changes modal should appear, navigation held
    expect(screen.getByTestId('modal-unsaved-changes')).toBeInTheDocument();
    expect(handleBackToHub).not.toHaveBeenCalled();

    // Click Save & Continue
    const saveAndContinueBtn = screen.getByTestId('btn-save-and-continue');
    fireEvent.click(saveAndContinueBtn);

    // Repository saved and navigation invoked
    await waitFor(() => {
      expect(mockRepo.updateProject).toHaveBeenCalled();
      expect(handleBackToHub).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('modal-unsaved-changes')).not.toBeInTheDocument();
    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  // TC-ASSEMBLY-06: Unsaved Changes Guard: Don't Save
  it('TC-ASSEMBLY-06: Unsaved Changes Guard discards modifications and proceeds without saving repo when Don\'t Save clicked', async () => {
    const mockRepo = createMockRepository(sampleProject);
    const handleBackToHub = vi.fn();

    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
        onBackToHub={handleBackToHub}
      />
    );

    const textarea = screen.getByTestId('monaco-fallback-textarea');
    fireEvent.change(textarea, { target: { value: 'scene modified:\n"Alice" "Dirty changes"\n' } });

    // Click Back to Hub button
    const backBtn = screen.getByTestId('btn-back-hub');
    fireEvent.click(backBtn);

    expect(screen.getByTestId('modal-unsaved-changes')).toBeInTheDocument();
    expect(handleBackToHub).not.toHaveBeenCalled();

    // Click Don't Save
    (mockRepo.updateProject as ReturnType<typeof vi.fn>).mockClear();
    const discardBtn = screen.getByTestId('btn-discard-and-continue');
    fireEvent.click(discardBtn);

    expect(mockRepo.updateProject).not.toHaveBeenCalled();
    expect(handleBackToHub).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('modal-unsaved-changes')).not.toBeInTheDocument();
  });

  // TC-ASSEMBLY-07: Unsaved Changes Guard: Cancel
  it('TC-ASSEMBLY-07: Unsaved Changes Guard cancels dialog, retaining workspace and dirty state', async () => {
    const mockRepo = createMockRepository(sampleProject);
    const handleBackToHub = vi.fn();

    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
        onBackToHub={handleBackToHub}
      />
    );

    const textarea = screen.getByTestId('monaco-fallback-textarea');
    fireEvent.change(textarea, { target: { value: 'scene modified:\n"Alice" "Dirty changes"\n' } });

    const backBtn = screen.getByTestId('btn-back-hub');
    fireEvent.click(backBtn);

    expect(screen.getByTestId('modal-unsaved-changes')).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByTestId('btn-cancel-unsaved');
    fireEvent.click(cancelBtn);

    expect(handleBackToHub).not.toHaveBeenCalled();
    expect(screen.queryByTestId('modal-unsaved-changes')).not.toBeInTheDocument();
    expect(useProjectStore.getState().isDirty).toBe(true);
  });

  // TC-ASSEMBLY-08: Global Hotkey Ctrl+S Triggers Manual Save
  it('TC-ASSEMBLY-08: global hotkey Ctrl+S triggers manual save and clears dirty state', async () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    const textarea = screen.getByTestId('monaco-fallback-textarea');
    fireEvent.change(textarea, { target: { value: 'scene modified:\n"Alice" "Dirty changes"\n' } });

    // Dispatch Ctrl+S
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await waitFor(() => {
      expect(mockRepo.updateProject).toHaveBeenCalled();
    });
    expect(useProjectStore.getState().isDirty).toBe(false);
    expect(screen.getByTestId('header-save-status')).toHaveTextContent(/Saved/i);
  });

  // TC-ASSEMBLY-09: Global Hotkey Ctrl+` Toggles Problems Drawer
  it('TC-ASSEMBLY-09: global hotkey Ctrl+` toggles bottom problems drawer', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    const initialDrawerState = useEditorUIStore.getState().isDrawerOpen;

    // Toggle drawer via Ctrl+`
    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(useEditorUIStore.getState().isDrawerOpen).toBe(!initialDrawerState);

    // Toggle back via Ctrl+`
    fireEvent.keyDown(window, { key: '`', ctrlKey: true });
    expect(useEditorUIStore.getState().isDrawerOpen).toBe(initialDrawerState);
  });

  // TC-ASSEMBLY-10: Global Hotkey Ctrl+, Opens Project Settings
  it('TC-ASSEMBLY-10: global hotkey Ctrl+, opens Project Settings modal', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    expect(screen.queryByTestId('modal-project-settings')).not.toBeInTheDocument();

    // Dispatch Ctrl+,
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });

    expect(screen.getByTestId('modal-project-settings')).toBeInTheDocument();
  });

  // TC-ASSEMBLY-11: Global Hotkey ? Opens Shortcuts Help Modal
  it('TC-ASSEMBLY-11: global hotkey ? opens Shortcuts Help modal when focus is not in text input', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    expect(screen.queryByTestId('modal-shortcuts-help')).not.toBeInTheDocument();

    // Dispatch ? with focus on body
    fireEvent.keyDown(window, { key: '?' });

    expect(screen.getByTestId('modal-shortcuts-help')).toBeInTheDocument();
  });

  // TC-ASSEMBLY-12: Script Duplication Eliminated from Explorer
  it('TC-ASSEMBLY-12: does not render duplicate file button on script files in explorer', () => {
    const mockRepo = createMockRepository(sampleProject);
    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
      />
    );

    expect(screen.queryByTestId('btn-duplicate-file-file-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-duplicate-file-file-2')).not.toBeInTheDocument();
  });

  // TC-ASSEMBLY-13: Clean Navigation with Zero Dirty State
  it('TC-ASSEMBLY-13: navigates back to hub immediately when workspace is clean without opening unsaved modal', () => {
    const mockRepo = createMockRepository(sampleProject);
    const handleBackToHub = vi.fn();

    render(
      <StudioWorkspacePage
        projectId={sampleProject.id}
        repository={mockRepo}
        initialProject={sampleProject}
        onBackToHub={handleBackToHub}
      />
    );

    expect(useProjectStore.getState().isDirty).toBe(false);

    const backBtn = screen.getByTestId('btn-back-hub');
    fireEvent.click(backBtn);

    expect(handleBackToHub).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('modal-unsaved-changes')).not.toBeInTheDocument();
  });
});

