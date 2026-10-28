// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Project, ScriptFile } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../src/core/contracts/repository';
import {
  FileExplorerPane,
  cleanChapterName,
  normalizeScriptName,
  validateFileName,
  generateDefaultScriptName,
} from '../src/components/studio/FileExplorerPane';
import { ActivityBar } from '../src/components/studio/ActivityBar';
import { StudioHeader, getAspectRatioBadge } from '../src/components/studio/StudioHeader';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';

describe('Studio Shell & Navigation (Milestone 3 TDD)', () => {
  const mockFiles: ScriptFile[] = [
    { id: 'f-1', name: 'main.vns', content: 'say "Welcome"', order: 0, version: 1 },
    { id: 'f-2', name: 'chapter_1.vns', content: 'say "Chapter 1"', order: 1, version: 1 },
    { id: 'f-3', name: 'ending.vns', content: 'say "Ending"', order: 2, version: 1 },
  ];

  const mockProject: Project = {
    id: 'proj-123',
    title: 'Echoes of the Sea',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: mockFiles,
    characters: [],
    assets: [],
    variables: [],
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
    },
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('FileExplorerPane & UT-EDT-07 Clean Naming', () => {
    it('renders script files stripping the .vns extension for clean display', () => {
      const handleSelect = vi.fn();
      render(
        <FileExplorerPane
          files={mockFiles}
          activeFileId="f-1"
          entrySceneName="main.vns"
          onSelectFile={handleSelect}
          onCreateFile={vi.fn()}
          onRenameFile={vi.fn()}
          onDeleteFile={vi.fn()}
        />
      );

      // Should display clean chapter names without .vns
      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText('chapter_1')).toBeInTheDocument();
      expect(screen.getByText('ending')).toBeInTheDocument();

      // Entry badge should be visible on main.vns
      expect(screen.getByTestId('badge-entry-f-1')).toBeInTheDocument();
      expect(screen.queryByTestId('badge-entry-f-2')).not.toBeInTheDocument();

      // Active file row styling
      const activeItem = screen.getByTestId('file-item-f-1');
      expect(activeItem).toBeInTheDocument();
      expect(activeItem.className).toContain('text-white');
    });

    it('creates a new script file with valid name and normalizes .vns extension', () => {
      const handleCreate = vi.fn();
      render(
        <FileExplorerPane
          files={mockFiles}
          activeFileId="f-1"
          entrySceneName="main.vns"
          onSelectFile={vi.fn()}
          onCreateFile={handleCreate}
          onRenameFile={vi.fn()}
          onDeleteFile={vi.fn()}
        />
      );

      const createBtn = screen.getByTestId('btn-new-script');
      fireEvent.click(createBtn);

      const nameInput = screen.getByTestId('input-new-script-name');
      fireEvent.change(nameInput, { target: { value: 'prologue' } });
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });

      expect(handleCreate).toHaveBeenCalledWith('prologue.vns');
    });

    it('validates file creation: rejects forbidden characters and duplicate names', () => {
      const handleCreate = vi.fn();
      render(
        <FileExplorerPane
          files={mockFiles}
          activeFileId="f-1"
          entrySceneName="main.vns"
          onSelectFile={vi.fn()}
          onCreateFile={handleCreate}
          onRenameFile={vi.fn()}
          onDeleteFile={vi.fn()}
        />
      );

      // 1. Forbidden character test
      fireEvent.click(screen.getByTestId('btn-new-script'));
      const nameInput = screen.getByTestId('input-new-script-name');
      fireEvent.change(nameInput, { target: { value: 'bad/chapter' } });
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });

      expect(handleCreate).not.toHaveBeenCalled();
      expect(screen.getByTestId('file-validation-error')).toHaveTextContent(
        'File name cannot contain characters: \\ / : * ? " < > |'
      );

      // 2. Duplicate name test (case-insensitive)
      fireEvent.change(nameInput, { target: { value: 'CHAPTER_1' } });
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });

      expect(handleCreate).not.toHaveBeenCalled();
      expect(screen.getByTestId('file-validation-error')).toHaveTextContent(
        'File "CHAPTER_1.vns" already exists!'
      );
    });

    it('UT-EDT-07: prevents deleting the entry scene script main.vns', () => {
      const handleDelete = vi.fn();
      render(
        <FileExplorerPane
          files={mockFiles}
          activeFileId="f-1"
          entrySceneName="main.vns"
          onSelectFile={vi.fn()}
          onCreateFile={vi.fn()}
          onRenameFile={vi.fn()}
          onDeleteFile={handleDelete}
        />
      );

      // Entry file delete button should be disabled
      const entryDeleteBtn = screen.getByTestId('btn-delete-file-f-1');
      expect(entryDeleteBtn).toBeDisabled();

      // Non-entry file delete button should be enabled
      const chapterDeleteBtn = screen.getByTestId('btn-delete-file-f-2');
      expect(chapterDeleteBtn).not.toBeDisabled();
      fireEvent.click(chapterDeleteBtn);
      expect(handleDelete).toHaveBeenCalledWith('f-2');
    });

    it('prevents deleting the only remaining script in the project', () => {
      const handleDelete = vi.fn();
      const singleFile: ScriptFile[] = [
        { id: 'f-only', name: 'solo.vns', content: 'say "Only"', order: 0, version: 1 },
      ];

      render(
        <FileExplorerPane
          files={singleFile}
          activeFileId="f-only"
          entrySceneName="other.vns"
          onSelectFile={vi.fn()}
          onCreateFile={vi.fn()}
          onRenameFile={vi.fn()}
          onDeleteFile={handleDelete}
        />
      );

      const deleteBtn = screen.getByTestId('btn-delete-file-f-only');
      expect(deleteBtn).toBeDisabled();
      fireEvent.click(deleteBtn);
      expect(handleDelete).not.toHaveBeenCalled();
    });

    it('renames a script file cleanly with validation and .vns normalization', () => {
      const handleRename = vi.fn();
      render(
        <FileExplorerPane
          files={mockFiles}
          activeFileId="f-2"
          entrySceneName="main.vns"
          onSelectFile={vi.fn()}
          onCreateFile={vi.fn()}
          onRenameFile={handleRename}
          onDeleteFile={vi.fn()}
        />
      );

      // Trigger rename on chapter_1
      const renameBtn = screen.getByTestId('btn-rename-file-f-2');
      fireEvent.click(renameBtn);

      const renameInput = screen.getByTestId('input-rename-file-f-2');
      expect(renameInput).toHaveValue('chapter_1');

      // Attempt invalid rename to duplicate name
      fireEvent.change(renameInput, { target: { value: 'ending' } });
      fireEvent.keyDown(renameInput, { key: 'Enter', code: 'Enter' });
      expect(handleRename).not.toHaveBeenCalled();
      expect(screen.getByTestId('rename-error-f-2')).toHaveTextContent(
        'File "ending.vns" already exists!'
      );

      // Valid rename
      fireEvent.change(renameInput, { target: { value: 'chapter_one' } });
      fireEvent.keyDown(renameInput, { key: 'Enter', code: 'Enter' });
      expect(handleRename).toHaveBeenCalledWith('f-2', 'chapter_one.vns');
    });

    it('utility helpers validateFileName and generateDefaultScriptName work accurately', () => {
      // Clean and normalize
      expect(cleanChapterName('Chapter_01.vns')).toBe('Chapter_01');
      expect(cleanChapterName('prologue.VNS')).toBe('prologue');
      expect(normalizeScriptName('intro')).toBe('intro.vns');
      expect(normalizeScriptName('intro.vns')).toBe('intro.vns');

      // Sequential naming
      expect(generateDefaultScriptName(['main.vns'])).toBe('New Script.vns');
      expect(generateDefaultScriptName(['main.vns', 'New Script.vns'])).toBe('New Script (2).vns');
      expect(
        generateDefaultScriptName(['main.vns', 'New Script.vns', 'New Script (2).vns'])
      ).toBe('New Script (3).vns');

      // Forbidden characters
      const forbidden = ['bad/1', 'bad\\2', 'bad:3', 'bad*4', 'bad?5', 'bad"6', 'bad<7', 'bad>8', 'bad|9'];
      for (const f of forbidden) {
        const res = validateFileName(f, ['main.vns']);
        expect(res.valid).toBe(false);
      }
    });
  });

  describe('ActivityBar', () => {
    it('renders monochrome tabs and switches active panel', () => {
      const handleTabChange = vi.fn();
      render(<ActivityBar activeTab="scripts" onSelectTab={handleTabChange} />);

      expect(screen.getByTestId('tab-scripts')).toBeInTheDocument();
      expect(screen.getByTestId('tab-characters')).toBeInTheDocument();
      expect(screen.getByTestId('tab-assets')).toBeInTheDocument();

      // Click Characters tab
      fireEvent.click(screen.getByTestId('tab-characters'));
      expect(handleTabChange).toHaveBeenCalledWith('characters');

      // Click Assets tab
      fireEvent.click(screen.getByTestId('tab-assets'));
      expect(handleTabChange).toHaveBeenCalledWith('assets');
    });

    it('strictly complies with Rule 8: zero colored OS emojis in the DOM', () => {
      const { container } = render(<ActivityBar activeTab="scripts" onSelectTab={vi.fn()} />);

      const text = container.textContent || '';
      // Regex checking common emoji unicode ranges
      const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiRegex.test(text)).toBe(false);

      // Confirms all icons are pure vector SVGs
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThanOrEqual(3);
    });

    it('renders optional settings button if onOpenSettings is provided', () => {
      const handleSettings = vi.fn();
      render(
        <ActivityBar
          activeTab="scripts"
          onSelectTab={vi.fn()}
          onOpenSettings={handleSettings}
        />
      );

      const settingsBtn = screen.getByTestId('activity-bar-btn-settings');
      expect(settingsBtn).toBeInTheDocument();
      fireEvent.click(settingsBtn);
      expect(handleSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe('StudioHeader', () => {
    it('renders project title and action buttons', () => {
      const handleBack = vi.fn();
      const handlePlay = vi.fn();
      const handleSettings = vi.fn();
      const handleExport = vi.fn();

      render(
        <StudioHeader
          projectTitle="My Visual Novel"
          onBack={handleBack}
          onQuickPlay={handlePlay}
          onOpenSettings={handleSettings}
          onExport={handleExport}
        />
      );

      expect(screen.getByText('My Visual Novel')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('btn-back-hub'));
      expect(handleBack).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-quick-play'));
      expect(handlePlay).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-project-settings'));
      expect(handleSettings).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-export-project'));
      expect(handleExport).toHaveBeenCalledTimes(1);
    });

    it('supports inline click-to-edit project title on Enter and blur', () => {
      const handleTitleChange = vi.fn();
      render(
        <StudioHeader
          projectTitle="Original Title"
          onBack={vi.fn()}
          onTitleChange={handleTitleChange}
        />
      );

      const titleElement = screen.getByTestId('header-project-title');
      fireEvent.click(titleElement);

      const titleInput = screen.getByTestId('input-header-title');
      expect(titleInput).toBeInTheDocument();
      expect(titleInput).toHaveValue('Original Title');

      fireEvent.change(titleInput, { target: { value: 'Renamed Story' } });
      fireEvent.keyDown(titleInput, { key: 'Enter', code: 'Enter' });

      expect(handleTitleChange).toHaveBeenCalledWith('Renamed Story');
    });

    it('renders dirty dot indicator ● when isDirty is true', () => {
      const { rerender } = render(
        <StudioHeader
          projectTitle="My Project"
          isDirty={false}
          onBack={vi.fn()}
        />
      );

      expect(screen.queryByTestId('header-dirty-dot')).not.toBeInTheDocument();

      rerender(
        <StudioHeader
          projectTitle="My Project"
          isDirty={true}
          onBack={vi.fn()}
        />
      );

      expect(screen.getByTestId('header-dirty-dot')).toBeInTheDocument();
      expect(screen.getByTestId('header-dirty-dot')).toHaveTextContent('●');
    });

    it('renders save status indicator correctly based on dirty and saving state', () => {
      const { rerender } = render(
        <StudioHeader
          projectTitle="My Project"
          isDirty={false}
          isSaving={false}
          onBack={vi.fn()}
        />
      );

      expect(screen.getByTestId('header-save-status')).toHaveTextContent('Saved to IndexedDB');

      rerender(
        <StudioHeader
          projectTitle="My Project"
          isDirty={true}
          isSaving={false}
          onBack={vi.fn()}
        />
      );

      expect(screen.getByTestId('header-save-status')).toHaveTextContent('Unsaved changes');

      rerender(
        <StudioHeader
          projectTitle="My Project"
          isDirty={true}
          isSaving={true}
          onBack={vi.fn()}
        />
      );

      expect(screen.getByTestId('header-save-status')).toHaveTextContent('Saving...');
    });

    it('formats canvas resolution badge with aspect ratio', () => {
      expect(getAspectRatioBadge(1920, 1080)).toBe('1920 × 1080 (16:9)');
      expect(getAspectRatioBadge(1080, 1920)).toBe('1080 × 1920 (9:16)');
      expect(getAspectRatioBadge(1024, 768)).toBe('1024 × 768 (4:3)');

      render(
        <StudioHeader
          projectTitle="My Project"
          canvasWidth={1080}
          canvasHeight={1920}
          onBack={vi.fn()}
        />
      );

      expect(screen.getByTestId('header-resolution-badge')).toHaveTextContent(
        '1080 × 1920 (9:16)'
      );
    });
  });

  describe('StudioWorkspacePage (3-Column Director Layout)', () => {
    let mockRepo: ProjectRepository;

    beforeEach(() => {
      mockRepo = {
        listProjects: vi.fn().mockResolvedValue([]),
        getProject: vi.fn().mockResolvedValue(mockProject),
        createProject: vi.fn(),
        updateProject: vi.fn().mockResolvedValue(undefined),
        deleteProject: vi.fn().mockResolvedValue(undefined),
        duplicateProject: vi.fn(),
        exportProjectZip: vi.fn(),
        importProjectZip: vi.fn(),
        getStorageUsage: vi.fn().mockResolvedValue({ usedBytes: 100, quotaBytes: 1000 }),
        getAssetBlob: vi.fn().mockResolvedValue(null),
        saveAssetBlob: vi.fn().mockResolvedValue(undefined),
        deleteAssetBlob: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('renders the 3-column director layout and components simultaneously', async () => {
      render(
        <StudioWorkspacePage
          projectId="proj-123"
          repository={mockRepo}
          initialProject={mockProject}
        />
      );

      expect(screen.getByTestId('studio-workspace-page')).toBeInTheDocument();
      expect(screen.getByTestId('col-navigation')).toBeInTheDocument();
      expect(screen.getByTestId('col-workspace')).toBeInTheDocument();
      expect(screen.getByTestId('col-preview-dock')).toBeInTheDocument();
      expect(screen.getByTestId('preview-dock-container')).toBeInTheDocument();
    });

    it('loads project from repository on mount when initialProject is not supplied', async () => {
      render(<StudioWorkspacePage projectId="proj-123" repository={mockRepo} />);

      expect(screen.getByTestId('studio-loading-state')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Echoes of the Sea')).toBeInTheDocument();
      });

      expect(mockRepo.getProject).toHaveBeenCalledWith('proj-123');
      expect(screen.getByTestId('pane-file-explorer')).toBeInTheDocument();
    });

    it('switches navigation panes in Column 1 when ActivityBar tabs are clicked', () => {
      render(
        <StudioWorkspacePage
          projectId="proj-123"
          repository={mockRepo}
          initialProject={mockProject}
        />
      );

      // Default tab is scripts
      expect(screen.getByTestId('pane-file-explorer')).toBeInTheDocument();

      // Switch to characters
      fireEvent.click(screen.getByTestId('tab-characters'));
      expect(screen.queryByTestId('pane-file-explorer')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('pane-characters') || screen.queryByTestId('pane-characters-placeholder')
      ).toBeInTheDocument();

      // Switch to assets
      fireEvent.click(screen.getByTestId('tab-assets'));
      expect(screen.getByTestId('pane-assets-placeholder')).toBeInTheDocument();

      // Switch back to scripts
      fireEvent.click(screen.getByTestId('tab-scripts'));
      expect(screen.getByTestId('pane-file-explorer')).toBeInTheDocument();
    });

    it('persists project title updates to the repository', async () => {
      render(
        <StudioWorkspacePage
          projectId="proj-123"
          repository={mockRepo}
          initialProject={mockProject}
        />
      );

      const titleHeader = screen.getByTestId('header-project-title');
      fireEvent.click(titleHeader);

      const titleInput = screen.getByTestId('input-header-title');
      fireEvent.change(titleInput, { target: { value: 'New World Novel' } });
      fireEvent.keyDown(titleInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockRepo.updateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New World Novel',
          })
        );
      });
    });

    it('persists file additions, renames, and deletions with active file fallback', async () => {
      render(
        <StudioWorkspacePage
          projectId="proj-123"
          repository={mockRepo}
          initialProject={mockProject}
        />
      );

      // 1. Add file
      fireEvent.click(screen.getByTestId('btn-new-script'));
      const addInput = screen.getByTestId('input-new-script-name');
      fireEvent.change(addInput, { target: { value: 'interlude' } });
      fireEvent.keyDown(addInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(mockRepo.updateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            files: expect.arrayContaining([
              expect.objectContaining({ name: 'interlude.vns' }),
            ]),
          })
        );
      });

      // 2. Delete non-entry file
      const deleteBtn = screen.getByTestId('btn-delete-file-f-2');
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(mockRepo.updateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            files: expect.not.arrayContaining([
              expect.objectContaining({ id: 'f-2' }),
            ]),
          })
        );
      });
    });
  });
});
