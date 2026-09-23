import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import type { Instruction, DialogueInstruction, StepResult } from '@vn-engine/shared-types';

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

describe('Variable Scoping VM Execution & Lifecycle Specification', () => {
  it('should initialize global variables from preamble and local variables in scene', () => {
    const program: Instruction[] = [
      // Preamble: Global variables
      {
        type: 'ASSIGN',
        variable: 'affection',
        value: { type: 'Literal', value: 10 },
        scope: 'global',
      },
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 50 }, scope: 'global' },
      // Scene 1
      { type: 'SCENE', name: 'chapter1' },
      {
        type: 'ASSIGN',
        variable: 'temp_count',
        value: { type: 'Literal', value: 1 },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào!' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    const state = vm.getState();
    expect(state.variables['affection']).toBe(10);
    expect(state.variables['gold']).toBe(50);
    expect(state.localVariables['temp_count']).toBe(1);
  });

  it('should reset localVariables on SCENE transition but preserve global variables', () => {
    const program: Instruction[] = [
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 100 }, scope: 'global' },
      { type: 'SCENE', name: 'sceneA' },
      {
        type: 'ASSIGN',
        variable: 'localA',
        value: { type: 'Literal', value: 999 },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Tại scene A' },
      // Nhảy sang scene B
      { type: 'SCENE', name: 'sceneB' },
      {
        type: 'ASSIGN',
        variable: 'localB',
        value: { type: 'Literal', value: 888 },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Tại scene B' },
    ];

    const vm = new VisualNovelVM(program);

    // Điểm dừng 1: Tại scene A
    vm.runUntilInteractive();
    expect(vm.getState().currentScene).toBe('sceneA');
    expect(vm.getState().localVariables['localA']).toBe(999);
    expect(vm.getState().variables['gold']).toBe(100);

    // Điểm dừng 2: Tại scene B
    vm.runUntilInteractive();
    expect(vm.getState().currentScene).toBe('sceneB');
    // localA đã bị reset khi vào scene B
    expect(vm.getState().localVariables['localA']).toBeUndefined();
    expect(vm.getState().localVariables['localB']).toBe(888);
    // gold vẫn giữ nguyên
    expect(vm.getState().variables['gold']).toBe(100);
  });

  it('should preserve local variables across LABEL instructions (if/while branches)', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'calc_scene' },
      { type: 'ASSIGN', variable: 'x', value: { type: 'Literal', value: 5 }, scope: 'local' },
      // Nhánh if bắt đầu (dùng LABEL)
      { type: 'LABEL', name: 'calc_scene.__if_true' },
      {
        type: 'ASSIGN',
        variable: 'x',
        value: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'x' },
          right: { type: 'Literal', value: 10 },
        },
        scope: 'local',
      },
      { type: 'LABEL', name: 'calc_scene.__if_end' },
      { type: 'DIALOGUE', character: 'alice', text: 'Kết quả' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    // Biến local x không bị reset bởi các mốc LABEL
    expect(vm.getState().localVariables['x']).toBe(15);
  });

  it('should save and restore localVariables across CALL and RETURN', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'caller_scene' },
      {
        type: 'ASSIGN',
        variable: 'caller_var',
        value: { type: 'Literal', value: 'hello_caller' },
        scope: 'local',
      },
      { type: 'CALL', targetScene: 'callee_scene' },
      // Khi return sẽ quay lại đây
      { type: 'DIALOGUE', character: 'alice', text: 'Đã quay lại caller' },
      { type: 'HALT' },

      // Subroutine scene
      { type: 'SCENE', name: 'callee_scene' },
      {
        type: 'ASSIGN',
        variable: 'callee_var',
        value: { type: 'Literal', value: 'im_sub' },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Đang ở callee' },
      { type: 'RETURN' },
    ];

    const vm = new VisualNovelVM(program);

    // Điểm dừng 1: Trong callee_scene
    vm.runUntilInteractive();
    expect(vm.getState().currentScene).toBe('callee_scene');
    expect(vm.getState().localVariables['callee_var']).toBe('im_sub');
    // Biến local của caller_scene không tồn tại trong callee_scene
    expect(vm.getState().localVariables['caller_var']).toBeUndefined();
    expect(vm.getState().callStack).toHaveLength(1);
    expect(vm.getState().callStack[0]?.savedLocalVariables['caller_var']).toBe('hello_caller');

    // Điểm dừng 2: Quay lại caller_scene sau khi return
    vm.runUntilInteractive();
    expect(vm.getState().currentScene).toBe('caller_scene');
    // Biến local của caller được phục hồi trọn vẹn
    expect(vm.getState().localVariables['caller_var']).toBe('hello_caller');
    expect(vm.getState().localVariables['callee_var']).toBeUndefined();
  });

  it('should rollback local and global variables accurately via SnapshotRingBuffer', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'rollback_scene' },
      { type: 'ASSIGN', variable: 'points', value: { type: 'Literal', value: 0 }, scope: 'global' },
      {
        type: 'ASSIGN',
        variable: 'local_step',
        value: { type: 'Literal', value: 1 },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Thoại 1: Điểm = 0, Bước = 1' },

      {
        type: 'ASSIGN',
        variable: 'points',
        value: { type: 'Literal', value: 100 },
        scope: 'global',
      },
      {
        type: 'ASSIGN',
        variable: 'local_step',
        value: { type: 'Literal', value: 2 },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Thoại 2: Điểm = 100, Bước = 2' },
    ];

    const vm = new VisualNovelVM(program);

    // Chạy tới câu thoại 1
    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toContain('Thoại 1');
    expect(vm.getState().variables['points']).toBe(0);
    expect(vm.getState().localVariables['local_step']).toBe(1);

    // Chạy tiếp tới câu thoại 2
    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toContain('Thoại 2');
    expect(vm.getState().variables['points']).toBe(100);
    expect(vm.getState().localVariables['local_step']).toBe(2);

    // Thực hiện Rollback về câu thoại 1
    expect(vm.canRollback()).toBe(true);
    const rolledBack = vm.rollback();
    expect(rolledBack).toBe(true);

    // Trạng thái của cả global lẫn local được khôi phục chính xác về thoại 1
    expect(vm.getState().variables['points']).toBe(0);
    expect(vm.getState().localVariables['local_step']).toBe(1);

    // Roll-forward lại câu thoại 2
    expect(vm.canRollforward()).toBe(true);
    vm.rollforward();
    expect(vm.getState().variables['points']).toBe(100);
    expect(vm.getState().localVariables['local_step']).toBe(2);
  });

  it('should save and load both global and local variables correctly', () => {
    const program: Instruction[] = [
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 500 }, scope: 'global' },
      { type: 'SCENE', name: 'save_scene' },
      {
        type: 'ASSIGN',
        variable: 'item_count',
        value: { type: 'Literal', value: 3 },
        scope: 'local',
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Lưu game tại đây' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    const saveJson = vm.serialize('1.0.0');
    expect(saveJson).toContain('"gold":500');
    expect(saveJson).toContain('"item_count":3');

    // Khởi tạo máy ảo mới và restore
    const loadedVM = new VisualNovelVM(program);
    loadedVM.restore(saveJson);

    expect(loadedVM.getState().variables['gold']).toBe(500);
    expect(loadedVM.getState().localVariables['item_count']).toBe(3);
    expect(loadedVM.getState().currentScene).toBe('save_scene');
  });
});
