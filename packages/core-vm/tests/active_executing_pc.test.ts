import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import type { Instruction } from '@vn-engine/shared-types';

describe('Active Executing PC Tracking in VisualNovelVM (Approach 1)', () => {
  it('tracks activeExecutingPc precisely at DIALOGUE while instructionPointer advances to next', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' }, // index 0
      { type: 'BACKGROUND', assetId: 'bg_room' }, // index 1
      { type: 'DIALOGUE', character: 'alice', text: 'Hello!' }, // index 2
      { type: 'DIALOGUE', character: 'bob', text: 'Hi!' }, // index 3
      { type: 'HALT' }, // index 4
    ];

    const vm = new VisualNovelVM(program);

    // Run until first dialogue (index 2)
    const res1 = vm.runUntilInteractive();
    expect(res1.stepResult.type).toBe('SUSPEND_DIALOGUE');

    // instructionPointer points to index 3 (next instruction)
    expect(vm.getState().instructionPointer).toBe(3);

    // activeExecutingPc points to index 2 (the executing dialogue!)
    expect(vm.getState().activeExecutingPc).toBe(2);
    expect(vm.getActiveExecutingPc()).toBe(2);

    // Advance to second dialogue (index 3)
    const res2 = vm.runUntilInteractive();
    expect(res2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(vm.getState().instructionPointer).toBe(4);
    expect(vm.getState().activeExecutingPc).toBe(3);
    expect(vm.getActiveExecutingPc()).toBe(3);
  });

  it('tracks activeExecutingPc precisely at WAIT and CHOICE', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' }, // index 0
      { type: 'WAIT', duration: 1.5 }, // index 1
      {
        type: 'CHOICE', // index 2
        choices: [{ text: 'Yes', action: 'goto', targetScene: 'main' }],
      },
    ];

    const vm = new VisualNovelVM(program);

    // First interactive point: WAIT at index 1
    const res1 = vm.runUntilInteractive();
    expect(res1.stepResult.type).toBe('SUSPEND_WAIT');
    expect(vm.getState().instructionPointer).toBe(2);
    expect(vm.getState().activeExecutingPc).toBe(1);
    expect(vm.getActiveExecutingPc()).toBe(1);

    // Second interactive point: CHOICE at index 2
    const res2 = vm.runUntilInteractive();
    expect(res2.stepResult.type).toBe('SUSPEND_CHOICE');
    expect(vm.getState().instructionPointer).toBe(2);
    expect(vm.getState().activeExecutingPc).toBe(2);
    expect(vm.getActiveExecutingPc()).toBe(2);
  });

  it('preserves activeExecutingPc across rollback snapshots', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 's1' }, // index 0
      { type: 'DIALOGUE', character: 'a', text: 'Line 1' }, // index 1
      { type: 'DIALOGUE', character: 'a', text: 'Line 2' }, // index 2
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive(); // Line 1 (pc 1)
    expect(vm.getActiveExecutingPc()).toBe(1);

    vm.runUntilInteractive(); // Line 2 (pc 2)
    expect(vm.getActiveExecutingPc()).toBe(2);

    // Rollback to Line 1
    const rolled = vm.rollback();
    expect(rolled).toBe(true);
    expect(vm.getState().instructionPointer).toBe(2);
    expect(vm.getActiveExecutingPc()).toBe(1);
  });
});
