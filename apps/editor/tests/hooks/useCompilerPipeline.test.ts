// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
  Project,
  Character,
  AssetRef,
  Instruction,
  EngineDiagnostic,
} from '@vn-engine/shared-types';
import { useCompilerPipeline } from '../../src/hooks/useCompilerPipeline';
import { useProjectStore } from '../../src/core/stores/projectStore';
import { useDiagnosticsStore } from '../../src/core/stores/diagnosticsStore';
import type { HotReloadPayload } from '../../src/core/stores/livePreviewStore';
import type { PreviewBridge } from '../../src/core/services/previewBridge';
import type { CompilerService, CompileOutput } from '../../src/core/services/compilerService';
import { setupTestStore } from '../testStoreHelpers';

describe('useCompilerPipeline Hook (Phase 2)', () => {
  let mockPreviewBridge: {
    hotReload: ReturnType<typeof vi.fn>;
    sendVariable: ReturnType<typeof vi.fn>;
    handleMessage: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };

  let mockCompilerService: {
    compile: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    getLatestRequestId: ReturnType<typeof vi.fn>;
  };

  const sampleBytecode: Instruction[] = [
    { opcode: 'SCENE', args: ['start'] } as unknown as Instruction,
    { opcode: 'SAY', args: ['Hello world!'] } as unknown as Instruction,
  ];

  const sampleProject: Project = {
    id: 'proj-compiler-test',
    title: 'Compiler Pipeline Test',
    version: 1,
    ownerId: 'user-1',
    defaultLanguage: 'en',
    entryScene: 'start',
    files: [
      {
        id: 'file-1',
        name: 'main.vns',
        content: 'scene start:\n  say "Hello world!"\n',
        order: 1,
        version: 1,
      },
    ],
    characters: [
      {
        id: 'alice',
        name: 'Alice',
        sprites: { neutral: 'alice_neutral.png' },
      },
    ],
    assets: [
      {
        id: 'asset-bg',
        name: 'bg.png',
        type: 'image',
        storageUrl: 'https://cdn.example.com/bg.png',
        sizeBytes: 1024,
      },
    ],
    variables: [],
    uiScreens: [],
    customScripts: [],
  };

  beforeEach(() => {
    setupTestStore();
    useProjectStore.getState().initProject(sampleProject);

    mockPreviewBridge = {
      hotReload: vi.fn(),
      sendVariable: vi.fn(),
      handleMessage: vi.fn(),
      dispose: vi.fn(),
    };

    mockCompilerService = {
      compile: vi.fn().mockResolvedValue({
        requestId: 1,
        success: true,
        bytecode: sampleBytecode,
        diagnostics: [],
      } as CompileOutput),
      terminate: vi.fn(),
      getLatestRequestId: vi.fn().mockReturnValue(1),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers Initial Mount Compilation, updates diagnosticsStore, and sends HotReloadPayload to previewBridge', async () => {
    renderHook(() =>
      useCompilerPipeline({
        compilerService: mockCompilerService as unknown as CompilerService,
        previewBridge: mockPreviewBridge as unknown as PreviewBridge,
        debounceMs: 50,
      }),
    );

    await waitFor(() => {
      expect(mockCompilerService.compile).toHaveBeenCalledWith(
        sampleProject.files,
        expect.objectContaining({ characters: sampleProject.characters }),
      );
    });

    await waitFor(() => {
      expect(mockPreviewBridge.hotReload).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-compiler-test',
          program: sampleBytecode,
          characters: sampleProject.characters,
          assets: sampleProject.assets,
        }),
      );
    });

    // diagnosticsStore should have compiler diagnostics updated
    expect(useDiagnosticsStore.getState().compilerDiagnostics).toEqual([]);
  });

  it('re-dispatches HotReloadPayload when characters or assets change without editing script files', async () => {
    renderHook(() =>
      useCompilerPipeline({
        compilerService: mockCompilerService as unknown as CompilerService,
        previewBridge: mockPreviewBridge as unknown as PreviewBridge,
        debounceMs: 50,
      }),
    );

    await waitFor(() => {
      expect(mockPreviewBridge.hotReload).toHaveBeenCalledTimes(1);
    });

    const newCharacter: Character = {
      id: 'bob',
      name: 'Bob',
      sprites: { neutral: 'bob_neutral.png' },
    };

    // Update character in projectStore
    act(() => {
      useProjectStore.getState().saveCharacter(newCharacter);
    });

    await waitFor(() => {
      expect(mockPreviewBridge.hotReload).toHaveBeenCalledTimes(2);
    });

    const lastCallPayload = mockPreviewBridge.hotReload.mock.calls[1]![0] as HotReloadPayload;
    expect(lastCallPayload.characters).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'bob' })]),
    );
    expect(lastCallPayload.program).toEqual(sampleBytecode);

    // Update asset in projectStore
    const newAsset: AssetRef = {
      id: 'asset-sound',
      name: 'click.mp3',
      type: 'audio',
      storageUrl: 'https://cdn.example.com/click.mp3',
      sizeBytes: 512,
    };

    act(() => {
      useProjectStore.getState().saveAsset(newAsset);
    });

    await waitFor(() => {
      expect(mockPreviewBridge.hotReload).toHaveBeenCalledTimes(3);
    });

    const assetCallPayload = mockPreviewBridge.hotReload.mock.calls[2]![0] as HotReloadPayload;
    expect(assetCallPayload.assets).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'asset-sound' })]),
    );
  });

  it('updates diagnosticsStore and suppresses hotReload when compilation encounters syntax errors', async () => {
    const syntaxErrorDiag: EngineDiagnostic = {
      id: 'err-1',
      timestamp: Date.now(),
      category: 'compiler',
      severity: 'error',
      message: 'Unexpected token',
      fileId: 'file-1',
      line: 1,
      col: 5,
    };

    mockCompilerService.compile.mockResolvedValueOnce({
      requestId: 2,
      success: false,
      bytecode: undefined,
      diagnostics: [syntaxErrorDiag],
    });

    renderHook(() =>
      useCompilerPipeline({
        compilerService: mockCompilerService as unknown as CompilerService,
        previewBridge: mockPreviewBridge as unknown as PreviewBridge,
        debounceMs: 50,
      }),
    );

    await waitFor(() => {
      expect(useDiagnosticsStore.getState().compilerDiagnostics).toEqual([syntaxErrorDiag]);
    });

    // previewBridge.hotReload should NOT be called with invalid bytecode
    expect(mockPreviewBridge.hotReload).not.toHaveBeenCalled();
  });
});
