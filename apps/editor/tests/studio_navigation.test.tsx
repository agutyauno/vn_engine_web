import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ScriptFile } from '@vn-engine/shared-types';
import { FileExplorerPane } from '../src/components/studio/FileExplorerPane';
import { ActivityBar } from '../src/components/studio/ActivityBar';
import { StudioHeader } from '../src/components/studio/StudioHeader';

describe('Studio Shell & Navigation (E-Phase 3 TDD)', () => {
  const mockFiles: ScriptFile[] = [
    { id: 'f-1', name: 'main.vns', content: 'say "Welcome"', order: 0, version: 1 },
    { id: 'f-2', name: 'chapter_1.vns', content: 'say "Chapter 1"', order: 1, version: 1 },
    { id: 'f-3', name: 'ending.vns', content: 'say "Ending"', order: 2, version: 1 },
  ];

  describe('FileExplorerPane', () => {
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

      // Should display clean names
      expect(screen.getByText('main')).toBeInTheDocument();
      expect(screen.getByText('chapter_1')).toBeInTheDocument();
      expect(screen.getByText('ending')).toBeInTheDocument();

      // Entry badge should be visible on main
      expect(screen.getByTestId('badge-entry-f-1')).toBeInTheDocument();
      expect(screen.queryByTestId('badge-entry-f-2')).not.toBeInTheDocument();
    });

    it('creates a new script file with valid name', () => {
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

      // Input appears for new script name
      const nameInput = screen.getByTestId('input-new-script-name');
      fireEvent.change(nameInput, { target: { value: 'prologue' } });
      fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });

      expect(handleCreate).toHaveBeenCalledWith('prologue.vns');
    });

    it('UT-EDT-07: prevents deleting the entry scene script', () => {
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

      // The entry file delete button should either be disabled or clicking it should show error and not call onDelete
      const entryDeleteBtn = screen.getByTestId('btn-delete-file-f-1');
      expect(entryDeleteBtn).toBeDisabled();

      // Deleting a non-entry file is enabled
      const chapterDeleteBtn = screen.getByTestId('btn-delete-file-f-2');
      expect(chapterDeleteBtn).not.toBeDisabled();
      fireEvent.click(chapterDeleteBtn);
      expect(handleDelete).toHaveBeenCalledWith('f-2');
    });

    it('renames a script file cleanly', () => {
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
      fireEvent.change(renameInput, { target: { value: 'chapter_one' } });
      fireEvent.keyDown(renameInput, { key: 'Enter', code: 'Enter' });

      expect(handleRename).toHaveBeenCalledWith('f-2', 'chapter_one.vns');
    });
  });

  describe('ActivityBar', () => {
    it('renders monochrome tabs and switches active panel', () => {
      const handleTabChange = vi.fn();
      render(
        <ActivityBar
          activeTab="scripts"
          onSelectTab={handleTabChange}
        />
      );

      expect(screen.getByTestId('tab-scripts')).toBeInTheDocument();
      expect(screen.getByTestId('tab-characters')).toBeInTheDocument();
      expect(screen.getByTestId('tab-assets')).toBeInTheDocument();

      // Click Characters tab
      fireEvent.click(screen.getByTestId('tab-characters'));
      expect(handleTabChange).toHaveBeenCalledWith('characters');
    });
  });

  describe('StudioHeader', () => {
    it('renders project title and action buttons', () => {
      const handleBack = vi.fn();
      const handlePlay = vi.fn();
      const handleSettings = vi.fn();

      render(
        <StudioHeader
          projectTitle="My Visual Novel"
          onBack={handleBack}
          onQuickPlay={handlePlay}
          onOpenSettings={handleSettings}
        />
      );

      expect(screen.getByText('My Visual Novel')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('btn-back-hub'));
      expect(handleBack).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-quick-play'));
      expect(handlePlay).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-project-settings'));
      expect(handleSettings).toHaveBeenCalledTimes(1);
    });
  });
});
