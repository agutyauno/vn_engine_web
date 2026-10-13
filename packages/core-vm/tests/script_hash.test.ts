import { describe, it, expect, vi } from 'vitest';
import { VisualNovelVM, computeScriptHash } from '../src/vm';
import type { Instruction, SaveFileData } from '@vn-engine/shared-types';

describe('Bug 3.3: Script Bytecode Hash and Desync Warning', () => {
  const sampleProgram1: Instruction[] = [
    { type: 'SCENE', name: 'main' },
    { type: 'DIALOGUE', character: 'alice', text: 'Hello World' },
  ];

  const sampleProgram2: Instruction[] = [
    { type: 'SCENE', name: 'main' },
    { type: 'DIALOGUE', character: 'alice', text: 'Hello Antigravity' },
  ];

  it('computes deterministic FNV-1a hash for bytecode program', () => {
    const hash1 = computeScriptHash(sampleProgram1);
    const hash1Again = computeScriptHash(sampleProgram1);
    const hash2 = computeScriptHash(sampleProgram2);

    expect(typeof hash1).toBe('string');
    expect(hash1).toHaveLength(8);
    expect(hash1).toBe(hash1Again);
    expect(hash1).not.toBe(hash2);
  });

  it('automatically populates scriptHash during serialize if not explicitly provided', () => {
    const vm = new VisualNovelVM(sampleProgram1);
    const serialized = vm.serialize({ projectId: 'test_proj' });
    const parsed = JSON.parse(serialized) as SaveFileData;

    expect(parsed.scriptHash).toBe(vm.getScriptHash());
    expect(parsed.scriptHash).toBe(computeScriptHash(sampleProgram1));
  });

  it('warns and returns desyncWarning: true when restoring save data with mismatched scriptHash', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create save under program 1
    const vm1 = new VisualNovelVM(sampleProgram1);
    const saveJson = vm1.serialize({ projectId: 'test_proj' });

    // Restore under modified program 2
    const vm2 = new VisualNovelVM(sampleProgram2);
    const restoreResult = vm2.restore(saveJson);

    expect(restoreResult.desyncWarning).toBe(true);
    expect(restoreResult.savedHash).toBe(computeScriptHash(sampleProgram1));
    expect(restoreResult.currentHash).toBe(computeScriptHash(sampleProgram2));
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[VN Engine Warning] Script hash mismatch during restore'),
    );

    consoleWarnSpy.mockRestore();
  });

  it('returns desyncWarning: false when restoring save data with matching scriptHash', () => {
    const vm = new VisualNovelVM(sampleProgram1);
    const saveJson = vm.serialize({ projectId: 'test_proj' });
    const restoreResult = vm.restore(saveJson);

    expect(restoreResult.desyncWarning).toBe(false);
  });
});
