// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { Project, AssetRef } from '@vn-engine/shared-types';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';
import { useProjectStore } from '../src/core/stores/projectStore';

describe('Phase 2: Editor Asset Blob Hydration & Lifecycle', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn();
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    }
    if (originalRevokeObjectURL) {
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('TC-ASSET-HYDRATE-01: IndexedDBProjectRepository.getProject automatically hydrates storageUrl from asset_blobs', async () => {
    const repo = new IndexedDBProjectRepository('test_hydrate_db_' + Date.now());

    // 1. Create a project and assign an asset with a stale/dead blob URL
    const project = await repo.createProject({
      title: 'Hydration Test Project',
    });

    const deadUrl = 'blob:http://localhost:3001/dead-uuid';
    const staleAsset: AssetRef = {
      id: 'bg_forest',
      name: 'forest.png',
      type: 'image',
      category: 'background',
      storageUrl: deadUrl,
    };
    project.assets = [staleAsset];

    // 2. Save binary blob into asset_blobs store and persist project
    const fakeBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
    await repo.saveAssetBlob('bg_forest', fakeBlob);
    await repo.updateProject(project);

    // 3. Mock URL.createObjectURL to return a fresh hydrated blob URL
    const freshHydratedUrl = 'blob:http://localhost:3000/fresh-hydrated-uuid';
    const createObjectURLMock = vi.fn().mockReturnValue(freshHydratedUrl);
    URL.createObjectURL = createObjectURLMock;

    // 4. Retrieve project and verify that storageUrl is re-hydrated
    const loaded = await repo.getProject(project.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.assets).toHaveLength(1);
    expect(loaded?.assets[0]?.storageUrl).toBe(freshHydratedUrl);
    expect(createObjectURLMock).toHaveBeenCalledWith(expect.any(Blob));

    await repo.close();
  });

  it('TC-ASSET-HYDRATE-02: IndexedDBProjectRepository.getProject preserves remote and data URLs without stored blobs', async () => {
    const repo = new IndexedDBProjectRepository('test_hydrate_remote_db_' + Date.now());

    const project = await repo.createProject({
      title: 'Remote Asset Project',
    });

    const remoteUrl = 'https://cdn.example.com/assets/bg_city.png';
    project.assets = [
      {
        id: 'bg_city',
        name: 'bg_city.png',
        type: 'image',
        category: 'background',
        storageUrl: remoteUrl,
      },
    ];
    await repo.updateProject(project);

    const loaded = await repo.getProject(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.assets[0]?.storageUrl).toBe(remoteUrl);

    await repo.close();
  });

  it('TC-ASSET-SAVE-01: projectStore.saveAsset generates fresh live URL.createObjectURL when fileBlob is provided', async () => {
    const repo = new IndexedDBProjectRepository('test_store_save_db_' + Date.now());

    const initialProject: Project = {
      id: 'proj_save_test_' + Date.now(),
      title: 'Asset Store Test Project',
      version: 1,
      ownerId: 'local-author',
      defaultLanguage: 'vi',
      entryScene: 'start',
      files: [],
      characters: [],
      variables: [],
      assets: [],
    };

    useProjectStore.getState().initProject(initialProject, repo);

    const freshLiveUrl = 'blob:http://localhost:3000/freshly-saved-blob';
    const createObjectURLMock = vi.fn().mockReturnValue(freshLiveUrl);
    URL.createObjectURL = createObjectURLMock;

    const targetAsset: AssetRef = {
      id: 'bg_castle',
      name: 'castle.png',
      type: 'image',
      category: 'background',
      storageUrl: 'blob:old-url',
    };
    const fileBlob = new Blob(['castle-bytes'], { type: 'image/png' });

    await useProjectStore.getState().saveAsset(targetAsset, fileBlob);

    const savedAsset = useProjectStore
      .getState()
      .project?.assets.find(a => a.id === 'bg_castle');

    expect(savedAsset).toBeDefined();
    expect(savedAsset?.storageUrl).toBe(freshLiveUrl);
    expect(createObjectURLMock).toHaveBeenCalledWith(fileBlob);

    await repo.close();
  });

  it('TC-ASSET-SAVE-02: projectStore.saveAsset preserves existing storageUrl when no fileBlob is provided', async () => {
    const repo = new IndexedDBProjectRepository('test_store_meta_db_' + Date.now());

    const initialProject: Project = {
      id: 'proj_save_meta_' + Date.now(),
      title: 'Asset Metadata Update Test',
      version: 1,
      ownerId: 'local-author',
      defaultLanguage: 'vi',
      entryScene: 'start',
      files: [],
      characters: [],
      variables: [],
      assets: [],
    };

    useProjectStore.getState().initProject(initialProject, repo);

    const createObjectURLMock = vi.fn();
    URL.createObjectURL = createObjectURLMock;

    const existingUrl = 'https://assets.example.com/audio/bgm01.mp3';
    const assetMeta: AssetRef = {
      id: 'bgm_theme',
      name: 'bgm_theme.mp3',
      type: 'audio',
      category: 'bgm',
      storageUrl: existingUrl,
    };

    await useProjectStore.getState().saveAsset(assetMeta);

    const savedAsset = useProjectStore
      .getState()
      .project?.assets.find(a => a.id === 'bgm_theme');

    expect(savedAsset).toBeDefined();
    expect(savedAsset?.storageUrl).toBe(existingUrl);
    expect(createObjectURLMock).not.toHaveBeenCalled();

    await repo.close();
  });
});
