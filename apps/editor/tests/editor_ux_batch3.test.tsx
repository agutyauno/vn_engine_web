// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { Project, AssetRef, EngineDiagnostic } from '@vn-engine/shared-types';
import { useEditorUIStore, initialUIState } from '../src/core/stores/uiStore';
import { AssetLibraryPane } from '../src/components/studio/AssetLibraryPane';
import { CreateAssetModal } from '../src/components/studio/CreateAssetModal';
import { syncMonacoMarkers, MONACO_MARKER_OWNER } from '../src/core/services/monacoMarkerBridge';
import { DockDrawer } from '../src/components/studio/DockDrawer';

function createMockProject(assets: AssetRef[] = []): Project {
  return {
    id: 'test-proj-b3',
    title: 'UX Batch 3 Test Project',
    version: 1,
    ownerId: 'tester',
    defaultLanguage: 'vi',
    files: [
      {
        id: 'main-file',
        name: 'main.vns',
        content: 'scene start {\n  alice: "Hello"\n}',
        order: 0,
        version: 1,
      },
    ],
    characters: [{ id: 'alice', name: 'Alice', sprites: {} }],
    assets,
    variables: [],
    uiScreens: [],
    customScripts: [],
  };
}

describe('Editor UX Enhancements (Batch 3) — Unit Tests (RED Phase)', () => {
  beforeEach(() => {
    localStorage.clear();
    useEditorUIStore.setState({
      ...initialUIState,
      lastAssetCategory: 'all',
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // TC-UX-B3-01: Asset category default & persistence
  describe('TC-UX-B3-01: Asset category default & persistence', () => {
    it('should default lastAssetCategory to "all" and persist updates to localStorage', () => {
      const state = useEditorUIStore.getState();
      expect(state.lastAssetCategory).toBe('all');
      expect(typeof state.setLastAssetCategory).toBe('function');

      state.setLastAssetCategory('bgm');
      expect(useEditorUIStore.getState().lastAssetCategory).toBe('bgm');
      expect(localStorage.getItem('vn_editor_last_asset_category')).toBe('bgm');
    });

    it('should initialize AssetLibraryPane category filter with uiStore.lastAssetCategory and update store on category change', () => {
      useEditorUIStore.getState().setLastAssetCategory('all');

      const mockAsset: AssetRef = {
        id: 'bg_classroom',
        name: 'Classroom',
        type: 'image',
        category: 'background',
        storageUrl: 'https://example.com/bg.png',
        sizeBytes: 1024,
      };
      const project = createMockProject([mockAsset]);

      render(<AssetLibraryPane project={project} />);

      const categorySelect = screen.getByTestId('select-asset-category-filter') as HTMLSelectElement;
      // Must be 'all' by default as specified in TASK-editor-ux-refinements-batch3
      expect(categorySelect.value).toBe('all');

      // Change category to 'bgm'
      fireEvent.change(categorySelect, { target: { value: 'bgm' } });

      // Expect store to reflect 'bgm' and localStorage to persist 'bgm'
      expect(useEditorUIStore.getState().lastAssetCategory).toBe('bgm');
      expect(localStorage.getItem('vn_editor_last_asset_category')).toBe('bgm');
    });
  });

  // TC-UX-B3-02: Preserve user-entered asset name on file selection
  describe('TC-UX-B3-02: Preserve user-entered asset name on file selection', () => {
    it('should NOT overwrite user-entered asset name when a new file is selected', () => {
      const handleSave = vi.fn();
      const handleClose = vi.fn();

      const { container } = render(
        <CreateAssetModal
          isOpen={true}
          initialFile={null}
          existingAssetIds={[]}
          onClose={handleClose}
          onSave={handleSave}
        />
      );

      const nameInput = screen.getByTestId('input-asset-name') as HTMLInputElement;

      // User manually enters a custom asset name before selecting a file
      fireEvent.change(nameInput, { target: { value: 'Custom Background Name' } });
      expect(nameInput.value).toBe('Custom Background Name');

      // Now select/upload a file named 'my_photo.png'
      const file = new File(['fake-png-content'], 'my_photo.png', { type: 'image/png' });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();

      fireEvent.change(fileInput, { target: { files: [file] } });

      // The asset name MUST remain the custom user-entered string, NOT overwritten with 'my_photo.png'
      expect(nameInput.value).toBe('Custom Background Name');
    });

    it('should auto-fill asset name from file if user has not entered a name yet', () => {
      const { container } = render(
        <CreateAssetModal
          isOpen={true}
          initialFile={null}
          existingAssetIds={[]}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );

      const nameInput = screen.getByTestId('input-asset-name') as HTMLInputElement;
      expect(nameInput.value).toBe('');

      const file = new File(['fake-png-content'], 'scenery_forest.png', { type: 'image/png' });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(nameInput.value).toBe('scenery_forest.png');
    });
  });

  // TC-UX-B3-03: Edit asset modal opens with prefilled info & locked ID
  describe('TC-UX-B3-03: Edit asset modal opens with prefilled info & locked ID', () => {
    it('should open edit modal with "Edit Asset" title, locked ID, and prefilled fields when clicking edit button', async () => {
      const mockAsset: AssetRef = {
        id: 'bg_school_hallway',
        name: 'School Hallway Day',
        type: 'image',
        category: 'background',
        storageUrl: 'https://cdn.example.com/hallway.png',
        sizeBytes: 2048,
      };
      const project = createMockProject([mockAsset]);

      render(<AssetLibraryPane project={project} />);

      // Find the Edit button (btn-edit-asset) for the asset
      const editButton = screen.getByTestId('btn-edit-asset');
      expect(editButton).toBeInTheDocument();
      fireEvent.click(editButton);

      // Modal should open with "Edit Asset" heading
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit asset/i })).toBeInTheDocument();
      });

      // Asset ID must be disabled to protect script references
      const idInput = screen.getByTestId('input-asset-id') as HTMLInputElement;
      expect(idInput).toBeDisabled();
      expect(idInput.value).toBe('bg_school_hallway');

      // Asset Name and Category should be prefilled
      const nameInput = screen.getByTestId('input-asset-name') as HTMLInputElement;
      expect(nameInput.value).toBe('School Hallway Day');

      const categorySelect = screen.getByTestId('select-asset-category') as HTMLSelectElement;
      expect(categorySelect.value).toBe('background');
    });
  });

  // TC-UX-B3-04: Save modified asset
  describe('TC-UX-B3-04: Save modified asset', () => {
    it('should allow modifying name and category in edit mode and invoke onSave with updated asset data', () => {
      const handleSave = vi.fn();
      const existingAsset: AssetRef = {
        id: 'bgm_peaceful_day',
        name: 'Peaceful Day',
        type: 'audio',
        category: 'bgm',
        storageUrl: 'https://cdn.example.com/peaceful.mp3',
        sizeBytes: 5000,
      };

      // Render CreateAssetModal in edit mode with existing asset
      render(
        <CreateAssetModal
          isOpen={true}
          initialFile={null}
          initialAsset={existingAsset}
          isEditMode={true}
          existingAssetIds={['bgm_peaceful_day', 'sfx_bell']}
          onClose={vi.fn()}
          onSave={handleSave}
        />
      );

      // Verify ID is locked
      const idInput = screen.getByTestId('input-asset-id') as HTMLInputElement;
      expect(idInput).toBeDisabled();
      expect(idInput.value).toBe('bgm_peaceful_day');

      // Update name
      const nameInput = screen.getByTestId('input-asset-name');
      fireEvent.change(nameInput, { target: { value: 'Peaceful Day (Orchestral)' } });

      // Update category
      const categorySelect = screen.getByTestId('select-asset-category');
      fireEvent.change(categorySelect, { target: { value: 'other' } });

      // Submit changes
      const saveBtn = screen.getByTestId('btn-save-asset');
      expect(saveBtn).not.toBeDisabled();
      fireEvent.click(saveBtn);

      expect(handleSave).toHaveBeenCalledTimes(1);
      const savedAsset = handleSave.mock.calls[0]?.[0] as AssetRef;
      expect(savedAsset.id).toBe('bgm_peaceful_day');
      expect(savedAsset.name).toBe('Peaceful Day (Orchestral)');
      expect(savedAsset.category).toBe('other');
    });
  });

  // TC-UX-B3-05: Monaco markers filter out unused asset warnings
  describe('TC-UX-B3-05: Monaco markers filter out unused asset warnings', () => {
    it('should filter out unused asset diagnostics and inventory diagnostics without fileId from Monaco markers', () => {
      const setModelMarkersSpy = vi.fn();
      const mockMonaco = {
        editor: {
          setModelMarkers: setModelMarkersSpy,
        },
        MarkerSeverity: {
          Info: 1,
          Warning: 2,
          Error: 3,
        },
      } as any;

      const mockModel = {
        getLineCount: vi.fn(() => 20),
        getLineMaxColumn: vi.fn(() => 80),
      } as any;

      const diagnostics: EngineDiagnostic[] = [
        {
          id: 'diag-syntax-err-1',
          fileId: 'chapter1.vns',
          line: 4,
          col: 10,
          severity: 'error',
          message: 'Unexpected token at line 4',
          category: 'compiler',
          timestamp: 1000,
        },
        {
          id: 'diag-unused-asset-bg_forest',
          fileId: undefined, // Project-level inventory warning, no fileId
          line: 1,
          col: 1,
          severity: 'info',
          message: "Unused asset 'bg_forest.png' detected in project inventory.",
          category: 'asset',
          timestamp: 1001,
        },
        {
          id: 'diag-unused-asset-bgm_theme',
          fileId: undefined,
          line: 1,
          col: 1,
          severity: 'info',
          message: "Unused asset 'bgm_theme.mp3' detected in project inventory.",
          category: 'asset',
          timestamp: 1002,
        },
      ];

      syncMonacoMarkers({
        monacoInstance: mockMonaco,
        model: mockModel,
        activeFileId: 'chapter1.vns',
        diagnostics,
      });

      expect(setModelMarkersSpy).toHaveBeenCalledTimes(1);
      const call = setModelMarkersSpy.mock.calls[0]!;
      const [modelArg, ownerArg, markersArg] = call;
      expect(modelArg).toBe(mockModel);
      expect(ownerArg).toBe(MONACO_MARKER_OWNER);

      // Only the syntax error from chapter1.vns should produce a marker
      expect(markersArg).toHaveLength(1);
      expect(markersArg[0].message).toBe('Unexpected token at line 4');
      expect(markersArg[0].startLineNumber).toBe(4);

      // Neither of the unused asset diagnostics should be in markers
      const unusedMarkers = markersArg.filter((m: any) =>
        m.message.toLowerCase().includes('unused asset')
      );
      expect(unusedMarkers).toHaveLength(0);
    });
  });

  // TC-UX-B3-06: DockDrawer smooth resizing
  describe('TC-UX-B3-06: DockDrawer smooth resizing', () => {
    it('should NOT contain "transition-all duration-150" class on the drawer container to ensure smooth 60fps resizing', () => {
      render(
        <DockDrawer
          isOpen={true}
          errorCount={0}
          height={220}
          onToggleDrawer={vi.fn()}
        >
          <div>Drawer Content</div>
        </DockDrawer>
      );

      const drawer = screen.getByTestId('dock-drawer');
      expect(drawer).toBeInTheDocument();

      // Drawer container must not have lag-inducing transition-all duration-150 classes
      expect(drawer.className).not.toContain('transition-all duration-150');
      expect(drawer.className).not.toContain('transition-all');
      expect(drawer.className).not.toContain('duration-150');
    });
  });
});
