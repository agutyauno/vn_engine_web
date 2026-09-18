import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import { InstructionBudgetExceededError, InvalidChoiceError } from '../src/errors';
import type { Instruction, DialogueInstruction, StepResult } from '@vn-engine/shared-types';

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

describe('VisualNovelVM Core', () => {
  it('should run dialogue progression and collect side effects', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'BACKGROUND', assetId: 'bg_classroom' },
      { type: 'SHOW', character: 'alice', sprite: 'happy', position: 'left' },
      { type: 'PLAY', channel: 'music', assetId: 'bgm.mp3', volume: 0.8, loop: true },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Xin chào!',
        displayNameOverride: '???',
      },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Rất vui được gặp bạn.',
      },
    ];

    const vm = new VisualNovelVM(program);

    // Lượt 1: chạy từ đầu đến câu thoại đầu tiên
    const res1 = vm.runUntilInteractive();
    expect(res1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag1 = asDialogue(res1.stepResult);
    expect(diag1.character).toBe('alice');
    expect(diag1.text).toBe('Xin chào!');
    expect(diag1.displayNameOverride).toBe('???');

    // Kiểm tra thu thập đầy đủ 3 side-effects: background, show, play
    expect(res1.sideEffects).toHaveLength(4); // SCENE + BACKGROUND + SHOW + PLAY
    expect(res1.sideEffects[1]?.type).toBe('BACKGROUND');
    expect(res1.sideEffects[2]?.type).toBe('SHOW');
    expect(res1.sideEffects[3]?.type).toBe('PLAY');

    // Lượt 2: người chơi bấm tiếp sang câu thoại thứ 2
    const res2 = vm.runUntilInteractive();
    expect(res2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag2 = asDialogue(res2.stepResult);
    expect(diag2.text).toBe('Rất vui được gặp bạn.');
    expect(diag2.displayNameOverride).toBeUndefined();
    expect(res2.sideEffects).toHaveLength(0); // Không có side-effect nào giữa 2 câu thoại

    // Lượt 3: hết chương trình
    const res3 = vm.runUntilInteractive();
    expect(res3.stepResult.type).toBe('HALTED');
  });

  it('should handle REVEAL and update characterDisplayOverrides', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'alice', text: 'Tôi giấu tên.', displayNameOverride: '???' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice' },
      { type: 'DIALOGUE', character: 'alice', text: 'Giờ bạn đã biết tên tôi.' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive(); // Dừng ở câu thoại 1
    expect(vm.getState().characterDisplayOverrides['alice']).toBeUndefined();

    vm.runUntilInteractive(); // Chạy qua REVEAL, dừng ở câu thoại 2
    expect(vm.getState().characterDisplayOverrides['alice']).toBe('Alice');
  });

  it('should handle variables, assignment and while loops correctly', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'loop_scene' },
      {
        type: 'ASSIGN',
        variable: 'counter',
        value: { type: 'Literal', value: 0 },
      },
      { type: 'SCENE', name: 'loop_scene.__while_start' },
      {
        type: 'LOOP_START',
        condition: {
          type: 'BinaryExpression',
          operator: '<',
          left: { type: 'Identifier', name: 'counter' },
          right: { type: 'Literal', value: 3 },
        },
        loopEndTargetScene: 'loop_scene.__while_end',
      },
      {
        type: 'ASSIGN',
        variable: 'counter',
        value: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'counter' },
          right: { type: 'Literal', value: 1 },
        },
      },
      {
        type: 'LOOP_END',
        loopStartTargetScene: 'loop_scene.__while_start',
      },
      { type: 'SCENE', name: 'loop_scene.__while_end' },
      { type: 'DIALOGUE', character: null, text: 'Vòng lặp hoàn tất.' },
    ];

    const vm = new VisualNovelVM(program);
    const res = vm.runUntilInteractive();

    expect(res.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(vm.getState().variables['counter']).toBe(3);
  });

  it('should abort and throw InstructionBudgetExceededError on infinite loops', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'infinite_scene' },
      {
        type: 'LOOP_START',
        condition: { type: 'Literal', value: true },
        loopEndTargetScene: 'infinite_scene.end',
      },
      {
        type: 'LOOP_END',
        loopStartTargetScene: 'infinite_scene',
      },
      { type: 'SCENE', name: 'infinite_scene.end' },
    ];

    const vm = new VisualNovelVM(program, undefined, { maxInstructionBudget: 100 });
    expect(() => vm.runUntilInteractive()).toThrowError(InstructionBudgetExceededError);
  });

  it('should handle CALL and RETURN with nested callStack', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: null, text: 'Trước khi call.' },
      { type: 'CALL', targetScene: 'sub_routine' },
      { type: 'DIALOGUE', character: null, text: 'Sau khi call trở về.' },
      { type: 'GOTO', targetScene: 'game_end' },

      { type: 'SCENE', name: 'sub_routine' },
      { type: 'DIALOGUE', character: null, text: 'Bên trong sub_routine.' },
      { type: 'RETURN' },

      { type: 'SCENE', name: 'game_end' },
    ];

    const vm = new VisualNovelVM(program);

    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('Trước khi call.');

    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toBe('Bên trong sub_routine.');
    expect(vm.getState().callStack).toHaveLength(1);

    const r3 = vm.runUntilInteractive();
    expect(asDialogue(r3.stepResult).text).toBe('Sau khi call trở về.');
    expect(vm.getState().callStack).toHaveLength(0);
  });

  it('should suspend at CHOICE and jump upon choose()', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'choice_scene' },
      {
        type: 'CHOICE',
        choices: [
          {
            text: 'Tặng hoa',
            targetScene: 'flower_branch',
            condition: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'has_item' },
              arguments: [{ type: 'Literal', value: 'flower' }],
            },
          },
          { text: 'Bỏ đi', targetScene: 'leave_branch' },
        ],
      },
      { type: 'SCENE', name: 'flower_branch' },
      { type: 'DIALOGUE', character: 'alice', text: 'Cảm ơn hoa của bạn!' },
      { type: 'GOTO', targetScene: 'choice_end' },

      { type: 'SCENE', name: 'leave_branch' },
      { type: 'DIALOGUE', character: 'alice', text: 'Tạm biệt...' },

      { type: 'SCENE', name: 'choice_end' },
    ];

    // Khởi tạo VM không có hoa -> lựa chọn 0 bị khóa
    const vmWithoutFlower = new VisualNovelVM(program);
    const suspendRes = vmWithoutFlower.runUntilInteractive();
    expect(suspendRes.stepResult.type).toBe('SUSPEND_CHOICE');

    const choicesInfo = vmWithoutFlower.getAvailableChoices();
    expect(choicesInfo[0]?.enabled).toBe(false);
    expect(choicesInfo[1]?.enabled).toBe(true);

    // Cố chọn lựa chọn bị khóa -> ném InvalidChoiceError
    expect(() => vmWithoutFlower.choose(0)).toThrowError(InvalidChoiceError);

    // Chọn lựa chọn 1 hợp lệ
    vmWithoutFlower.choose(1);
    const leaveRes = vmWithoutFlower.runUntilInteractive();
    expect(asDialogue(leaveRes.stepResult).text).toBe('Tạm biệt...');

    // Khởi tạo VM CÓ HOA qua customFunctions
    const vmWithFlower = new VisualNovelVM(program, undefined, {
      customFunctions: {
        has_item: (item: unknown) => item === 'flower',
      },
    });
    vmWithFlower.runUntilInteractive();
    expect(vmWithFlower.getAvailableChoices()[0]?.enabled).toBe(true);

    vmWithFlower.choose(0);
    const flowerRes = vmWithFlower.runUntilInteractive();
    expect(asDialogue(flowerRes.stepResult).text).toBe('Cảm ơn hoa của bạn!');
  });

  it('should support rollback, rollforward, and save/load (serialize/restore)', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'story' },
      { type: 'ASSIGN', variable: 'points', value: { type: 'Literal', value: 10 } },
      { type: 'DIALOGUE', character: null, text: 'Câu thoại 1.' },
      { type: 'ASSIGN', variable: 'points', value: { type: 'Literal', value: 20 } },
      { type: 'DIALOGUE', character: null, text: 'Câu thoại 2.' },
      { type: 'ASSIGN', variable: 'points', value: { type: 'Literal', value: 30 } },
      { type: 'DIALOGUE', character: null, text: 'Câu thoại 3.' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive(); // Dừng ở câu 1, points = 10
    vm.runUntilInteractive(); // Dừng ở câu 2, points = 20
    vm.runUntilInteractive(); // Dừng ở câu 3, points = 30
    expect(vm.getState().variables['points']).toBe(30);

    // 1. Kiểm tra Rollback
    expect(vm.canRollback()).toBe(true);
    const rollRes1 = vm.rollback();
    expect(rollRes1).toBe(true);
    expect(vm.getState().variables['points']).toBe(20); // Điểm đã phục hồi về 20

    const rollRes2 = vm.rollback();
    expect(rollRes2).toBe(true);
    expect(vm.getState().variables['points']).toBe(10); // Điểm phục hồi về 10

    // 2. Kiểm tra Roll-forward
    expect(vm.canRollforward()).toBe(true);
    vm.rollforward();
    expect(vm.getState().variables['points']).toBe(20);

    // 3. Kiểm tra Save / Load
    const savedJson = vm.serialize();
    expect(typeof savedJson).toBe('string');

    // Tạo máy ảo mới và restore
    const loadedVM = new VisualNovelVM(program);
    loadedVM.restore(savedJson);
    expect(loadedVM.getState().variables['points']).toBe(20);
  });
});
