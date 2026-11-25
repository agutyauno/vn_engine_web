// @vitest-environment jsdom
// TASK-SPRITE-RECON-INSPECT: kernel must resolve the inspect asset id to a displayable URL
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import type { KernelAdapters, VNRuntimeKernelOptions } from '../src/core/contracts';

type AssetGraphicResolver = (key: string, variant?: string) => string | undefined;

function buildProgram(): Instruction[] {
  return [
    { type: 'SCENE', name: 'intro', loc: { fileId: 'main.vns', line: 1 } },
    {
      type: 'INSPECT_BEGIN',
      assetId: 'corettons_stun',
      title: 'Stunned',
      loc: { fileId: 'main.vns', line: 2 },
    },
    {
      type: 'DIALOGUE',
      character: 'alice',
      text: 'Look at this.',
      loc: { fileId: 'main.vns', line: 3 },
    },
    {
      type: 'DIALOGUE',
      character: 'alice',
      text: 'Still looking.',
      loc: { fileId: 'main.vns', line: 4 },
    },
    { type: 'INSPECT_END', loc: { fileId: 'main.vns', line: 5 } },
    {
      type: 'DIALOGUE',
      character: 'alice',
      text: 'Done.',
      loc: { fileId: 'main.vns', line: 6 },
    },
  ] as Instruction[];
}

describe('Kernel inspect asset URL resolution (TASK-SPRITE-RECON-INSPECT)', () => {
  let adapters: KernelAdapters;

  beforeEach(() => {
    vi.useFakeTimers();
    adapters = {
      renderer: {
        applySideEffect: vi.fn().mockResolvedValue(undefined),
        syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
        captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,mock'),
      },
      audio: {
        applySideEffect: vi.fn(),
        syncStateCatchUp: vi.fn(),
        stopVoice: vi.fn(),
        setVolume: vi.fn(),
        setMute: vi.fn(),
        playVoice: vi.fn(),
      },
      storage: {
        getSeenDialogues: vi.fn(() => new Set<string>()),
        saveSeenDialogue: vi.fn(),
        saveSeenDialogues: vi.fn(),
        getSlots: vi.fn(() => [null, null, null, null, null, null]),
        getQuickSave: vi.fn(() => null),
        saveSlot: vi.fn().mockResolvedValue(undefined),
        loadSlot: vi.fn().mockResolvedValue(null),
      },
    } as KernelAdapters;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function makeKernel(resolver?: AssetGraphicResolver): VNRuntimeKernel {
    const options = {
      ...(resolver ? { assetGraphicResolver: resolver } : {}),
    } as VNRuntimeKernelOptions;
    return new VNRuntimeKernel(buildProgram(), adapters, options);
  }

  // Spec §3 player #1
  it('TC-INSP-URL-01: INSPECT_BEGIN uses the URL returned by assetGraphicResolver', async () => {
    const resolver = vi.fn<AssetGraphicResolver>(key =>
      key === 'corettons_stun' ? 'blob:url-stun' : undefined,
    );
    const kernel = makeKernel(resolver);

    await kernel.startNewGame();

    const state = kernel.getState();
    expect(resolver.mock.calls.map(c => c[0])).toContain('corettons_stun');
    expect(state.activeModal).toBe('inspect');
    expect(state.activeInspectModal?.assetUrl).toBe('blob:url-stun');
    expect(state.activeInspectModal?.title).toBe('Stunned');
  });

  // Spec §3 player #2
  it('TC-INSP-URL-02: resolver returning undefined keeps the raw assetId', async () => {
    const resolver = vi.fn<AssetGraphicResolver>(() => undefined);
    const kernel = makeKernel(resolver);

    await kernel.startNewGame();

    const state = kernel.getState();
    expect(state.activeModal).toBe('inspect');
    expect(state.activeInspectModal?.assetUrl).toBe('corettons_stun');
  });

  // Spec §3 player #3 (regression)
  it('TC-INSP-URL-03: without a resolver the raw assetId is kept', async () => {
    const kernel = makeKernel();

    await kernel.startNewGame();

    const state = kernel.getState();
    expect(state.activeModal).toBe('inspect');
    expect(state.activeInspectModal?.assetUrl).toBe('corettons_stun');
  });

  // Spec §3 player #4 (catch-up via rollback)
  it('TC-INSP-URL-04a: rollback catch-up inside an inspect block uses the resolved URL', async () => {
    const resolver = vi.fn<AssetGraphicResolver>(key =>
      key === 'corettons_stun' ? 'blob:url-stun' : undefined,
    );
    const kernel = makeKernel(resolver);

    await kernel.startNewGame();
    await kernel.advance();
    expect(kernel.getState().dialogue.rawText).toBe('Still looking.');

    const rolled = kernel.rollback();
    expect(rolled).toBe(true);

    const state = kernel.getState();
    expect(state.dialogue.rawText).toBe('Look at this.');
    expect(state.activeInspectModal?.assetUrl).toBe('blob:url-stun');
  });

  // Spec §3 player #4 (catch-up via hot reload jump to a line inside the inspect block)
  it('TC-INSP-URL-04b: hot reload to a line inside an inspect block uses the resolved URL', async () => {
    const resolver = vi.fn<AssetGraphicResolver>(key =>
      key === 'corettons_stun' ? 'blob:url-stun' : undefined,
    );
    const kernel = makeKernel(resolver);

    await kernel.startNewGame();
    await kernel.advance();
    await kernel.advance();
    expect(kernel.getState().dialogue.rawText).toBe('Done.');
    expect(kernel.getState().activeInspectModal).toBeNull();

    await kernel.loadProgram(buildProgram(), { line: 4 });

    const state = kernel.getState();
    expect(state.dialogue.rawText).toBe('Still looking.');
    expect(state.activeInspectModal?.assetUrl).toBe('blob:url-stun');
  });
});
