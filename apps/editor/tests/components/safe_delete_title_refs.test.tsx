// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Project, AssetRef } from '@vn-engine/shared-types';
import type { ProjectRepository } from '../../src/core/contracts/repository';
import { SafeDeleteModal } from '../../src/components/studio/SafeDeleteModal';
import { useProjectStore } from '../../src/core/stores/projectStore';
import { setupTestStore } from '../testStoreHelpers';
import {
  getTitleAssetRoles,
  removeAssetFromTitleSettings,
  type TitleAssetRole,
} from '../../src/core/utils/titleSettings';

const logoAsset: AssetRef = {
  id: 'img_logo',
  name: 'logo.png',
  type: 'image',
  category: 'ui',
  storageUrl: 'blob:logo',
  sizeBytes: 10240,
};

const bgAsset: AssetRef = {
  id: 'img_bg',
  name: 'bg_title.png',
  type: 'image',
  category: 'background',
  storageUrl: 'blob:bg',
  sizeBytes: 204800,
};

const bgmAsset: AssetRef = {
  id: 'aud_theme',
  name: 'theme.mp3',
  type: 'audio',
  category: 'bgm',
  storageUrl: 'blob:theme',
  sizeBytes: 307200,
};

const scriptAndLogoAsset: AssetRef = {
  id: 'img_script_and_logo',
  name: 'script_and_logo.png',
  type: 'image',
  category: 'background',
  storageUrl: 'blob:script-logo',
  sizeBytes: 10240,
};

const otherAsset: AssetRef = {
  id: 'other_asset',
  name: 'unrelated.png',
  type: 'image',
  category: 'ui',
  storageUrl: 'blob:unrelated',
  sizeBytes: 5120,
};

const mockAssets: AssetRef[] = [logoAsset, bgAsset, bgmAsset, scriptAndLogoAsset, otherAsset];

function createTestProject(overrides?: Partial<Project>): Project {
  const base: Project = {
    id: 'proj-test-title-refs',
    title: 'Title Refs Test Project',
    description: 'Test project for safe delete title references',
    version: 1,
    ownerId: 'user-tester',
    defaultLanguage: 'vi',
    entryScene: 'main.vns',
    updatedAt: 1700000000000,
    assets: mockAssets,
    variables: [],
    uiScreens: [],
    customScripts: [],
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      lockAspectRatio: true,
    },
    gameplaySettings: {
      unmetChoiceDisplay: 'hidden',
      textSpeed: 30,
      autoForwardDelay: 2,
      defaultVolumes: {
        master: 100,
        bgm: 80,
        sfx: 100,
        voice: 100,
      },
    },
    editorSettings: {
      autoSave: true,
      autoSaveDebounceMs: 1000,
    },
    files: [
      {
        id: 'file-1',
        name: 'main.vns',
        content: 'scene "script_and_logo.png"\n"Narrator" "Hello"\n',
        order: 0,
        version: 1,
      },
    ],
  };

  return { ...base, ...overrides };
}

function createMockRepository(): ProjectRepository {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue(null),
    createProject: vi.fn(),
    updateProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    duplicateProject: vi.fn(),
    getStorageUsage: vi.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 1000000 }),
    getAssetBlob: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'image/png' })),
    saveAssetBlob: vi.fn().mockResolvedValue(undefined),
    deleteAssetBlob: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Phase E3: SafeDelete Title References Warning & Store Cleanup (TDD RED)', () => {
  describe('Part A: titleSettings utility functions', () => {
    describe('getTitleAssetRoles', () => {
      it('returns empty array when project has no titleSettings', () => {
        const project = createTestProject({ titleSettings: undefined });
        const roles: TitleAssetRole[] = getTitleAssetRoles(project, 'img_logo');
        expect(roles).toEqual([]);
      });

      it('returns empty array when asset is not referenced in titleSettings', () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'img_logo',
            backgroundAssetId: 'img_bg',
          },
        });
        const roles = getTitleAssetRoles(project, 'other_asset');
        expect(roles).toEqual([]);
      });

      it("returns ['logo'] when asset is only logo", () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'img_logo',
          },
        });
        const roles = getTitleAssetRoles(project, 'img_logo');
        expect(roles).toEqual(['logo']);
      });

      it("returns ['background'] when asset is only background", () => {
        const project = createTestProject({
          titleSettings: {
            backgroundAssetId: 'img_bg',
          },
        });
        const roles = getTitleAssetRoles(project, 'img_bg');
        expect(roles).toEqual(['background']);
      });

      it("returns ['bgm'] when asset is only bgm", () => {
        const project = createTestProject({
          titleSettings: {
            bgmAssetId: 'aud_theme',
          },
        });
        const roles = getTitleAssetRoles(project, 'aud_theme');
        expect(roles).toEqual(['bgm']);
      });

      it("returns ['logo', 'background'] when asset is used as both logo and background in order", () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'shared_asset',
            backgroundAssetId: 'shared_asset',
            bgmAssetId: 'aud_theme',
          },
        });
        const roles = getTitleAssetRoles(project, 'shared_asset');
        expect(roles).toEqual(['logo', 'background']);
      });

      it("returns ['logo', 'background', 'bgm'] in strict order when asset is used in all three roles", () => {
        const project = createTestProject({
          titleSettings: {
            backgroundAssetId: 'all_role_asset',
            bgmAssetId: 'all_role_asset',
            logoAssetId: 'all_role_asset',
          },
        });
        const roles = getTitleAssetRoles(project, 'all_role_asset');
        expect(roles).toEqual(['logo', 'background', 'bgm']);
      });
    });

    describe('removeAssetFromTitleSettings', () => {
      it('does not mutate the original project object (immutability check)', () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'img_logo',
            backgroundAssetId: 'img_bg',
            bgmAssetId: 'aud_theme',
          },
        });
        const originalClone = structuredClone(project);

        const result = removeAssetFromTitleSettings(project, 'img_logo');

        expect(project).toEqual(originalClone);
        expect(result).not.toBe(project);
      });

      it('removes asset from logo and background leaving only bgmAssetId when asset holds both roles', () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'shared_asset',
            backgroundAssetId: 'shared_asset',
            bgmAssetId: 'aud_theme',
          },
        });

        const result = removeAssetFromTitleSettings(project, 'shared_asset');

        expect(result.titleSettings).toEqual({
          bgmAssetId: 'aud_theme',
        });
      });

      it('completely drops titleSettings key when asset holds all roles', () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'all_role_asset',
            backgroundAssetId: 'all_role_asset',
            bgmAssetId: 'all_role_asset',
          },
        });

        const result = removeAssetFromTitleSettings(project, 'all_role_asset');

        expect(result.titleSettings).toBeUndefined();
        expect(result).not.toHaveProperty('titleSettings');
      });

      it('completely drops titleSettings key when the only referenced role is removed', () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'img_logo',
          },
        });

        const result = removeAssetFromTitleSettings(project, 'img_logo');

        expect(result.titleSettings).toBeUndefined();
        expect(result).not.toHaveProperty('titleSettings');
      });

      it('returns project with titleSettings deep-equal to original when asset is not referenced', () => {
        const project = createTestProject({
          titleSettings: {
            logoAssetId: 'img_logo',
            bgmAssetId: 'aud_theme',
          },
        });

        const result = removeAssetFromTitleSettings(project, 'unreferenced_asset');

        expect(result.titleSettings).toEqual(project.titleSettings);
      });

      it('returns project with undefined titleSettings when original project has no titleSettings', () => {
        const project = createTestProject({
          titleSettings: undefined,
        });

        const result = removeAssetFromTitleSettings(project, 'any_asset');

        expect(result.titleSettings).toBeUndefined();
      });
    });
  });

  describe('Part B: SafeDeleteModal Title Warning Component', () => {
    it('displays safe-delete-title-warning with "Logo" role and does not mention other roles', () => {
      const project = createTestProject({
        titleSettings: {
          logoAssetId: logoAsset.id,
        },
      });
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={logoAsset}
          project={project}
          onClose={handleClose}
          onConfirmDelete={handleConfirm}
        />,
      );

      const warning = screen.getByTestId('safe-delete-title-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent(/Logo/i);
      expect(warning).not.toHaveTextContent(/Background/i);
      expect(warning).not.toHaveTextContent(/Title Music/i);

      const confirmBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
      expect(handleConfirm).toHaveBeenCalledWith(logoAsset);
    });

    it('displays safe-delete-title-warning with "Background" role and does not mention other roles', () => {
      const project = createTestProject({
        titleSettings: {
          backgroundAssetId: bgAsset.id,
        },
      });
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={bgAsset}
          project={project}
          onClose={handleClose}
          onConfirmDelete={handleConfirm}
        />,
      );

      const warning = screen.getByTestId('safe-delete-title-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent(/Background/i);
      expect(warning).not.toHaveTextContent(/Logo/i);
      expect(warning).not.toHaveTextContent(/Title Music/i);

      const confirmBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledWith(bgAsset);
    });

    it('displays safe-delete-title-warning with "Title Music" role and does not mention other roles', () => {
      const project = createTestProject({
        titleSettings: {
          bgmAssetId: bgmAsset.id,
        },
      });
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={bgmAsset}
          project={project}
          onClose={handleClose}
          onConfirmDelete={handleConfirm}
        />,
      );

      const warning = screen.getByTestId('safe-delete-title-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent(/Title Music/i);
      expect(warning).not.toHaveTextContent(/Logo/i);
      expect(warning).not.toHaveTextContent(/Background/i);

      const confirmBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledWith(bgmAsset);
    });

    it('displays safe-delete-title-warning with both "Logo" and "Background" when asset holds both roles', () => {
      const sharedAsset: AssetRef = {
        id: 'shared_branding_img',
        name: 'branding_shared.png',
        type: 'image',
        category: 'ui',
        storageUrl: 'blob:shared',
        sizeBytes: 15360,
      };
      const project = createTestProject({
        assets: [...mockAssets, sharedAsset],
        titleSettings: {
          logoAssetId: sharedAsset.id,
          backgroundAssetId: sharedAsset.id,
        },
      });

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={sharedAsset}
          project={project}
          onClose={vi.fn()}
          onConfirmDelete={vi.fn()}
        />,
      );

      const warning = screen.getByTestId('safe-delete-title-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent(/Logo/i);
      expect(warning).toHaveTextContent(/Background/i);
      expect(warning).not.toHaveTextContent(/Title Music/i);
    });

    it('displays safe-delete-title-warning with "Logo", "Background", and "Title Music" when asset holds all roles', () => {
      const allRoleAsset: AssetRef = {
        id: 'all_role_asset',
        name: 'branding_all.png',
        type: 'image',
        category: 'ui',
        storageUrl: 'blob:all',
        sizeBytes: 15360,
      };
      const project = createTestProject({
        assets: [...mockAssets, allRoleAsset],
        titleSettings: {
          logoAssetId: allRoleAsset.id,
          backgroundAssetId: allRoleAsset.id,
          bgmAssetId: allRoleAsset.id,
        },
      });

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={allRoleAsset}
          project={project}
          onClose={vi.fn()}
          onConfirmDelete={vi.fn()}
        />,
      );

      const warning = screen.getByTestId('safe-delete-title-warning');
      expect(warning).toBeInTheDocument();
      expect(warning).toHaveTextContent(/Logo/i);
      expect(warning).toHaveTextContent(/Background/i);
      expect(warning).toHaveTextContent(/Title Music/i);
    });

    it('does NOT render safe-delete-title-warning when asset is not referenced in titleSettings', () => {
      const project = createTestProject({
        titleSettings: {
          logoAssetId: logoAsset.id,
        },
      });

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={otherAsset}
          project={project}
          onClose={vi.fn()}
          onConfirmDelete={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('safe-delete-title-warning')).not.toBeInTheDocument();
    });

    it('renders both script reference warning (Delete Asset (In Use)) and Title warning when asset is used in script and titleSettings', () => {
      const project = createTestProject({
        titleSettings: {
          logoAssetId: scriptAndLogoAsset.id,
        },
      });
      const handleConfirm = vi.fn();

      render(
        <SafeDeleteModal
          isOpen={true}
          asset={scriptAndLogoAsset}
          project={project}
          onClose={vi.fn()}
          onConfirmDelete={handleConfirm}
        />,
      );

      // 1. Script in-use header & references are rendered
      expect(screen.getByText('Delete Asset (In Use)')).toBeInTheDocument();
      expect(screen.getByText(/main.vns/i)).toBeInTheDocument();

      // 2. Title reference warning is also rendered
      const titleWarning = screen.getByTestId('safe-delete-title-warning');
      expect(titleWarning).toBeInTheDocument();
      expect(titleWarning).toHaveTextContent(/Logo/i);

      // 3. Confirm button is unblocked (has text "Delete Anyway" and is clickable)
      const confirmBtn = screen.getByTestId('btn-confirm-delete-asset');
      expect(confirmBtn).toHaveTextContent(/Delete Anyway/i);
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
      expect(handleConfirm).toHaveBeenCalledWith(scriptAndLogoAsset);
    });
  });

  describe('Part C: useProjectStore.deleteAsset integration with titleSettings', () => {
    let mockRepo: ProjectRepository;

    beforeEach(() => {
      mockRepo = createMockRepository();
      setupTestStore();
    });

    it('removes asset reference from titleSettings when deleted asset is referenced as logo', async () => {
      const project = createTestProject({
        titleSettings: {
          logoAssetId: 'img_logo',
          bgmAssetId: 'aud_theme',
        },
      });
      useProjectStore.getState().initProject(project, mockRepo);

      await useProjectStore.getState().deleteAsset('img_logo');

      const state = useProjectStore.getState();
      expect(state.project?.assets.some(a => a.id === 'img_logo')).toBe(false);
      expect(state.project?.titleSettings).toEqual({
        bgmAssetId: 'aud_theme',
      });
      expect(state.isDirty).toBe(true);
    });

    it('preserves titleSettings when deleting an unrelated asset not referenced in titleSettings', async () => {
      const project = createTestProject({
        titleSettings: {
          logoAssetId: 'img_logo',
          bgmAssetId: 'aud_theme',
        },
      });
      useProjectStore.getState().initProject(project, mockRepo);

      await useProjectStore.getState().deleteAsset('other_asset');

      const state = useProjectStore.getState();
      expect(state.project?.assets.some(a => a.id === 'other_asset')).toBe(false);
      expect(state.project?.titleSettings).toEqual({
        logoAssetId: 'img_logo',
        bgmAssetId: 'aud_theme',
      });
    });

    it('removes entire titleSettings property when the last referenced title asset is deleted', async () => {
      const project = createTestProject({
        titleSettings: {
          bgmAssetId: 'aud_theme',
        },
      });
      useProjectStore.getState().initProject(project, mockRepo);

      await useProjectStore.getState().deleteAsset('aud_theme');

      const state = useProjectStore.getState();
      expect(state.project?.assets.some(a => a.id === 'aud_theme')).toBe(false);
      expect(state.project?.titleSettings).toBeUndefined();
    });

    it('removes multiple roles if the deleted asset was used in multiple title slots', async () => {
      const project = createTestProject({
        titleSettings: {
          logoAssetId: 'img_logo',
          backgroundAssetId: 'img_logo',
          bgmAssetId: 'aud_theme',
        },
      });
      useProjectStore.getState().initProject(project, mockRepo);

      await useProjectStore.getState().deleteAsset('img_logo');

      const state = useProjectStore.getState();
      expect(state.project?.assets.some(a => a.id === 'img_logo')).toBe(false);
      expect(state.project?.titleSettings).toEqual({
        bgmAssetId: 'aud_theme',
      });
    });

    it('handles asset deletion safely when project has no titleSettings defined', async () => {
      const project = createTestProject({
        titleSettings: undefined,
      });
      useProjectStore.getState().initProject(project, mockRepo);

      await useProjectStore.getState().deleteAsset('other_asset');

      const state = useProjectStore.getState();
      expect(state.project?.assets.some(a => a.id === 'other_asset')).toBe(false);
      expect(state.project?.titleSettings).toBeUndefined();
    });
  });
});
