// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction, Character, AssetRef } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import { PreviewBridgeAdapter } from '../src/adapters/PreviewBridgeAdapter';
import type { KernelAdapters } from '../src/core/contracts';

describe('Player Hot-Reload & State Preservation (TASK-decouple-preview-and-hotreload)', () => {
  let mockRenderer: NonNullable<KernelAdapters['renderer']>;
  let mockAudio: NonNullable<KernelAdapters['audio']>;
  let mockStorage: NonNullable<KernelAdapters['storage']>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockRenderer = {
      applySideEffect: vi.fn().mockResolvedValue(undefined),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mockthumb'),
    };

    mockAudio = {
      applySideEffect: vi.fn(),
      syncStateCatchUp: vi.fn(),
      stopVoice: vi.fn(),
      setVolume: vi.fn(),
      setMute: vi.fn(),
      playVoice: vi.fn(),
    };

    mockStorage = {
      getSeenDialogues: vi.fn(() => new Set<string>()),
      saveSeenDialogue: vi.fn(),
      saveSeenDialogues: vi.fn(),
      getSlots: vi.fn(() => [null, null, null, null, null, null]),
      getQuickSave: vi.fn(() => null),
      saveSlot: vi.fn().mockResolvedValue(undefined),
      loadSlot: vi.fn().mockResolvedValue(null),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // TEST-KRN-01: loadProgram khi Player ở chế độ STANDBY -> tự động nạp program và chuyển sang GAMEPLAY.
  it('TEST-KRN-01: should transition from STANDBY to GAMEPLAY and display first dialogue when loading program', async () => {
    const kernel = new VNRuntimeKernel(
      [],
      { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      { initialMode: 'STANDBY' },
    );

    expect(kernel.getState().mode).toBe('STANDBY');

    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro', loc: { line: 1 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello from Standby!', loc: { line: 2 } },
    ];

    await kernel.loadProgram(program);

    const state = kernel.getState();
    expect(state.mode).toBe('GAMEPLAY');
    expect(state.dialogue.isVisible).toBe(true);
    expect(state.dialogue.rawText).toBe('Hello from Standby!');
  });

  // TEST-KRN-02: loadProgram khi Player đang ở GAMEPLAY -> bảo toàn nguyên vẹn các biến số hiện tại và giữ mode GAMEPLAY.
  it('TEST-KRN-02: should preserve existing variables (score, affinity) and retain GAMEPLAY mode upon hot reload', async () => {
    const initialProgram: Instruction[] = [
      { type: 'SCENE', name: 'chapter1', loc: { line: 1 } },
      { type: 'ASSIGN', variable: 'score', value: { type: 'Literal', value: 10 }, loc: { line: 2 } },
      { type: 'DIALOGUE', character: 'narrator', text: 'Game started.', loc: { line: 3 } },
    ];

    const kernel = new VNRuntimeKernel(
      initialProgram,
      { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      { initialMode: 'TITLE' },
    );

    await kernel.startNewGame();
    expect(kernel.getState().mode).toBe('GAMEPLAY');

    // Giả lập trong quá trình chơi game, người chơi đạt điểm số và hảo cảm
    kernel.setVariable('score', 100);
    kernel.setVariable('affinity', 15);
    expect(kernel.getVariables().score).toBe(100);
    expect(kernel.getVariables().affinity).toBe(15);

    // Live Hot reload với bytecode được cập nhật từ editor
    const updatedProgram: Instruction[] = [
      { type: 'SCENE', name: 'chapter1', loc: { line: 1 } },
      { type: 'ASSIGN', variable: 'score', value: { type: 'Literal', value: 10 }, loc: { line: 2 } },
      { type: 'DIALOGUE', character: 'narrator', text: 'Game started (patched).', loc: { line: 3 } },
    ];

    await kernel.loadProgram(updatedProgram, { preserveState: true });

    // Trạng thái biến số và chế độ GAMEPLAY phải được bảo toàn 100%
    expect(kernel.getState().mode).toBe('GAMEPLAY');
    expect(kernel.getVariables().score).toBe(100);
    expect(kernel.getVariables().affinity).toBe(15);
  });

  // TEST-KRN-03: loadProgram kèm options.line -> jumpToLine với seedCatchUp=true, nạp đúng bối cảnh background, sprite nhân vật trước dòng đó và hiển thị dialogue tại dòng đó.
  it('TEST-KRN-03: should jump to options.line with seedCatchUp=true, restoring background, sprites and displaying dialogue', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro', loc: { line: 1 } },
      { type: 'BACKGROUND', assetId: 'bg_park.png', loc: { line: 2 } },
      { type: 'SHOW', character: 'alice', sprite: 'happy', position: 'left', loc: { line: 3 } },
      { type: 'DIALOGUE', character: 'alice', text: 'First dialogue', loc: { line: 4 } },
      { type: 'SHOW', character: 'bob', sprite: 'smile', position: 'right', loc: { line: 5 } },
      { type: 'DIALOGUE', character: 'bob', text: 'Second dialogue at target line', loc: { line: 6 } },
    ];

    const kernel = new VNRuntimeKernel(
      program,
      { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      { initialMode: 'TITLE' },
    );

    await kernel.startNewGame();

    // Hot-reload nhảy trực tiếp tới dòng 6 (Run from cursor at line 6)
    await kernel.loadProgram(program, { line: 6, preserveState: true });

    expect(mockRenderer.syncStateCatchUp).toHaveBeenCalledWith(
      expect.objectContaining({
        background: expect.objectContaining({ type: 'BACKGROUND', assetId: 'bg_park.png' }),
        sprites: expect.any(Map),
      }),
    );

    const state = kernel.getState();
    expect(state.mode).toBe('GAMEPLAY');
    expect(state.dialogue.isVisible).toBe(true);
    expect(state.dialogue.speakerName).toBe('bob');
    expect(state.dialogue.rawText).toBe('Second dialogue at target line');
  });

  // TEST-KRN-04: Sửa câu chữ thoại của dòng đang hiển thị -> loadProgram tự động cập nhật text mới trong kernel state dialogue.rawText mà không cần gọi advance().
  it('TEST-KRN-04: should hot-patch active dialogue text immediately without requiring advance()', async () => {
    const initialProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro', loc: { line: 1 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Original line content', loc: { line: 2 } },
    ];

    const kernel = new VNRuntimeKernel(
      initialProgram,
      { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      { initialMode: 'TITLE' },
    );

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Original line content');

    // Tác giả sửa trực tiếp text câu thoại tại dòng 2 trong Monaco Editor
    const patchedProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro', loc: { line: 1 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Hot-reloaded modified content!', loc: { line: 2 } },
    ];

    await kernel.loadProgram(patchedProgram, { line: 2, preserveState: true });

    const state = kernel.getState();
    expect(state.dialogue.isVisible).toBe(true);
    expect(state.dialogue.rawText).toBe('Hot-reloaded modified content!');
  });

  // TEST-KRN-05: Dòng thoại đang chạy bị xoá trong bytecode mới -> neo tới câu lệnh kế tiếp gần nhất trong scene.
  it('TEST-KRN-05: should safely anchor to the closest subsequent instruction if the current line was deleted', async () => {
    const initialProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro', loc: { line: 1 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Line to be deleted', loc: { line: 2 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Subsequent surviving line', loc: { line: 5 } },
    ];

    const kernel = new VNRuntimeKernel(
      initialProgram,
      { renderer: mockRenderer, audio: mockAudio, storage: mockStorage },
      { initialMode: 'TITLE' },
    );

    await kernel.startNewGame();
    expect(kernel.getState().dialogue.rawText).toBe('Line to be deleted');

    // Bytecode mới đã xóa câu thoại tại dòng 2, dòng sống sót kế tiếp là dòng 5
    const patchedProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro', loc: { line: 1 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Subsequent surviving line', loc: { line: 5 } },
    ];

    // Reload với con trỏ đang ở dòng 2 đã bị xóa
    await kernel.loadProgram(patchedProgram, { line: 2, preserveState: true });

    const state = kernel.getState();
    expect(state.mode).toBe('GAMEPLAY');
    expect(state.dialogue.isVisible).toBe(true);
    expect(state.dialogue.rawText).toBe('Subsequent surviving line');
  });

  describe('PreviewBridgeAdapter HOT_RELOAD_PROGRAM message options', () => {
    it('should forward line, scene, preserveState, characters, assets, and projectId to onHotReload callback', () => {
      const onHotReload = vi.fn();
      const bridge = new PreviewBridgeAdapter({
        onHotReload,
      });

      const program: Instruction[] = [
        { type: 'SCENE', name: 'scene1', loc: { line: 1 } },
      ];
      const characters: Character[] = [
        { id: 'char_1', name: 'Alice', color: '#ff0000', defaultExpression: 'happy', expressions: [] },
      ];
      const assets: AssetRef[] = [
        { id: 'asset_1', name: 'bg.png', type: 'background', uri: 'blob:bg' },
      ];

      // Gửi message HOT_RELOAD_PROGRAM bọc trong object payload
      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:3000',
        data: {
          type: 'HOT_RELOAD_PROGRAM',
          payload: {
            program,
            line: 42,
            scene: 'scene1',
            preserveState: true,
            characters,
            assets,
            projectId: 'proj_alpha',
          },
        },
      });

      bridge.handleMessage(messageEvent);

      expect(onHotReload).toHaveBeenCalledTimes(1);
      expect(onHotReload).toHaveBeenCalledWith(
        program,
        expect.objectContaining({
          line: 42,
          scene: 'scene1',
          preserveState: true,
          characters,
          assets,
          projectId: 'proj_alpha',
        }),
      );
    });

    it('should support legacy flat HOT_RELOAD_PROGRAM message structure with preserveState', () => {
      const onHotReload = vi.fn();
      const bridge = new PreviewBridgeAdapter({
        onHotReload,
      });

      const program: Instruction[] = [
        { type: 'SCENE', name: 'scene2', loc: { line: 10 } },
      ];

      const messageEvent = new MessageEvent('message', {
        origin: 'http://localhost:3000',
        data: {
          type: 'HOT_RELOAD_PROGRAM',
          program,
          line: 15,
          scene: 'scene2',
          preserveState: true,
          projectId: 'proj_beta',
        },
      });

      bridge.handleMessage(messageEvent);

      expect(onHotReload).toHaveBeenCalledWith(
        program,
        expect.objectContaining({
          line: 15,
          scene: 'scene2',
          preserveState: true,
          projectId: 'proj_beta',
        }),
      );
    });
  });
});
