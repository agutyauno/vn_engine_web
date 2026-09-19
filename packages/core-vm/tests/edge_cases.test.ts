import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import type { Instruction } from '@vn-engine/shared-types';

describe('Core VM Integration Edge Cases', () => {
  it('should handle long stories with dialogues without hitting instruction budget', () => {
    // 50 iterations with dialogue inside each iteration
    const program: Instruction[] = [
      { type: 'SCENE', name: 'loop_header' },
      { type: 'ASSIGN', variable: 'i', value: { type: 'Literal', value: 0 } },
      { type: 'SCENE', name: 'loop_header.start' },
      {
        type: 'LOOP_START',
        condition: {
          type: 'BinaryExpression',
          operator: '<',
          left: { type: 'Identifier', name: 'i' },
          right: { type: 'Literal', value: 20 },
        },
        loopEndTargetScene: 'loop_header.end',
      },
      {
        type: 'ASSIGN',
        variable: 'i',
        value: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'i' },
          right: { type: 'Literal', value: 1 },
        },
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Bước lặp thoại' },
      { type: 'LOOP_END', loopStartTargetScene: 'loop_header.start' },
      { type: 'SCENE', name: 'loop_header.end' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hoàn thành 20 bước.' },
    ];

    const vm = new VisualNovelVM(program);
    let dialogueCount = 0;

    while (true) {
      const res = vm.runUntilInteractive();
      if (res.stepResult.type === 'HALTED') break;
      if (res.stepResult.type === 'SUSPEND_DIALOGUE') {
        dialogueCount++;
      }
    }

    expect(dialogueCount).toBe(21); // 20 bước lặp + 1 câu kết
    expect(vm.getState().variables['i']).toBe(20);
  });

  it('should handle multiple characters on screen simultaneously with correct catch-up state', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'ensemble' },
      { type: 'SHOW', character: 'alice', sprite: 'happy', position: 'left' },
      { type: 'SHOW', character: 'bob', sprite: 'serious', position: 'right' },
      { type: 'SHOW', character: 'clara', sprite: 'smile', position: 'center' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào mọi người!' },

      // Giấu Bob, đổi sprite của Alice sang ngạc nhiên
      { type: 'HIDE', character: 'bob' },
      { type: 'SHOW', character: 'alice', sprite: 'surprised', position: 'left' },
      { type: 'SHOW', character: 'david', sprite: 'cool', position: 'right' },
      { type: 'DIALOGUE', character: 'clara', text: 'Bob đi đâu rồi?' },
    ];

    const vm = new VisualNovelVM(program);

    // Điểm dừng 1: 3 nhân vật (Alice, Bob, Clara)
    vm.runUntilInteractive();
    let state = vm.getStateCatchUp();
    expect(state.sprites.size).toBe(3);
    expect(state.sprites.get('alice')?.sprite).toBe('happy');
    expect(state.sprites.has('bob')).toBe(true);
    expect(state.sprites.has('clara')).toBe(true);

    // Điểm dừng 2: Alice (surprised), Clara, David (Bob đã bị giấu)
    vm.runUntilInteractive();
    state = vm.getStateCatchUp();
    expect(state.sprites.size).toBe(3);
    expect(state.sprites.get('alice')?.sprite).toBe('surprised');
    expect(state.sprites.has('bob')).toBe(false);
    expect(state.sprites.has('david')).toBe(true);

    // Rollback về điểm dừng 1: Bob phải xuất hiện lại, Alice quay về happy
    vm.rollback();
    state = vm.getStateCatchUp();
    expect(state.sprites.size).toBe(3);
    expect(state.sprites.get('alice')?.sprite).toBe('happy');
    expect(state.sprites.has('bob')).toBe(true);
    expect(state.sprites.has('david')).toBe(false);
  });

  it('should manage multiple audio channels independently (music vs sound)', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'audio_test' },
      { type: 'PLAY', channel: 'music', assetId: 'bgm.mp3', loop: true },
      { type: 'PLAY', channel: 'sound', assetId: 'bell.wav', loop: false },
      { type: 'DIALOGUE', character: null, text: 'Nghe tiếng chuông reo trên nền nhạc.' },

      // Dừng tiếng chuông, phát tiếng bước chân, nhạc nền vẫn giữ nguyên
      { type: 'STOP', channel: 'sound' },
      { type: 'PLAY', channel: 'sound', assetId: 'footsteps.wav' },
      { type: 'DIALOGUE', character: null, text: 'Tiếng bước chân.' },

      // Dừng nhạc nền
      { type: 'STOP', channel: 'music' },
      { type: 'DIALOGUE', character: null, text: 'Yên lặng.' },
    ];

    const vm = new VisualNovelVM(program);

    // Bước 1
    vm.runUntilInteractive();
    let audio = vm.getStateCatchUp().audio;
    expect(audio.get('music')?.assetId).toBe('bgm.mp3');
    expect(audio.get('sound')?.assetId).toBe('bell.wav');

    // Bước 2
    vm.runUntilInteractive();
    audio = vm.getStateCatchUp().audio;
    expect(audio.get('music')?.assetId).toBe('bgm.mp3');
    expect(audio.get('sound')?.assetId).toBe('footsteps.wav');

    // Bước 3: Nhạc dừng
    vm.runUntilInteractive();
    audio = vm.getStateCatchUp().audio;
    expect(audio.has('music')).toBe(false);
    expect(audio.get('sound')?.assetId).toBe('footsteps.wav');
  });

  it('should maintain large variable dictionaries with diverse types and preserve values across save/load', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'vars_test' },
      { type: 'ASSIGN', variable: 'intVal', value: { type: 'Literal', value: 42 } },
      { type: 'ASSIGN', variable: 'floatVal', value: { type: 'Literal', value: 3.14159 } },
      {
        type: 'ASSIGN',
        variable: 'strVal',
        value: { type: 'Literal', value: 'Xin chào Việt Nam' },
      },
      { type: 'ASSIGN', variable: 'emptyStr', value: { type: 'Literal', value: '' } },
      { type: 'ASSIGN', variable: 'boolVal', value: { type: 'Literal', value: true } },
      { type: 'DIALOGUE', character: null, text: 'Đã thiết lập biến.' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    const vars = vm.getState().variables;
    expect(vars['intVal']).toBe(42);
    expect(vars['floatVal']).toBe(3.14159);
    expect(vars['strVal']).toBe('Xin chào Việt Nam');
    expect(vars['emptyStr']).toBe('');
    expect(vars['boolVal']).toBe(true);

    // Round-trip save & load
    const saved = vm.serialize();
    const restoredVM = new VisualNovelVM(program);
    restoredVM.restore(saved);

    expect(restoredVM.getState().variables).toEqual(vars);
  });
});
