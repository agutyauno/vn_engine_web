/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Project } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../src/core/contracts/repository';
import { ActivityBar } from '../src/components/studio/ActivityBar';
import { ShortcutsHelpModal } from '../src/components/studio/ShortcutsHelpModal';
import { StudioHeader } from '../src/components/studio/StudioHeader';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { DockProblemsTable, type DiagnosticItem } from '../src/components/studio/DockProblemsTable';
import { useProjectStore } from '../src/core/stores/projectStore';
import { useEditorUIStore } from '../src/core/stores/uiStore';

// Mock repository cho StudioWorkspacePage
function createMockRepository(): ProjectRepository {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue(null),
    createProject: vi.fn(),
    updateProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    duplicateProject: vi.fn(),
    getStorageUsage: vi.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 1000000 }),
    getAssetBlob: vi.fn().mockResolvedValue(null),
    saveAssetBlob: vi.fn().mockResolvedValue(undefined),
    deleteAssetBlob: vi.fn().mockResolvedValue(undefined),
  };
}

describe('TASK-studio-polish-batch4: Studio Editor Refinements & UX Polish (Batch 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      project: null,
      isDirty: false,
      isSaving: false,
      dirtyFileIds: [],
    });
    useEditorUIStore.setState({
      activeTab: 'scripts',
      openFileIds: [],
      activeFileId: null,
      isDrawerOpen: false,
      isShortcutsOpen: false,
      isSettingsOpen: false,
    });
  });

  // TC-BATCH4-01: ActivityBar Shortcuts Help Button & Callback
  it('TC-BATCH4-01: should render shortcuts button with HelpCircleIcon and trigger onOpenShortcuts on click', () => {
    const handleOpenShortcuts = vi.fn();
    const handleSelectTab = vi.fn();

    render(
      <ActivityBar
        activeTab="scripts"
        onSelectTab={handleSelectTab}
        onOpenShortcuts={handleOpenShortcuts}
      />
    );

    const shortcutsBtn = screen.getByTestId('activity-bar-btn-shortcuts');
    expect(shortcutsBtn).toBeInTheDocument();
    expect(shortcutsBtn).toHaveAttribute('aria-label', 'Keyboard Shortcuts');
    expect(shortcutsBtn).toHaveAttribute('title', 'Keyboard Shortcuts (?)');

    // Kiểm tra icon SVG bên trong nút
    const svgIcon = shortcutsBtn.querySelector('svg');
    expect(svgIcon).toBeInTheDocument();

    // Click gọi callback
    fireEvent.click(shortcutsBtn);
    expect(handleOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  // TC-BATCH4-02: ShortcutsHelpModal Separates Ctrl + B and Ctrl + `
  it('TC-BATCH4-02: should cleanly separate Ctrl + B (sidebar) and Ctrl + ` (drawer) in ShortcutsHelpModal', () => {
    const handleClose = vi.fn();

    render(<ShortcutsHelpModal isOpen={true} onClose={handleClose} />);

    expect(screen.getByTestId('modal-shortcuts-help')).toBeInTheDocument();

    // Kiểm tra dòng phím tắt riêng "Toggle navigation sidebar" với Ctrl + B
    const sidebarDesc = screen.getByText('Toggle navigation sidebar');
    expect(sidebarDesc).toBeInTheDocument();
    const sidebarRow = sidebarDesc.closest('div');
    expect(sidebarRow).not.toBeNull();
    expect(within(sidebarRow!).getByText('Ctrl + B')).toBeInTheDocument();

    // Kiểm tra dòng phím tắt riêng "Toggle bottom Problems & Diagnostics drawer" với Ctrl + `
    const drawerDesc = screen.getByText('Toggle bottom Problems & Diagnostics drawer');
    expect(drawerDesc).toBeInTheDocument();
    const drawerRow = drawerDesc.closest('div');
    expect(drawerRow).not.toBeNull();
    expect(within(drawerRow!).getByText('Ctrl + `')).toBeInTheDocument();

    // Đảm bảo Ctrl + B không còn bị gộp trong dòng drawer
    expect(within(drawerRow!).queryByText('Ctrl + B')).toBeNull();
  });

  // TC-BATCH4-03: StudioHeader Export Action Button & No Aspect Ratio
  it('TC-BATCH4-03: should render export button calling onExport and omit aspect ratio text in StudioHeader', () => {
    const handleExport = vi.fn();

    render(
      <StudioHeader
        projectTitle="Starlight Echoes"
        canvasWidth={1920}
        canvasHeight={1080}
        onExport={handleExport}
      />
    );

    const exportBtn = screen.getByTestId('btn-header-export');
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toHaveTextContent('Export');

    fireEvent.click(exportBtn);
    expect(handleExport).toHaveBeenCalledTimes(1);

    // Xác nhận không render Aspect Ratio text trên StudioHeader
    expect(screen.queryByText(/1920 × 1080/i)).toBeNull();
    expect(screen.queryByText(/16:9/i)).toBeNull();
  });

  // TC-BATCH4-04: StudioWorkspacePage Connects Uncreated Characters & Quick Fix
  it('TC-BATCH4-04: should display uncreated character warning and 1-click Quick Fix when switching to characters tab', async () => {
    const repository = createMockRepository();
    const mockProject: Project = {
      id: 'proj-uncreated-char-test',
      title: 'Character Reconciliation Project',
      version: 1,
      ownerId: 'author-1',
      defaultLanguage: 'vi',
      entryScene: 'main.vns',
      files: [
        {
          id: 'file-1',
          name: 'main.vns',
          content: 'scene intro {\n  show mysterious_guy\n  alice "Hello!"\n}',
          order: 0,
          version: 1,
        },
      ],
      characters: [
        { id: 'alice', name: 'Alice Margatroid', sprites: {} },
      ],
      assets: [],
      variables: [],
      uiScreens: [],
      customScripts: [],
    };

    render(
      <StudioWorkspacePage
        projectId={mockProject.id}
        repository={repository}
        initialProject={mockProject}
      />
    );

    // Chuyển sang tab 'characters' thông qua ActivityBar
    const charTabBtn = screen.getByTestId('tab-characters');
    fireEvent.click(charTabBtn);

    // Kiểm tra card cảnh báo nhân vật chưa tạo "mysterious_guy"
    const uncreatedCard = await screen.findByTestId('uncreated-character-mysterious_guy');
    expect(uncreatedCard).toBeInTheDocument();
    expect(within(uncreatedCard).getByText('mysterious_guy')).toBeInTheDocument();

    // Kiểm tra nút Quick Fix "Create"
    const quickFixBtn = within(uncreatedCard).getByTestId('btn-quickfix-character-mysterious_guy');
    expect(quickFixBtn).toBeInTheDocument();
    expect(quickFixBtn).toHaveTextContent('Create');
  });

  // TC-BATCH4-05: DockProblemsTable Info Filter Button
  it('TC-BATCH4-05: should render Info filter button and filter only info diagnostics when clicked', () => {
    const handleFilterChange = vi.fn();
    const mockDiagnostics: DiagnosticItem[] = [
      {
        id: 'err-1',
        severity: 'error',
        message: 'Invalid syntax token near line 1',
        category: 'compiler',
        fileName: 'main.vns',
        line: 1,
      },
      {
        id: 'warn-1',
        severity: 'warning',
        message: 'Character sprite missing for expression "smile"',
        category: 'character',
      },
      {
        id: 'info-1',
        severity: 'info',
        message: 'Project restored from local cache',
        category: 'compiler',
      },
      {
        id: 'info-2',
        severity: 'info',
        message: 'State snapshot taken successfully',
        category: 'runtime',
      },
    ];

    render(
      <DockProblemsTable
        diagnostics={mockDiagnostics}
        onFilterChange={handleFilterChange}
      />
    );

    // Kiểm tra nút Info filter có mặt và hiển thị đúng số lượng Info (2)
    const infoFilterBtn = screen.getByTestId('btn-filter-info');
    expect(infoFilterBtn).toBeInTheDocument();
    expect(infoFilterBtn).toHaveTextContent('Info (2)');

    // Ban đầu filter = 'all' hiển thị cả 4 dòng
    expect(screen.getByTestId('problem-row-err-1')).toBeInTheDocument();
    expect(screen.getByTestId('problem-row-warn-1')).toBeInTheDocument();
    expect(screen.getByTestId('problem-row-info-1')).toBeInTheDocument();
    expect(screen.getByTestId('problem-row-info-2')).toBeInTheDocument();

    // Bấm nút Info filter
    fireEvent.click(infoFilterBtn);
    expect(handleFilterChange).toHaveBeenCalledWith('info');

    // Chỉ còn 2 dòng severity = 'info' hiển thị trên bảng
    expect(screen.queryByTestId('problem-row-err-1')).toBeNull();
    expect(screen.queryByTestId('problem-row-warn-1')).toBeNull();
    expect(screen.getByTestId('problem-row-info-1')).toBeInTheDocument();
    expect(screen.getByTestId('problem-row-info-2')).toBeInTheDocument();
  });
});

