// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Project } from '@vn-engine/shared-types';
import { ProjectSettingsModal } from '../src/components/studio/ProjectSettingsModal';
import { ExportWizardModal } from '../src/components/studio/ExportWizardModal';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

const sampleProject: Project = {
  id: 'proj-settings-test',
  title: 'Settings & Export Project',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  displaySettings: {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
  },
  files: [
    {
      id: 'file-1',
      name: 'main.vns',
      content: 'scene "bg_classroom.png"\n"Teacher" "Hello!"\n',
      order: 0,
      version: 1,
    },
  ],
};

describe('Milestone 9: Project Settings & Export Wizard', () => {
  // ========================================================================
  // 1. ProjectSettingsModal Unit Tests
  // ========================================================================
  describe('ProjectSettingsModal Component', () => {
    it('renders 4 tabs: General, Display, Editor, Gameplay', () => {
      render(
        <ProjectSettingsModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByTestId('modal-project-settings')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings-general')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings-display')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings-editor')).toBeInTheDocument();
      expect(screen.getByTestId('tab-settings-gameplay')).toBeInTheDocument();
    });

    it('modifies General tab inputs and updates title', () => {
      const handleSave = vi.fn();

      render(
        <ProjectSettingsModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      const titleInput = screen.getByTestId('input-settings-title');
      expect(titleInput).toHaveValue('Settings & Export Project');

      fireEvent.change(titleInput, { target: { value: 'Updated Novel Title' } });
      fireEvent.click(screen.getByTestId('btn-save-settings'));

      expect(handleSave).toHaveBeenCalledTimes(1);
      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Novel Title',
        })
      );
    });

    it('switches to Display tab and selects Portrait 1080x1920 preset', () => {
      const handleSave = vi.fn();

      render(
        <ProjectSettingsModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      // Switch to display tab
      fireEvent.click(screen.getByTestId('tab-settings-display'));

      // Click portrait 9:16 preset button
      const portraitPresetBtn = screen.getByTestId('preset-portrait-mobile');
      fireEvent.click(portraitPresetBtn);

      fireEvent.click(screen.getByTestId('btn-save-settings'));

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          displaySettings: expect.objectContaining({
            width: 1080,
            height: 1920,
            orientation: 'portrait',
          }),
        })
      );
    });

    it('switches to Editor tab and toggles auto-save debounce time', () => {
      const handleSave = vi.fn();

      render(
        <ProjectSettingsModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      fireEvent.click(screen.getByTestId('tab-settings-editor'));

      const debounceInput = screen.getByTestId('input-settings-autosave-debounce');
      fireEvent.change(debounceInput, { target: { value: '2500' } });

      fireEvent.click(screen.getByTestId('btn-save-settings'));

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          editorSettings: expect.objectContaining({
            autoSaveDebounceMs: 2500,
          }),
        })
      );
    });

    it('switches to Gameplay tab and adjusts volume sliders', () => {
      const handleSave = vi.fn();

      render(
        <ProjectSettingsModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      fireEvent.click(screen.getByTestId('tab-settings-gameplay'));

      const bgmSlider = screen.getByTestId('slider-settings-bgm');
      fireEvent.change(bgmSlider, { target: { value: '75' } });

      fireEvent.click(screen.getByTestId('btn-save-settings'));

      expect(handleSave).toHaveBeenCalledWith(
        expect.objectContaining({
          gameplaySettings: expect.objectContaining({
            defaultVolumes: expect.objectContaining({
              bgm: 75,
            }),
          }),
        })
      );
    });

    it('strictly satisfies Rule 8: zero colored OS emojis in DOM', () => {
      const { container } = render(
        <ProjectSettingsModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });

  // ========================================================================
  // 2. ExportWizardModal Unit Tests
  // ========================================================================
  describe('ExportWizardModal Component', () => {
    it('renders export targets: Web ZIP, Desktop Electron, Project Backup', () => {
      render(
        <ExportWizardModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByTestId('modal-export-wizard')).toBeInTheDocument();
      expect(screen.getByTestId('export-target-web')).toBeInTheDocument();
      expect(screen.getByTestId('export-target-desktop')).toBeInTheDocument();
      expect(screen.getByTestId('export-target-backup')).toBeInTheDocument();
    });

    it('triggers onExport with selected target format', () => {
      const handleExport = vi.fn();

      render(
        <ExportWizardModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onExport={handleExport}
        />
      );

      // Select Desktop target
      fireEvent.click(screen.getByTestId('export-target-desktop'));

      // Click download button
      fireEvent.click(screen.getByTestId('btn-export-download'));

      expect(handleExport).toHaveBeenCalledTimes(1);
      expect(handleExport).toHaveBeenCalledWith('desktop');
    });

    it('strictly satisfies Rule 8: zero colored OS emojis in DOM', () => {
      const { container } = render(
        <ExportWizardModal
          isOpen={true}
          project={sampleProject}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });

  // ========================================================================
  // 3. StudioWorkspacePage Integration with Modals
  // ========================================================================
  describe('StudioWorkspacePage Integration with Settings & Export Modals', () => {
    let repo: IndexedDBProjectRepository;

    beforeEach(async () => {
      repo = new IndexedDBProjectRepository(`studio_m9_${Date.now()}_${Math.random()}`);
      await repo.createProject(sampleProject);
    });

    it('opens ProjectSettingsModal from header button and persists updates', async () => {
      render(
        <StudioWorkspacePage
          projectId={sampleProject.id}
          repository={repo}
          initialProject={sampleProject}
        />
      );

      const settingsBtn = screen.getByTestId('btn-project-settings');
      fireEvent.click(settingsBtn);

      expect(screen.getByTestId('modal-project-settings')).toBeInTheDocument();

      // Change title
      const titleInput = screen.getByTestId('input-settings-title');
      fireEvent.change(titleInput, { target: { value: 'Brand New Title' } });

      fireEvent.click(screen.getByTestId('btn-save-settings'));

      // Modal closes and header displays new title
      await waitFor(() => {
        expect(screen.queryByTestId('modal-project-settings')).not.toBeInTheDocument();
        expect(screen.getByTestId('header-project-title')).toHaveTextContent('Brand New Title');
      });

      // Verify persisted to IndexedDB repository
      const loaded = await repo.getProject(sampleProject.id);
      expect(loaded?.title).toBe('Brand New Title');
    });

    it('opens ExportWizardModal from header Export button', async () => {
      render(
        <StudioWorkspacePage
          projectId={sampleProject.id}
          repository={repo}
          initialProject={sampleProject}
        />
      );

      const exportBtn = screen.getByTestId('btn-export-project');
      fireEvent.click(exportBtn);

      expect(screen.getByTestId('modal-export-wizard')).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByTestId('btn-close-export'));
      expect(screen.queryByTestId('modal-export-wizard')).not.toBeInTheDocument();
    });
  });
});
