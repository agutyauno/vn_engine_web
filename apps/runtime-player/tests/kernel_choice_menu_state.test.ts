// TASK-CHOICE-CTRL: kernel phải tính lại menu lựa chọn từ VM sau khi load / rollback.
// Dùng kernel thật + StorageAdapter thật (localStorage của jsdom, gắn trong tests/setup.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compileString } from '@vn-engine/dsl-compiler';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import { StorageAdapter } from '../src/adapters/StorageAdapter';
import type { KernelAdapters } from '../src/core/contracts';

const SOURCE = [
  'scene start {',
  '    "Narrator": "Line one."',
  '    "Narrator": "Pick one."',
  '    choice {',
  '        "Left": goto left',
  '        "Right": goto right',
  '    }',
  '}',
  'scene left {',
  '    "Narrator": "You went left."',
  '    "Narrator": "Still left."',
  '}',
  'scene right {',
  '    "Narrator": "You went right."',
  '}',
  '',
].join('\n');

function compileProgram(): Instruction[] {
  const result = compileString(SOURCE, 'main.vns');
  if (!result.success || !result.program) {
    throw new Error(`Fixture failed to compile: ${JSON.stringify(result.errors)}`);
  }
  return result.program;
}

function createAdapters(): KernelAdapters {
  return {
    renderer: {
      applySideEffect: vi.fn().mockResolvedValue(undefined),
      syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
      captureThumbnail: vi.fn().mockResolvedValue(''),
    },
    audio: {
      applySideEffect: vi.fn(),
      syncStateCatchUp: vi.fn(),
      stopVoice: vi.fn(),
      setVolume: vi.fn(),
      setMute: vi.fn(),
      playVoice: vi.fn(),
    },
    storage: new StorageAdapter({ projectId: 'choice-menu-test' }),
  };
}

async function advanceLine(kernel: VNRuntimeKernel): Promise<void> {
  kernel.completeDialogue();
  await kernel.advance();
}

/** Từ New Game đi tới menu lựa chọn (sau câu "Pick one."). */
async function reachChoice(kernel: VNRuntimeKernel): Promise<void> {
  await kernel.startNewGame();
  await advanceLine(kernel);
  await advanceLine(kernel);
}

function choiceTexts(kernel: VNRuntimeKernel): string[] | null {
  return kernel.getState().activeChoices?.map(choice => choice.text) ?? null;
}

describe('VNRuntimeKernel: choice menu state after restore (TASK-CHOICE-CTRL)', () => {
  let kernel: VNRuntimeKernel;

  beforeEach(() => {
    localStorage.clear();
    kernel = new VNRuntimeKernel(compileProgram(), createAdapters(), { initialMode: 'TITLE' });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reaches the choice menu in the fixture', async () => {
    await reachChoice(kernel);
    expect(choiceTexts(kernel)).toEqual(['Left', 'Right']);
  });

  it('shows the choice menu again after loading a save made at the menu', async () => {
    await reachChoice(kernel);
    await kernel.saveSlot(1);
    await kernel.selectChoice(0);
    expect(choiceTexts(kernel)).toBeNull();

    await kernel.loadSlot(1);

    expect(kernel.getState().mode).toBe('GAMEPLAY');
    expect(choiceTexts(kernel)).toEqual(['Left', 'Right']);
  });

  it('clears a stale choice menu when loading a save made on a normal line', async () => {
    await reachChoice(kernel);
    await kernel.selectChoice(0);
    await kernel.saveSlot(2);
    kernel.rollback();
    // Quay lại điểm lựa chọn trong ván hiện tại
    expect(choiceTexts(kernel)).toEqual(['Left', 'Right']);

    await kernel.loadSlot(2);

    expect(choiceTexts(kernel)).toBeNull();
    expect(kernel.getState().dialogue.rawText).toBe('You went left.');
  });

  it('clears the choice menu when rolling back from it', async () => {
    await reachChoice(kernel);

    kernel.rollback();

    expect(choiceTexts(kernel)).toBeNull();
    expect(kernel.getState().dialogue.isVisible).toBe(true);
    expect(kernel.getState().dialogue.rawText).toBe('Pick one.');
  });

  it('shows the choice menu again when rolling back onto the choice point', async () => {
    await reachChoice(kernel);
    await kernel.selectChoice(1);
    expect(kernel.getState().dialogue.rawText).toBe('You went right.');

    kernel.rollback();

    expect(choiceTexts(kernel)).toEqual(['Left', 'Right']);
  });

  it('pauses AUTO when a load lands on the choice menu', async () => {
    await reachChoice(kernel);
    await kernel.saveSlot(1);
    await kernel.selectChoice(0);
    kernel.toggleAuto();
    expect(kernel.getState().playbackMode).toBe('AUTO');

    vi.useFakeTimers();
    try {
      await kernel.loadSlot(1);
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
      expect(choiceTexts(kernel)).toEqual(['Left', 'Right']);
      expect(kernel.getState().dialogue.rawText).toBe('Pick one.');
    } finally {
      vi.useRealTimers();
    }
  });
});
