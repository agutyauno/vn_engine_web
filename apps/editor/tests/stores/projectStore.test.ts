import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Project, ProjectRepository } from '../../src/core/contracts/repository';
import { useProjectStore } from '../../src/core/stores/projectStore';
import { useDiagnosticsStore } from '../../src/core/stores/diagnosticsStore';
import { setupTestStore } from '../testStoreHelpers';

function createMockProject(): Project {
  return {
    id: 'proj-123',
    title: 'Test Project',
    description: 'A test project description',
    version: 1,
    ownerId: 'user-1',
    defaultLanguage: 'en',
    entryScene: 'start',
    updatedAt: Date.now(),
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      lockAspectRatio: true,
    },
    gameplaySettings: {
      unmetChoiceDisplay: 'disabled',
      textSpeed: 40,
      autoForwardDelay: 2000,
      defaultVolumes: {
        master: 1,
        bgm: 0.8,
        sfx: 0.8,
        voice: 1,
      },
    },
    editorSettings: {
      autoSave: true,
      autoSaveDebounceMs: 500,
    },
    files: [
      {
        id: 'file-main',
        name: 'main.vns',
        content: 'scene start:\n  say "Hello world!"',
        order: 1,
        version: 1,
      },
      {
        id: 'file-ch1',
        name: 'chapter1.vns',
        content: 'scene ch1:\n  say "Chapter 1"',
        order: 2,
        version: 1,
      },
    ],
    characters: [
      {
        id: 'alice',
        name: 'Alice',
        defaultExpression: 'neutral',
        sprites: { neutral: 'room.png' },
      },
    ],
    variables: [],
    assets: [
      {
        id: 'bg-room',
        name: 'room.png',
        type: 'image',
        storageUrl: '/assets/room.png',
        sizeBytes: 1024,
      },
    ],
    uiScreens: [],
    customScripts: [],
  };
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

describe('projectStore', () => {
  let mockRepo: ProjectRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRepo = createMockRepository();
    setupTestStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes project, repository, and dirty state via initProject', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    const state = useProjectStore.getState();
    expect(state.project).toEqual(project);
    expect(state.isDirty).toBe(false);
    expect(state.dirtyFileIds).toEqual([]);
    expect(state.isSaving).toBe(false);
  });

  it('updates file content, increments version, tracks dirtyFileIds and flags isDirty', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().updateFileContent('file-main', 'scene start:\n  say "Updated"');

    const state = useProjectStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.dirtyFileIds).toContain('file-main');

    const updatedFile = state.project?.files.find(f => f.id === 'file-main');
    expect(updatedFile?.content).toBe('scene start:\n  say "Updated"');
    expect(updatedFile?.version).toBe(2);
  });

  it('triggers debounced auto-save upon updateFileContent when autoSave is enabled', async () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().updateFileContent('file-main', 'content edit');
    expect(mockRepo.updateProject).not.toHaveBeenCalled();

    // Fast-forward past the 500ms autoSaveDebounceMs
    await vi.advanceTimersByTimeAsync(550);

    expect(mockRepo.updateProject).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().isDirty).toBe(false);
    expect(useProjectStore.getState().dirtyFileIds).toEqual([]);
  });

  it('prevents auto-save if editorSettings.autoSave is false', async () => {
    const project = createMockProject();
    project.editorSettings = { autoSave: false, autoSaveDebounceMs: 500 };
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().updateFileContent('file-main', 'content edit');

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockRepo.updateProject).not.toHaveBeenCalled();
    expect(useProjectStore.getState().isDirty).toBe(true);
  });

  it('creates a new file normalized to .vns and flags isDirty', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().createFile('chapter2');

    const state = useProjectStore.getState();
    expect(state.isDirty).toBe(true);
    const newFile = state.project?.files.find(f => f.name === 'chapter2.vns');
    expect(newFile).toBeDefined();
    expect(state.dirtyFileIds).toContain(newFile?.id);
  });

  it('renames file and prevents duplicate filenames', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().renameFile('file-ch1', 'prologue.vns');
    let state = useProjectStore.getState();
    expect(state.project?.files.find(f => f.id === 'file-ch1')?.name).toBe('prologue.vns');

    // Attempt renaming to existing filename should fail or keep original
    useProjectStore.getState().renameFile('file-ch1', 'main.vns');
    state = useProjectStore.getState();
    expect(state.project?.files.find(f => f.id === 'file-ch1')?.name).toBe('prologue.vns');
  });

  it('does not expose duplicateFile on project store (eliminated feature)', () => {
    const state = useProjectStore.getState() as unknown as Record<string, unknown>;
    expect(state.duplicateFile).toBeUndefined();
  });

  it('deletes file but strictly protects main.vns from deletion', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    // Attempt to delete main.vns
    useProjectStore.getState().deleteFile('file-main');
    let state = useProjectStore.getState();
    expect(state.project?.files.some(f => f.id === 'file-main')).toBe(true);

    // Delete normal file
    useProjectStore.getState().deleteFile('file-ch1');
    state = useProjectStore.getState();
    expect(state.project?.files.some(f => f.id === 'file-ch1')).toBe(false);
    expect(state.isDirty).toBe(true);
  });

  it('updates project settings slices and flags isDirty', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().updateProjectMetadata({ title: 'New Title', entryScene: 'intro' });
    expect(useProjectStore.getState().project?.title).toBe('New Title');
    expect(useProjectStore.getState().project?.entryScene).toBe('intro');

    useProjectStore
      .getState()
      .updateDisplaySettings({ orientation: 'portrait', width: 1080, height: 1920 });
    expect(useProjectStore.getState().project?.displaySettings?.orientation).toBe('portrait');

    useProjectStore.getState().updateGameplaySettings({ textSpeed: 80 });
    expect(useProjectStore.getState().project?.gameplaySettings?.textSpeed).toBe(80);

    useProjectStore.getState().updateEditorSettings({ autoSaveDebounceMs: 2000 });
    expect(useProjectStore.getState().project?.editorSettings?.autoSaveDebounceMs).toBe(2000);

    expect(useProjectStore.getState().isDirty).toBe(true);
  });

  it('saves and deletes characters in character registry', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    useProjectStore.getState().saveCharacter({
      id: 'bob',
      name: 'Bob',
      defaultExpression: 'smile',
      sprites: { smile: 'bob_smile.png' },
    });

    let state = useProjectStore.getState();
    expect(state.project?.characters.some(c => c.id === 'bob')).toBe(true);

    useProjectStore.getState().deleteCharacter('bob');
    state = useProjectStore.getState();
    expect(state.project?.characters.some(c => c.id === 'bob')).toBe(false);
  });

  it('saves and deletes assets in asset registry and invokes repository blob methods', async () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    const blob = new Blob(['image data'], { type: 'image/png' });
    await useProjectStore.getState().saveAsset(
      {
        id: 'bg-forest',
        name: 'forest.png',
        type: 'image',
        storageUrl: '/assets/forest.png',
        sizeBytes: 2048,
      },
      blob,
    );

    expect(mockRepo.saveAssetBlob).toHaveBeenCalledWith('bg-forest', blob);
    expect(useProjectStore.getState().project?.assets.some(a => a.id === 'bg-forest')).toBe(true);

    await useProjectStore.getState().deleteAsset('bg-forest');
    expect(mockRepo.deleteAssetBlob).toHaveBeenCalledWith('bg-forest');
    expect(useProjectStore.getState().project?.assets.some(a => a.id === 'bg-forest')).toBe(false);
  });

  it('executes snapshot-based dirty subtraction preventing in-flight keystroke erasure', async () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    let resolveSave: () => void = () => {};
    mockRepo.updateProject = vi.fn().mockImplementation(() => {
      return new Promise<void>(resolve => {
        resolveSave = resolve;
      });
    });

    useProjectStore.getState().updateFileContent('file-main', 'v1 content');
    expect(useProjectStore.getState().dirtyFileIds).toEqual(['file-main']);

    // Initiate async save
    const savePromise = useProjectStore.getState().saveProject();
    expect(useProjectStore.getState().isSaving).toBe(true);

    // Keystroke arrives while save is in flight for chapter1
    useProjectStore.getState().updateFileContent('file-ch1', 'v1 chapter');
    expect(useProjectStore.getState().dirtyFileIds).toEqual(['file-main', 'file-ch1']);

    // Resolve the in-flight save
    resolveSave();
    await savePromise;

    const finalState = useProjectStore.getState();
    expect(finalState.isSaving).toBe(false);
    // file-main was snapshotted and subtracted, but file-ch1 remains dirty!
    expect(finalState.dirtyFileIds).toEqual(['file-ch1']);
    expect(finalState.isDirty).toBe(true);
  });

  it('handles storage rejection gracefully in saveProject without locking isSaving', async () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    mockRepo.updateProject = vi.fn().mockRejectedValue(new Error('QuotaExceeded'));

    useProjectStore.getState().updateFileContent('file-main', 'new content');
    expect(useProjectStore.getState().isDirty).toBe(true);

    await useProjectStore.getState().saveProject();

    const state = useProjectStore.getState();
    // isSaving MUST be false via finally
    expect(state.isSaving).toBe(false);
    // Dirty files must NOT be wiped on error
    expect(state.dirtyFileIds).toContain('file-main');
    expect(state.isDirty).toBe(true);

    // Storage diagnostic should be added
    const diagState = useDiagnosticsStore.getState();
    expect(
      diagState.runtimeDiagnostics.some(
        d => d.message.includes('QuotaExceeded') || d.category === 'runtime',
      ),
    ).toBe(true);
  });

  it('ensures store state is strictly JSON-serializable without circular or non-serializable objects', () => {
    const project = createMockProject();
    useProjectStore.getState().initProject(project, mockRepo);

    const state = useProjectStore.getState();
    const serialized = JSON.stringify(state);
    expect(serialized).toBeDefined();

    const parsed = JSON.parse(serialized);
    expect(parsed.project.id).toBe('proj-123');
    expect(parsed.isDirty).toBe(false);
    expect(parsed.dirtyFileIds).toEqual([]);
    expect(parsed.isSaving).toBe(false);
    // Repository must NOT be in the serialized state
    expect(parsed.activeRepository).toBeUndefined();
    expect(parsed.autoSaveTimer).toBeUndefined();
  });
});
