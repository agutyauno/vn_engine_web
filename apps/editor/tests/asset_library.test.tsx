// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project } from '@vn-engine/shared-types';
import {
  scanActiveReconciliation,
  checkAssetDeletionSafety,
  type ReconciliationReport,
} from '../src/core/services/reconciliation';
import { SafeDeleteModal } from '../src/components/studio/SafeDeleteModal';
import { AssetLibraryPane } from '../src/components/studio/AssetLibraryPane';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

describe('Milestone 5: Asset Library & Safe Delete', () => {
  const sampleProject: Project = {
    id: 'proj-123',
    title: 'Test VN Project',
    version: 1,
    ownerId: 'user-1',
    defaultLanguage: 'vi',
    files: [
      {
        id: 'file-chap1',
        name: 'chapter1.vns',
        order: 0,
        version: 1,
        content: `
scene "bg_classroom.png"
show alice.happy
show bob.happy
play music "bg_rain.mp3"
"Alice" "Xin chào buổi sáng!"
`,
      },
      {
        id: 'file-chap2',
        name: 'chapter2.vns',
        order: 1,
        version: 1,
        content: `
scene "bg_school.png"
show alice.smile
play music "bg_rain.mp3"
"Alice" "Lại mưa rồi."
`,
      },
    ],
    characters: [
      {
        id: 'alice',
        name: 'Alice Carroll',
        colorHex: '#e91e63',
        defaultExpression: 'happy',
        sprites: {
          happy: 'asset-alice-happy',
          smile: 'asset-alice-smile',
        },
      },
    ],
    variables: [],
    assets: [
      {
        id: 'ast-bg-class',
        name: 'bg_classroom.png',
        type: 'image',
        storageUrl: 'blob:bg-classroom',
        sizeBytes: 102400,
      },
      {
        id: 'ast-bg-school',
        name: 'bg_school.png',
        type: 'image',
        storageUrl: 'blob:bg-school',
        sizeBytes: 204800,
      },
      {
        id: 'ast-audio-rain',
        name: 'bg_rain.mp3',
        type: 'audio',
        storageUrl: 'blob:bg-rain',
        sizeBytes: 524288,
      },
      {
        id: 'ast-unused',
        name: 'unused_bg.png',
        type: 'image',
        storageUrl: 'blob:unused',
        sizeBytes: 65536,
      },
    ],
    uiScreens: [],
    customScripts: [],
  };

  // ========================================================================
  // UT-EDT-03: Quét AST phát hiện tài nguyên chưa tạo
  // ========================================================================
  describe('UT-EDT-03: scanActiveReconciliation detects uncreated resources', () => {
    it('detects uncreated character "bob" and uncreated assets', () => {
      const proj: Project = {
        ...sampleProject,
        assets: [
          sampleProject.assets[0]!,
          sampleProject.assets[1]!,
          sampleProject.assets[3]!,
        ],
      };

      const report: ReconciliationReport = scanActiveReconciliation(proj);

      expect(report.uncreatedCharacters).toContain('bob');
      expect(report.uncreatedAssets).toContain('bg_rain.mp3');
      expect(report.uncreatedCharacters).not.toContain('alice');
      expect(report.uncreatedAssets).not.toContain('bg_classroom.png');
    });
  });

  // ========================================================================
  // UT-EDT-04: Quét AST phát hiện tài nguyên dư thừa (Unused Assets)
  // ========================================================================
  describe('UT-EDT-04: scanActiveReconciliation detects unused assets', () => {
    it('detects unused_bg.png as unused in database', () => {
      const report: ReconciliationReport = scanActiveReconciliation(sampleProject);

      expect(report.unusedAssets).toContain('unused_bg.png');
      expect(report.unusedAssets).not.toContain('bg_classroom.png');
      expect(report.unusedAssets).not.toContain('bg_school.png');
      expect(report.unusedAssets).not.toContain('bg_rain.mp3');
    });
  });

  // ========================================================================
  // UT-EDT-05: Chặn xóa Asset đang được kịch bản tham chiếu (Safe Delete)
  // ========================================================================
  describe('UT-EDT-05: checkAssetDeletionSafety blocks deletion of referenced assets', () => {
    it('blocks deletion of bg_school.png and returns references list', () => {
      const result = checkAssetDeletionSafety('bg_school.png', sampleProject);

      expect(result.safe).toBe(false);
      expect(result.references.length).toBeGreaterThanOrEqual(1);
      expect(result.references[0]?.file).toBe('chapter2.vns');
      expect(result.error).toMatch(/referenced/i);
    });

    it('blocks deletion when querying by asset id "ast-bg-school"', () => {
      const result = checkAssetDeletionSafety('ast-bg-school', sampleProject);

      expect(result.safe).toBe(false);
      expect(result.references.length).toBeGreaterThanOrEqual(1);
    });

    it('allows safe deletion of unused asset "unused_bg.png"', () => {
      const result = checkAssetDeletionSafety('unused_bg.png', sampleProject);

      expect(result.safe).toBe(true);
      expect(result.references).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('SafeDeleteModal renders dependency block and disables delete button when asset is referenced', () => {
      const handleDelete = vi.fn();
      const handleClose = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={sampleProject.assets.find((a) => a.name === 'bg_school.png')!}
          project={sampleProject}
          onClose={handleClose}
          onConfirmDelete={handleDelete}
        />
      );

      // Warning should be displayed
      expect(screen.getByTestId('safe-delete-modal')).toBeInTheDocument();
      expect(screen.getAllByText(/Cannot delete asset/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/chapter2.vns/i)).toBeInTheDocument();

      // Delete button must be disabled
      const deleteBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(deleteBtn).toBeDisabled();

      fireEvent.click(deleteBtn);
      expect(handleDelete).not.toHaveBeenCalled();
    });

    it('SafeDeleteModal allows deletion when asset is unused', () => {
      const handleDelete = vi.fn();
      const handleClose = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={sampleProject.assets.find((a) => a.name === 'unused_bg.png')!}
          project={sampleProject}
          onClose={handleClose}
          onConfirmDelete={handleDelete}
        />
      );

      expect(screen.getByTestId('safe-delete-modal')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

      const deleteBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(deleteBtn).not.toBeDisabled();

      fireEvent.click(deleteBtn);
      expect(handleDelete).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // UT-EDT-06: Thay thế file nguồn Asset giữ nguyên ID (Replace File)
  // ========================================================================
  describe('UT-EDT-06: Replace file preserving asset ID in repository and UI', () => {
    let repo: IndexedDBProjectRepository;

    beforeEach(() => {
      repo = new IndexedDBProjectRepository(`test_db_${Date.now()}_${Math.random()}`);
    });

    it('replaces asset file blob in IndexedDB while preserving exact asset ID', async () => {
      await repo.createProject(sampleProject);

      const targetAsset = sampleProject.assets.find((a) => a.id === 'ast-audio-rain')!;
      const originalId = targetAsset.id; // 'ast-audio-rain'

      // Save initial blob
      const originalBlob = new Blob(['original-audio-content'], { type: 'audio/mp3' });
      await repo.saveAssetBlob(originalId, originalBlob);

      const fetchedBlobBefore = await repo.getAssetBlob(originalId);
      expect(fetchedBlobBefore).not.toBeNull();

      // Replace with new blob
      const newBlob = new Blob(['new-remastered-audio-content'], { type: 'audio/mp3' });
      await repo.saveAssetBlob(originalId, newBlob);

      // Verify blob content updated under the SAME asset ID
      const fetchedBlobAfter = await repo.getAssetBlob(originalId);
      expect(fetchedBlobAfter).not.toBeNull();

      // Update project asset metadata (e.g. sizeBytes)
      const updatedProject: Project = {
        ...sampleProject,
        assets: sampleProject.assets.map((a) =>
          a.id === originalId ? { ...a, sizeBytes: newBlob.size, version: (a.version || 1) + 1 } : a
        ),
      };
      await repo.updateProject(updatedProject);

      const reloadedProj = await repo.getProject(sampleProject.id);
      const reloadedAsset = reloadedProj?.assets.find((a) => a.id === originalId);
      expect(reloadedAsset).toBeDefined();
      expect(reloadedAsset!.id).toBe('ast-audio-rain'); // ID preserved 100%
      expect(reloadedAsset!.sizeBytes).toBe(newBlob.size);
    });
  });

  // ========================================================================
  // IT-EDT-02: 1-Click Quick Fix tạo nhanh Asset
  // ========================================================================
  describe('IT-EDT-02: Quick Fix creates asset with pre-populated name', () => {
    it('pre-populates asset name when triggered with quickFixAssetName prop', () => {
      const onAddAsset = vi.fn();
      render(
        <AssetLibraryPane
          project={sampleProject}
          quickFixAssetName="bg_sunset.png"
          onAddAsset={onAddAsset}
          onReplaceAsset={vi.fn()}
          onDeleteAsset={vi.fn()}
        />
      );

      const quickFixBadge = screen.getByTestId('quickfix-pending-badge');
      expect(quickFixBadge).toBeInTheDocument();
      expect(quickFixBadge).toHaveTextContent('bg_sunset.png');
    });
  });

  // ========================================================================
  // AssetLibraryPane UI Tests: Tabs, Search, List, Replace, Delete trigger
  // ========================================================================
  describe('AssetLibraryPane component UI', () => {
    it('renders tabs: Backgrounds, Audio, Sprites and filters assets correctly', () => {
      render(
        <AssetLibraryPane
          project={sampleProject}
          onAddAsset={vi.fn()}
          onReplaceAsset={vi.fn()}
          onDeleteAsset={vi.fn()}
        />
      );

      // Verify tabs exist
      expect(screen.getByTestId('tab-asset-backgrounds')).toBeInTheDocument();
      expect(screen.getByTestId('tab-asset-audio')).toBeInTheDocument();
      expect(screen.getByTestId('tab-asset-sprites')).toBeInTheDocument();

      // Default tab is Backgrounds
      expect(screen.getByText('bg_classroom.png')).toBeInTheDocument();
      expect(screen.getByText('bg_school.png')).toBeInTheDocument();
      expect(screen.queryByText('bg_rain.mp3')).not.toBeInTheDocument();

      // Switch to Audio tab
      fireEvent.click(screen.getByTestId('tab-asset-audio'));
      expect(screen.getByText('bg_rain.mp3')).toBeInTheDocument();
      expect(screen.queryByText('bg_classroom.png')).not.toBeInTheDocument();

      // Search filter
      const searchInput = screen.getByTestId('input-asset-search');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      expect(screen.queryByText('bg_rain.mp3')).not.toBeInTheDocument();
      expect(screen.getByText(/No assets found/i)).toBeInTheDocument();
    });

    it('opens SafeDeleteModal when delete button is clicked on an asset item', () => {
      render(
        <AssetLibraryPane
          project={sampleProject}
          onAddAsset={vi.fn()}
          onReplaceAsset={vi.fn()}
          onDeleteAsset={vi.fn()}
        />
      );

      // Find delete button for bg_classroom.png
      const deleteButtons = screen.getAllByTestId('btn-delete-asset');
      fireEvent.click(deleteButtons[0]!);

      // SafeDeleteModal should open
      expect(screen.getByTestId('safe-delete-modal')).toBeInTheDocument();
    });

    it('triggers replace file input when replace button is clicked', () => {
      const handleReplace = vi.fn();
      render(
        <AssetLibraryPane
          project={sampleProject}
          onAddAsset={vi.fn()}
          onReplaceAsset={handleReplace}
          onDeleteAsset={vi.fn()}
        />
      );

      const replaceButtons = screen.getAllByTestId('btn-replace-asset');
      expect(replaceButtons.length).toBeGreaterThan(0);
      fireEvent.click(replaceButtons[0]!);

      // Verify replace file trigger
      expect(screen.getByTestId('asset-replace-file-input')).toBeInTheDocument();
    });
  });
});
