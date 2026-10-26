import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import type { Instruction, DialogueInstruction, StepResult } from '@vn-engine/shared-types';

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

describe('VisualNovelVM Variable Injection & Live Debugging (ADR-024)', () => {
  it('should inject global and local variables explicitly via setVariable', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'ASSIGN', variable: 'points', value: { type: 'Literal', value: 10 }, scope: 'global' },
      { type: 'ASSIGN', variable: 'temp_count', value: { type: 'Literal', value: 1 }, scope: 'local' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    expect(vm.getState().variables['points']).toBe(10);
    expect(vm.getState().localVariables['temp_count']).toBe(1);

    // Inject global variable
    vm.setVariable('points', 999, 'global');
    expect(vm.getState().variables['points']).toBe(999);

    // Inject local variable
    vm.setVariable('temp_count', 42, 'local');
    expect(vm.getState().localVariables['temp_count']).toBe(42);

    // Inject new global variable not previously declared
    vm.setVariable('cheat_mode', true, 'global');
    expect(vm.getState().variables['cheat_mode']).toBe(true);
  });

  it('should auto-infer scope: local if variable exists in localVariables, else global', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'ASSIGN', variable: 'hero_name', value: { type: 'Literal', value: 'Hero' }, scope: 'global' },
      { type: 'ASSIGN', variable: 'scene_timer', value: { type: 'Literal', value: 5 }, scope: 'local' },
      { type: 'DIALOGUE', character: 'alice', text: 'Waiting...' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    // Auto-scope for scene_timer (exists in localVariables)
    vm.setVariable('scene_timer', 99);
    expect(vm.getState().localVariables['scene_timer']).toBe(99);
    expect(vm.getState().variables['scene_timer']).toBeUndefined();

    // Auto-scope for hero_name (does not exist in localVariables)
    vm.setVariable('hero_name', 'SuperHero');
    expect(vm.getState().variables['hero_name']).toBe('SuperHero');

    // Auto-scope for completely new variable defaults to global
    vm.setVariable('is_debug_active', true);
    expect(vm.getState().variables['is_debug_active']).toBe(true);
    expect(vm.getState().localVariables['is_debug_active']).toBeUndefined();
  });

  it('should immediately reflect injected variable in state catch-up and text interpolation', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'dialogue_scene' },
      { type: 'ASSIGN', variable: 'player_name', value: { type: 'Literal', value: 'Nam' }, scope: 'global' },
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 50 }, scope: 'global' },
      { type: 'DIALOGUE', character: 'shopkeeper', text: 'Chào {player_name}, bạn đang có {gold} vàng.' },
    ];

    const vm = new VisualNovelVM(program);
    const res = vm.runUntilInteractive();
    expect(asDialogue(res.stepResult).text).toBe('Chào Nam, bạn đang có 50 vàng.');

    // Inject new values
    vm.setVariable('player_name', 'Ren');
    vm.setVariable('gold', 1000);

    // State catch-up re-interpolates text dynamically
    const catchUp = vm.getStateCatchUp();
    expect(catchUp.currentDialogue?.text).toBe('Chào Ren, bạn đang có 1000 vàng.');
  });

  it('should affect upcoming conditional branches and choice availability dynamically', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'crossroads' },
      { type: 'ASSIGN', variable: 'has_key', value: { type: 'Literal', value: false }, scope: 'global' },
      {
        type: 'CHOICE',
        choices: [
          {
            text: 'Mở cửa bí mật (Cần chìa khóa)',
            targetScene: 'secret_room',
            condition: { type: 'Identifier', name: 'has_key' },
          },
          {
            text: 'Đi tiếp',
            targetScene: 'normal_room',
          },
        ],
      },
      { type: 'SCENE', name: 'secret_room' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Bạn đã vào phòng bí mật!' },
      { type: 'SCENE', name: 'normal_room' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Bạn đi đường bình thường.' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    // Ban đầu chưa có chìa khóa: lựa chọn 0 bị disabled (enabled = false)
    const initialChoices = vm.getAvailableChoices();
    expect(initialChoices).toHaveLength(2);
    expect(initialChoices[0]?.enabled).toBe(false);
    expect(initialChoices[1]?.enabled).toBe(true);

    // Thử chọn lựa chọn 0 khi chưa đủ điều kiện sẽ throw InvalidChoiceError
    expect(() => vm.choose(0)).toThrow();

    // Inject biến has_key = true
    vm.setVariable('has_key', true, 'global');

    // Sau khi inject: lựa chọn 0 đã enabled thành công
    const updatedChoices = vm.getAvailableChoices();
    expect(updatedChoices[0]?.enabled).toBe(true);

    // Chọn lựa chọn bí mật thành công
    vm.choose(0);
    const afterChoice = vm.runUntilInteractive();
    expect(asDialogue(afterChoice.stepResult).text).toBe('Bạn đã vào phòng bí mật!');
  });
});
