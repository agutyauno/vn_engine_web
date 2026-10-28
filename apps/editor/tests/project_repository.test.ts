import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { ProjectRepository, CreateProjectParams } from '../src/core/contracts/repository';
import { IndexedDBProjectRepository } from '../src/core/repositories/IndexedDBProjectRepository';

describe('E-Phase 1: Storage & Repository Layer (IndexedDBProjectRepository)', () => {
  let repository: ProjectRepository;

  beforeEach(async () => {
    // Mỗi test case khởi tạo một instance repo mới
    repository = new IndexedDBProjectRepository('test_vn_engine_db_' + Date.now());
  });

  afterEach(async () => {
    if (repository instanceof IndexedDBProjectRepository) {
      await repository.close();
    }
  });

  it('UT-EDT-01: should create a new project with 1920x1080 Landscape canvas and default main.vns', async () => {
    const params: CreateProjectParams = {
      title: 'Summer Academy',
      description: 'A magical visual novel adventure',
      displaySettings: {
        width: 1920,
        height: 1080,
        orientation: 'landscape',
        lockAspectRatio: true,
      },
      gameplaySettings: {
        unmetChoiceDisplay: 'disabled',
        textSpeed: 45,
        autoForwardDelay: 2000,
        defaultVolumes: {
          master: 0.8,
          bgm: 0.7,
          sfx: 0.9,
          voice: 0.85,
        },
      },
      editorSettings: {
        autoSave: true,
        autoSaveDebounceMs: 1000,
      },
    };

    const project = await repository.createProject(params);

    expect(project).toBeDefined();
    expect(project.id).toBeDefined();
    expect(project.title).toBe('Summer Academy');
    expect(project.description).toBe('A magical visual novel adventure');
    expect(project.displaySettings?.width).toBe(1920);
    expect(project.displaySettings?.height).toBe(1080);
    expect(project.displaySettings?.orientation).toBe('landscape');
    expect(project.displaySettings?.lockAspectRatio).toBe(true);

    // Kịch bản khởi tạo mặc định phải có 1 file main.vns chứa scene start
    expect(project.files).toHaveLength(1);
    expect(project.files[0].name).toBe('main.vns');
    expect(project.files[0].content).toContain('scene start');
    expect(project.entryScene).toBe('start');
  });

  it('should list project summaries with accurate counts and metadata', async () => {
    await repository.createProject({
      title: 'Project A',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });
    await repository.createProject({
      title: 'Project B (Portrait)',
      displaySettings: { width: 1080, height: 1920, orientation: 'portrait', lockAspectRatio: true },
    });

    const summaries = await repository.listProjects();

    expect(summaries).toHaveLength(2);
    const projB = summaries.find((s) => s.title.includes('Portrait'));
    expect(projB).toBeDefined();
    expect(projB?.canvasWidth).toBe(1080);
    expect(projB?.canvasHeight).toBe(1920);
    expect(projB?.orientation).toBe('portrait');
    expect(projB?.scriptCount).toBe(1);
    expect(projB?.characterCount).toBe(0);
    expect(projB?.assetCount).toBe(0);
  });

  it('should get a project by ID and return null for nonexistent ID', async () => {
    const created = await repository.createProject({
      title: 'Target Project',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const found = await repository.getProject(created.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.title).toBe('Target Project');

    const nonexistent = await repository.getProject('non-existent-id');
    expect(nonexistent).toBeNull();
  });

  it('should update an existing project and maintain updatedAt timestamp', async () => {
    const created = await repository.createProject({
      title: 'Initial Title',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const updatedProject = {
      ...created,
      title: 'Updated Title',
      characters: [
        {
          id: 'alice',
          name: 'Alice Margatroid',
          colorHex: '#38bdf8',
          sprites: { default: 'data:image/png;base64,mock' },
        },
      ],
    };

    await repository.updateProject(updatedProject);

    const reloaded = await repository.getProject(created.id);
    expect(reloaded?.title).toBe('Updated Title');
    expect(reloaded?.characters).toHaveLength(1);
    expect(reloaded?.characters[0].name).toBe('Alice Margatroid');
    expect(reloaded?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt || 0);
  });

  it('should duplicate a project with new ID and fresh title', async () => {
    const original = await repository.createProject({
      title: 'Original Game',
      description: 'Master copy',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    const duplicate = await repository.duplicateProject(original.id, 'Original Game (Copy)');

    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.title).toBe('Original Game (Copy)');
    expect(duplicate.description).toBe('Master copy');
    expect(duplicate.files).toHaveLength(original.files.length);
    expect(duplicate.files[0].name).toBe(original.files[0].name);
    expect(duplicate.files[0].content).toBe(original.files[0].content);
    expect(duplicate.files[0].id).not.toBe(original.files[0].id);

    const list = await repository.listProjects();
    expect(list).toHaveLength(2);
  });

  it('should delete a project from database', async () => {
    const p1 = await repository.createProject({
      title: 'To Delete',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });
    const p2 = await repository.createProject({
      title: 'To Keep',
      displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
    });

    await repository.deleteProject(p1.id);

    const list = await repository.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p2.id);

    const deleted = await repository.getProject(p1.id);
    expect(deleted).toBeNull();
  });

  it('should report storage usage estimate', async () => {
    const usage = await repository.getStorageUsage();
    expect(usage).toBeDefined();
    expect(usage.usedBytes).toBeGreaterThanOrEqual(0);
    expect(usage.quotaBytes).toBeGreaterThan(0);
  });

  it('should throw when duplicating a non-existent project', async () => {
    await expect(repository.duplicateProject('non-existent-proj', 'Copy Title')).rejects.toThrow(
      'Project not found: non-existent-proj'
    );
  });

  it('should save, retrieve, replace, and delete asset blobs in asset_blobs store', async () => {
    const blobData = 'sample-binary-png-content';
    const blob = new Blob([blobData], { type: 'image/png' });

    // 1. Save blob
    await repository.saveAssetBlob('asset-voice-01', blob);

    // 2. Retrieve blob
    const retrieved = await repository.getAssetBlob('asset-voice-01');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.size).toBe(blob.size);
    expect(retrieved?.type).toBe('image/png');

    const retrievedText = await retrieved?.text();
    expect(retrievedText).toBe(blobData);

    // 3. Non-existent blob returns null
    const missing = await repository.getAssetBlob('non-existent-asset');
    expect(missing).toBeNull();

    // 4. Replace blob keeping assetId intact (UT-EDT-06 pattern)
    const updatedData = 'updated-binary-content-different-length';
    const updatedBlob = new Blob([updatedData], { type: 'image/png' });
    await repository.saveAssetBlob('asset-voice-01', updatedBlob);

    const replaced = await repository.getAssetBlob('asset-voice-01');
    expect(replaced).not.toBeNull();
    expect(replaced?.size).toBe(updatedBlob.size);
    const replacedText = await replaced?.text();
    expect(replacedText).toBe(updatedData);

    // 5. Delete blob
    await repository.deleteAssetBlob('asset-voice-01');
    const deleted = await repository.getAssetBlob('asset-voice-01');
    expect(deleted).toBeNull();
  });

  it('should calculate storage quota accounting for both projects and asset blobs in fallback mode', async () => {
    // Save original navigator.storage if present
    const originalStorage = globalThis.navigator?.storage;
    try {
      // Force fallback mode by deleting navigator.storage
      if (globalThis.navigator) {
        Object.defineProperty(globalThis.navigator, 'storage', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      }

      // Empty repo storage estimate
      const initialUsage = await repository.getStorageUsage();
      expect(initialUsage.usedBytes).toBe(0);
      expect(initialUsage.quotaBytes).toBe(1073741824);

      // Create a project
      const proj = await repository.createProject({
        title: 'Storage Test Project',
        displaySettings: { width: 1920, height: 1080, orientation: 'landscape', lockAspectRatio: true },
      });

      const afterProjUsage = await repository.getStorageUsage();
      expect(afterProjUsage.usedBytes).toBeGreaterThan(0);

      // Add a blob
      const assetBlob = new Blob(['hello-audio-waveform-bytes-1234567890'], { type: 'audio/mp3' });
      await repository.saveAssetBlob('ast-audio-1', assetBlob);

      const afterBlobUsage = await repository.getStorageUsage();
      expect(afterBlobUsage.usedBytes).toBe(afterProjUsage.usedBytes + assetBlob.size);

      // Delete blob
      await repository.deleteAssetBlob('ast-audio-1');
      const afterDeleteBlobUsage = await repository.getStorageUsage();
      expect(afterDeleteBlobUsage.usedBytes).toBe(afterProjUsage.usedBytes);

      // Delete project
      await repository.deleteProject(proj.id);
      const finalUsage = await repository.getStorageUsage();
      expect(finalUsage.usedBytes).toBe(0);
    } finally {
      if (globalThis.navigator && originalStorage !== undefined) {
        Object.defineProperty(globalThis.navigator, 'storage', {
          value: originalStorage,
          configurable: true,
          writable: true,
        });
      }
    }
  });

  it('should delegate to navigator.storage.estimate when available', async () => {
    const originalStorage = globalThis.navigator?.storage;
    try {
      const mockEstimate = { usage: 42000000, quota: 5000000000 };
      if (!globalThis.navigator) {
        (globalThis as unknown as { navigator: unknown }).navigator = {};
      }
      Object.defineProperty(globalThis.navigator, 'storage', {
        value: {
          estimate: async () => mockEstimate,
        },
        configurable: true,
        writable: true,
      });

      const usage = await repository.getStorageUsage();
      expect(usage.usedBytes).toBe(42000000);
      expect(usage.quotaBytes).toBe(5000000000);
    } finally {
      if (globalThis.navigator) {
        Object.defineProperty(globalThis.navigator, 'storage', {
          value: originalStorage,
          configurable: true,
          writable: true,
        });
      }
    }
  });
});
