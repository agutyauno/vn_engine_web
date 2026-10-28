// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Project } from '@vn-engine/shared-types';
import { PreviewDock } from '../src/components/studio/PreviewDock';
import { StudioWorkspacePage } from '../src/components/studio/StudioWorkspacePage';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

const landscapeProject: Project = {
  id: 'proj-landscape',
  title: 'Landscape VN Project',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  displaySettings: {
    width: 1920,
    height: 1080,
    orientation: 'landscape',
  },
  files: [
    {
      id: 'file-1',
      name: 'main.vns',
      content: 'scene "bg_classroom.png"\n"Teacher" "Good morning!"\n',
      order: 0,
      version: 1,
    },
  ],
};

const portraitMobileProject: Project = {
  id: 'proj-mobile',
  title: 'Mobile Webtoon Project',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  displaySettings: {
    width: 1080,
    height: 1920,
    orientation: 'portrait',
  },
  files: [
    {
      id: 'file-1',
      name: 'main.vns',
      content: 'scene "bg_vertical.png"\n"Hero" "Vertical mobile adventure!"\n',
      order: 0,
      version: 1,
    },
  ],
};

describe('Milestone 8: Live Preview Dock (Column 3 Full-Height)', () => {
  describe('PreviewDock Component Unit Tests', () => {
    it('renders dock container and resolution badge for 16:9 Landscape', () => {
      render(
        <PreviewDock
          projectId="proj-landscape"
          canvasWidth={1920}
          canvasHeight={1080}
          isPlaying={false}
          isPopout={false}
          onTogglePlay={vi.fn()}
          onReload={vi.fn()}
          onTogglePopout={vi.fn()}
        />
      );

      expect(screen.getByTestId('preview-dock')).toBeInTheDocument();
      expect(screen.getByTestId('preview-resolution-badge')).toHaveTextContent(/1920 × 1080/);
      expect(screen.getByTestId('preview-standby-screen')).toBeInTheDocument();
    });

    it('renders locked aspect ratio for 9:16 Mobile Webtoon without squishing', () => {
      render(
        <PreviewDock
          projectId="proj-mobile"
          canvasWidth={1080}
          canvasHeight={1920}
          isPlaying={false}
          isPopout={false}
          onTogglePlay={vi.fn()}
          onReload={vi.fn()}
          onTogglePopout={vi.fn()}
        />
      );

      const container = screen.getByTestId('preview-dock-container');
      expect(container).toHaveStyle({ aspectRatio: '1080 / 1920' });
      expect(screen.getByTestId('preview-resolution-badge')).toHaveTextContent(/1080 × 1920/);
    });

    it('toggles play/pause state and renders iframe player when playing', () => {
      const handleTogglePlay = vi.fn();

      const { rerender } = render(
        <PreviewDock
          projectId="proj-landscape"
          canvasWidth={1920}
          canvasHeight={1080}
          isPlaying={false}
          isPopout={false}
          onTogglePlay={handleTogglePlay}
          onReload={vi.fn()}
          onTogglePopout={vi.fn()}
        />
      );

      // Standby before play
      expect(screen.getByTestId('btn-preview-play')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('btn-preview-play'));
      expect(handleTogglePlay).toHaveBeenCalledTimes(1);

      // Rerender as playing
      rerender(
        <PreviewDock
          projectId="proj-landscape"
          canvasWidth={1920}
          canvasHeight={1080}
          isPlaying={true}
          isPopout={false}
          previewUrl="http://localhost:3000/?mode=preview&projectId=proj-landscape"
          onTogglePlay={handleTogglePlay}
          onReload={vi.fn()}
          onTogglePopout={vi.fn()}
        />
      );

      expect(screen.getByTestId('preview-player-iframe')).toBeInTheDocument();
      expect(screen.getByTestId('btn-preview-pause')).toBeInTheDocument();
    });

    it('triggers reload and popout callbacks', () => {
      const handleReload = vi.fn();
      const handlePopout = vi.fn();

      render(
        <PreviewDock
          projectId="proj-landscape"
          canvasWidth={1920}
          canvasHeight={1080}
          isPlaying={true}
          isPopout={false}
          onTogglePlay={vi.fn()}
          onReload={handleReload}
          onTogglePopout={handlePopout}
        />
      );

      fireEvent.click(screen.getByTestId('btn-preview-reload'));
      expect(handleReload).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('btn-preview-popout'));
      expect(handlePopout).toHaveBeenCalledTimes(1);
    });

    it('displays popout standby indicator when in Pop-out Window mode', () => {
      render(
        <PreviewDock
          projectId="proj-landscape"
          canvasWidth={1920}
          canvasHeight={1080}
          isPlaying={true}
          isPopout={true}
          onTogglePlay={vi.fn()}
          onReload={vi.fn()}
          onTogglePopout={vi.fn()}
        />
      );

      expect(screen.getByTestId('preview-standby-screen')).toHaveTextContent(/Pop-out Window Active/i);
      expect(screen.queryByTestId('preview-player-iframe')).not.toBeInTheDocument();
    });

    it('strictly complies with Rule 8: zero colored OS emojis in the DOM', () => {
      const { container } = render(
        <PreviewDock
          projectId="proj-landscape"
          canvasWidth={1920}
          canvasHeight={1080}
          isPlaying={false}
          isPopout={false}
          onTogglePlay={vi.fn()}
          onReload={vi.fn()}
          onTogglePopout={vi.fn()}
        />
      );

      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(container.innerHTML).not.toMatch(emojiRegex);
    });
  });

  describe('StudioWorkspacePage Integration with PreviewDock', () => {
    let repo: IndexedDBProjectRepository;

    beforeEach(async () => {
      repo = new IndexedDBProjectRepository(`studio_m8_${Date.now()}_${Math.random()}`);
      await repo.createProject(landscapeProject);
    });

    it('activates preview when Quick Play button is clicked in header', async () => {
      render(
        <StudioWorkspacePage
          projectId={landscapeProject.id}
          repository={repo}
          initialProject={landscapeProject}
        />
      );

      expect(screen.getByTestId('preview-dock')).toBeInTheDocument();

      // Quick play button in StudioHeader
      const quickPlayBtn = screen.getByTestId('btn-quick-play');
      fireEvent.click(quickPlayBtn);

      await waitFor(() => {
        expect(screen.getByTestId('preview-player-iframe')).toBeInTheDocument();
      });
    });
  });
});
