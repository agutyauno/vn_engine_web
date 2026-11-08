// @vitest-environment jsdom
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project, AssetRef, ScriptFile } from '@vn-engine/shared-types';
import { AssetLibraryPane } from '../../src/components/studio/AssetLibraryPane';
import { useEditorUIStore } from '../../src/core/stores/uiStore';
import {
  generateDiagnostics,
  computeReconciliationDiagnostics,
  type ScriptReferences,
} from '../../src/core/services/reconciliation';
import { normalizeCategoryTab } from '../../src/core/utils/assetCategories';

function createMockProject(options?: {
  assets?: AssetRef[];
  files?: ScriptFile[];
}): Project {
  return {
    id: 'test-proj-category-filter',
    title: 'Category Filter Test Project',
    version: 1,
    ownerId: 'test-user',
    defaultLanguage: 'vi',
    files: options?.files ?? [
      {
        id: 'file-1',
        name: 'main.vns',
        content: 'scene intro {\n  "Hello world"\n}\n',
        order: 0,
        version: 1,
      },
    ],
    characters: [],
    variables: [],
    uiScreens: [],
    customScripts: [],
    assets: options?.assets ?? [],
  };
}

describe('Phase 2.1: Asset Category Filter Normalization & Reconciliation Prefill (RED)', () => {
  beforeEach(() => {
    useEditorUIStore.setState({
      lastAssetCategory: 'all',
      assetViewMode: 'list',
    });
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  // ========================================================================
  // Utility Tests: normalizeCategoryTab
  // ========================================================================
  describe('Utility: normalizeCategoryTab', () => {
    it('normalizes singular "background" to plural "backgrounds"', () => {
      expect(normalizeCategoryTab('background')).toBe('backgrounds');
    });

    it('keeps plural "backgrounds" as "backgrounds"', () => {
      expect(normalizeCategoryTab('backgrounds')).toBe('backgrounds');
    });

    it('normalizes singular "sprite" to plural "sprites"', () => {
      expect(normalizeCategoryTab('sprite')).toBe('sprites');
    });

    it('keeps plural "sprites" as "sprites"', () => {
      expect(normalizeCategoryTab('sprites')).toBe('sprites');
    });

    it('normalizes undefined, null, and empty string to "all"', () => {
      expect(normalizeCategoryTab(undefined)).toBe('all');
      expect(normalizeCategoryTab(null)).toBe('all');
      expect(normalizeCategoryTab('')).toBe('all');
    });

    it('preserves other valid categories (audio, bgm, sfx, voice, ui, other)', () => {
      expect(normalizeCategoryTab('audio')).toBe('audio');
      expect(normalizeCategoryTab('bgm')).toBe('bgm');
      expect(normalizeCategoryTab('sfx')).toBe('sfx');
      expect(normalizeCategoryTab('voice')).toBe('voice');
      expect(normalizeCategoryTab('ui')).toBe('ui');
      expect(normalizeCategoryTab('other')).toBe('other');
    });
  });

  // ========================================================================
  // TC-CAT-01: AssetLibraryPane displays all assets with singular category 'background'
  // ========================================================================
  describe('TC-CAT-01: Backgrounds Filter Display', () => {
    it('displays all 11 background assets with category: "background" when selecting Backgrounds tab', () => {
      const backgroundAssets: AssetRef[] = Array.from({ length: 11 }, (_, i) => ({
        id: `bg-asset-${i + 1}`,
        name: `bg_scene_${i + 1}.png`,
        type: 'image',
        category: 'background',
        storageUrl: `blob:bg-${i + 1}`,
        sizeBytes: 102400,
      }));

      const extraAssets: AssetRef[] = [
        {
          id: 'bgm-asset-1',
          name: 'bgm_theme.mp3',
          type: 'audio',
          category: 'bgm',
          storageUrl: 'blob:bgm-1',
          sizeBytes: 524288,
        },
        {
          id: 'sprite-asset-1',
          name: 'char_alice_happy.png',
          type: 'image',
          category: 'sprite',
          storageUrl: 'blob:alice-1',
          sizeBytes: 204800,
        },
      ];

      const project = createMockProject({
        assets: [...backgroundAssets, ...extraAssets],
      });

      render(<AssetLibraryPane project={project} />);

      // Switch to Backgrounds tab
      const bgTabButton = screen.getByTestId('tab-asset-backgrounds');
      fireEvent.click(bgTabButton);

      // Verify all 11 background assets are displayed
      for (let i = 1; i <= 11; i++) {
        expect(screen.getByText(`bg_scene_${i}.png`)).toBeInTheDocument();
      }

      // Verify audio and sprite assets are not displayed
      expect(screen.queryByText('bgm_theme.mp3')).not.toBeInTheDocument();
      expect(screen.queryByText('char_alice_happy.png')).not.toBeInTheDocument();
    });

    it('displays all background assets when lastAssetCategory was initialized with singular "background"', () => {
      const backgroundAssets: AssetRef[] = Array.from({ length: 5 }, (_, i) => ({
        id: `bg-init-${i + 1}`,
        name: `bg_init_${i + 1}.png`,
        type: 'image',
        category: 'background',
        storageUrl: `blob:bg-init-${i + 1}`,
        sizeBytes: 102400,
      }));

      const project = createMockProject({ assets: backgroundAssets });

      // Simulate legacy or singular value stored in uiStore
      useEditorUIStore.setState({ lastAssetCategory: 'background' });

      render(<AssetLibraryPane project={project} />);

      // The UI must normalize 'background' to 'backgrounds' and display the assets
      for (let i = 1; i <= 5; i++) {
        expect(screen.getByText(`bg_init_${i}.png`)).toBeInTheDocument();
      }

      // The select dropdown must also reflect 'backgrounds'
      const selectElement = screen.getByTestId('select-asset-category-filter') as HTMLSelectElement;
      expect(selectElement.value).toBe('backgrounds');
    });
  });

  // ========================================================================
  // TC-CAT-02: Plural and Singular Tolerance in AssetLibraryPane
  // ========================================================================
  describe('TC-CAT-02: Plural and Singular Tolerance', () => {
    it('accommodates both singular "background" and plural "backgrounds" when activeTab is "backgrounds"', () => {
      const project = createMockProject({
        assets: [
          {
            id: 'ast-bg-singular',
            name: 'bg_forest_singular.png',
            type: 'image',
            category: 'background', // standard singular
            storageUrl: 'blob:bg-singular',
            sizeBytes: 102400,
          },
          {
            id: 'ast-bg-plural',
            name: 'bg_castle_plural.png',
            type: 'image',
            category: 'backgrounds' as any, // legacy plural
            storageUrl: 'blob:bg-plural',
            sizeBytes: 153600,
          },
          {
            id: 'ast-sprite-test',
            name: 'char_hero_idle.png',
            type: 'image',
            category: 'sprite',
            storageUrl: 'blob:hero',
            sizeBytes: 81920,
          },
          {
            id: 'ast-audio-test',
            name: 'bgm_battle.mp3',
            type: 'audio',
            category: 'bgm',
            storageUrl: 'blob:battle',
            sizeBytes: 409600,
          },
        ],
      });

      render(<AssetLibraryPane project={project} />);

      // Select Backgrounds category
      fireEvent.click(screen.getByTestId('tab-asset-backgrounds'));

      // Both singular and plural background assets MUST be visible
      expect(screen.getByText('bg_forest_singular.png')).toBeInTheDocument();
      expect(screen.getByText('bg_castle_plural.png')).toBeInTheDocument();

      // Non-background assets MUST NOT be visible
      expect(screen.queryByText('char_hero_idle.png')).not.toBeInTheDocument();
      expect(screen.queryByText('bgm_battle.mp3')).not.toBeInTheDocument();
    });

    it('accommodates both singular "sprite" and plural "sprites" when activeTab is "sprites"', () => {
      const project = createMockProject({
        assets: [
          {
            id: 'ast-sp-singular',
            name: 'char_alice_walk.png',
            type: 'image',
            category: 'sprite', // standard singular
            storageUrl: 'blob:alice-walk',
            sizeBytes: 90000,
          },
          {
            id: 'ast-sp-plural',
            name: 'char_bob_run.png',
            type: 'image',
            category: 'sprites' as any, // legacy plural
            storageUrl: 'blob:bob-run',
            sizeBytes: 95000,
          },
          {
            id: 'ast-bg-dummy',
            name: 'bg_classroom.png',
            type: 'image',
            category: 'background',
            storageUrl: 'blob:classroom',
            sizeBytes: 120000,
          },
        ],
      });

      render(<AssetLibraryPane project={project} />);

      // Select Sprites category
      fireEvent.click(screen.getByTestId('tab-asset-sprites'));

      // Both singular and plural sprite assets MUST be visible
      expect(screen.getByText('char_alice_walk.png')).toBeInTheDocument();
      expect(screen.getByText('char_bob_run.png')).toBeInTheDocument();

      // Background asset MUST NOT be visible
      expect(screen.queryByText('bg_classroom.png')).not.toBeInTheDocument();
    });
  });

  // ========================================================================
  // TC-CAT-03: Reconciliation QuickFix Prefill Category Fix
  // ========================================================================
  describe('TC-CAT-03: Reconciliation Prefill Category Fix', () => {
    it('generateDiagnostics generates quickFix.prefillData.category as "background" (singular) for uncreated background', () => {
      const project = createMockProject({
        files: [
          {
            id: 'file-chap1',
            name: 'chapter1.vns',
            content: [
              'scene intro {',
              '  background bg_forest',
              '  scene "bg_town.png"',
              '}',
            ].join('\n'),
            order: 0,
            version: 1,
          },
        ],
        assets: [], // No assets exist
      });

      const diagnostics = generateDiagnostics(project);

      // Verify diagnostic for bg_forest
      const forestDiag = diagnostics.find(d => d.assetKey === 'bg_forest');
      expect(forestDiag).toBeDefined();
      expect(forestDiag?.quickFix).toBeDefined();
      expect(forestDiag?.quickFix?.type).toBe('create_asset');
      expect(forestDiag?.quickFix?.prefillData).toMatchObject({
        name: 'bg_forest',
        category: 'background', // MUST be 'background' (singular), NOT 'backgrounds'
      });

      // Verify diagnostic for bg_town.png
      const townDiag = diagnostics.find(d => d.assetKey === 'bg_town.png');
      expect(townDiag).toBeDefined();
      expect(townDiag?.quickFix).toBeDefined();
      expect(townDiag?.quickFix?.type).toBe('create_asset');
      expect(townDiag?.quickFix?.prefillData).toMatchObject({
        name: 'bg_town.png',
        category: 'background', // MUST be 'background' (singular), NOT 'backgrounds'
      });
    });

    it('computeReconciliationDiagnostics generates quickFix.prefillData.category as "background" (singular)', () => {
      const files: ScriptFile[] = [
        {
          id: 'file-1',
          name: 'scene1.vns',
          content: 'scene garden {\n  background bg_garden\n}\n',
          order: 0,
          version: 1,
        },
      ];

      const cache = new Map<string, ScriptReferences>();
      const diagnostics = computeReconciliationDiagnostics(files, { assets: [] }, cache);

      const gardenDiag = diagnostics.find(d => d.assetKey === 'bg_garden');
      expect(gardenDiag).toBeDefined();
      expect(gardenDiag?.quickFix).toBeDefined();
      expect(gardenDiag?.quickFix?.type).toBe('create_asset');
      expect(gardenDiag?.quickFix?.prefillData).toMatchObject({
        name: 'bg_garden',
        category: 'background', // MUST be 'background' (singular), NOT 'backgrounds'
      });
    });
  });

  // ========================================================================
  // uiStore Category Normalization
  // ========================================================================
  describe('uiStore: setLastAssetCategory normalization', () => {
    it('normalizes singular category inputs to canonical tab names in state', () => {
      useEditorUIStore.getState().setLastAssetCategory('background');
      expect(useEditorUIStore.getState().lastAssetCategory).toBe('backgrounds');

      useEditorUIStore.getState().setLastAssetCategory('sprite');
      expect(useEditorUIStore.getState().lastAssetCategory).toBe('sprites');

      useEditorUIStore.getState().setLastAssetCategory('bgm');
      expect(useEditorUIStore.getState().lastAssetCategory).toBe('bgm');
    });
  });
});
