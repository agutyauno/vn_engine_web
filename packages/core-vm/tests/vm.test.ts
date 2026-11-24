import { describe, it, expect, vi } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import {
  InstructionBudgetExceededError,
  InvalidChoiceError,
  EmptyCallStackError,
  VMRuntimeError,
  SceneNotFoundError,
} from '../src/errors';
import type {
  Instruction,
  DialogueInstruction,
  ShowInstruction,
  StepResult,
} from '@vn-engine/shared-types';

/** Thu hẹp một StepResult thành DIALOGUE đang chờ; ném lỗi nếu VM dừng vì lý do khác. */
function suspendedDialogue(result: StepResult): DialogueInstruction {
  if (result.type !== 'SUSPEND_DIALOGUE' || result.instruction.type !== 'DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE with a DIALOGUE instruction, got ${result.type}`);
  }
  return result.instruction;
}

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

describe('VisualNovelVM Core', () => {
  it('should run dialogue progression and collect side effects with literal speaker', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'BACKGROUND', assetId: 'bg_classroom' },
      { type: 'SHOW', targetId: 'alice', variant: 'happy', position: 'left' },
      { type: 'PLAY', channel: 'music', assetId: 'bgm.mp3', volume: 0.8, loop: true },
      {
        type: 'DIALOGUE',
        character: '???',
        speaker: '???',
        text: 'Xin chào!',
      },
      {
        type: 'DIALOGUE',
        character: 'Alice Carroll',
        speaker: 'Alice Carroll',
        text: 'Rất vui được gặp bạn.',
      },
    ];

    const vm = new VisualNovelVM(program);

    // Lượt 1: chạy từ đầu đến câu thoại đầu tiên (literal speaker "???")
    const res1 = vm.runUntilInteractive();
    expect(res1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag1 = asDialogue(res1.stepResult);
    expect(diag1.character).toBe('???');
    expect(diag1.speaker).toBe('???');
    expect(diag1.text).toBe('Xin chào!');
    expect(diag1.displayNameOverride).toBeUndefined();

    // Kiểm tra thu thập đầy đủ 4 side-effects: SCENE + BACKGROUND + SHOW + PLAY
    expect(res1.sideEffects).toHaveLength(4);
    expect(res1.sideEffects[1]?.type).toBe('BACKGROUND');
    expect(res1.sideEffects[2]?.type).toBe('SHOW');
    expect(res1.sideEffects[3]?.type).toBe('PLAY');

    // Lượt 2: người chơi bấm tiếp sang câu thoại thứ 2 (literal speaker "Alice Carroll")
    const res2 = vm.runUntilInteractive();
    expect(res2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag2 = asDialogue(res2.stepResult);
    expect(diag2.character).toBe('Alice Carroll');
    expect(diag2.speaker).toBe('Alice Carroll');
    expect(diag2.text).toBe('Rất vui được gặp bạn.');
    expect(diag2.displayNameOverride).toBeUndefined();
    expect(res2.sideEffects).toHaveLength(0);

    // Lượt 3: hết chương trình
    const res3 = vm.runUntilInteractive();
    expect(res3.stepResult.type).toBe('HALTED');
  });

  it('should suspend on WAIT instruction and resume to next interactive step', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'wait_demo' },
      { type: 'SHOW', targetId: 'amiya', variant: 'default', x: 0.1, y: 1 },
      { type: 'WAIT', duration: 0.5 },
      { type: 'SHOW', targetId: 'amiya', variant: 'default', x: 0.5, y: 1 },
      { type: 'DIALOGUE', character: 'amiya', text: 'hi doctor' },
    ];

    const vm = new VisualNovelVM(program);

    const r1 = vm.runUntilInteractive();
    expect(r1.stepResult.type).toBe('SUSPEND_WAIT');
    if (r1.stepResult.type === 'SUSPEND_WAIT') {
      expect(r1.stepResult.duration).toBe(0.5);
    }
    expect(r1.sideEffects).toHaveLength(2); // SCENE + SHOW 1
    expect(r1.sideEffects[1]?.type).toBe('SHOW');

    const r2 = vm.runUntilInteractive();
    expect(r2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(r2.sideEffects).toHaveLength(1); // SHOW 2
    expect(r2.sideEffects[0]?.type).toBe('SHOW');

    const r3 = vm.runUntilInteractive();
    expect(r3.stepResult.type).toBe('HALTED');
  });

  it('should handle empty programs and programs with only side effects', () => {
    const emptyVM = new VisualNovelVM([]);
    const emptyRes = emptyVM.runUntilInteractive();
    expect(emptyRes.stepResult.type).toBe('HALTED');

    const sideEffectProgram: Instruction[] = [
      { type: 'SCENE', name: 'init_only' },
      { type: 'BACKGROUND', assetId: 'bg_forest' },
      { type: 'ASSIGN', variable: 'initialized', value: { type: 'Literal', value: true } },
    ];
    const sideEffectVM = new VisualNovelVM(sideEffectProgram);
    const sideRes = sideEffectVM.runUntilInteractive();
    expect(sideRes.stepResult.type).toBe('HALTED');
    expect(sideRes.sideEffects).toHaveLength(3);
    expect(sideEffectVM.getState().variables['initialized']).toBe(true);
  });

  it('should support literal speaker transitions without REVEAL opcode', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: '???', speaker: '???', text: 'Tôi giấu tên.' },
      { type: 'DIALOGUE', character: 'Alice', speaker: 'Alice', text: 'Giờ bạn đã biết tên tôi.' },
    ];

    const vm = new VisualNovelVM(program);
    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).character).toBe('???');
    expect(asDialogue(r1.stepResult).speaker).toBe('???');

    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).character).toBe('Alice');
    expect(asDialogue(r2.stepResult).speaker).toBe('Alice');
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

  it('should abort and throw InstructionBudgetExceededError on infinite loops and infinite goto cycles', () => {
    const whileLoopProgram: Instruction[] = [
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

    const vm1 = new VisualNovelVM(whileLoopProgram, undefined, { maxInstructionBudget: 100 });
    expect(() => vm1.runUntilInteractive()).toThrowError(InstructionBudgetExceededError);

    const cycleProgram: Instruction[] = [
      { type: 'SCENE', name: 'scene_a' },
      { type: 'GOTO', targetScene: 'scene_b' },
      { type: 'SCENE', name: 'scene_b' },
      { type: 'GOTO', targetScene: 'scene_a' },
    ];

    const vm2 = new VisualNovelVM(cycleProgram, undefined, { maxInstructionBudget: 50 });
    expect(() => vm2.runUntilInteractive()).toThrowError(InstructionBudgetExceededError);
  });

  it('should handle CALL and RETURN with nested callStack and throw on empty return', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'CALL', targetScene: 'level1' },
      { type: 'DIALOGUE', character: null, text: 'Trở về main.' },
      { type: 'RETURN' },

      { type: 'SCENE', name: 'level1' },
      { type: 'CALL', targetScene: 'level2' },
      { type: 'RETURN' },

      { type: 'SCENE', name: 'level2' },
      { type: 'DIALOGUE', character: null, text: 'Ở level 2.' },
      { type: 'RETURN' },
    ];

    const vm = new VisualNovelVM(program);

    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('Ở level 2.');
    expect(vm.getState().callStack).toHaveLength(2);

    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toBe('Trở về main.');
    expect(vm.getState().callStack).toHaveLength(0);

    expect(() => vm.runUntilInteractive()).toThrowError(EmptyCallStackError);
  });

  it('should validate choices, conditions, and error on out-of-bounds or inactive choice calls', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'choice_scene' },
      {
        type: 'CHOICE',
        choices: [
          {
            text: 'Cần chìa khóa',
            targetScene: 'key_branch',
            condition: { type: 'Identifier', name: 'hasKey' },
          },
          {
            text: 'Cần 100 vàng',
            targetScene: 'gold_branch',
            condition: {
              type: 'BinaryExpression',
              operator: '>=',
              left: { type: 'Identifier', name: 'gold' },
              right: { type: 'Literal', value: 100 },
            },
          },
        ],
      },
      { type: 'SCENE', name: 'key_branch' },
      { type: 'DIALOGUE', character: null, text: 'Dùng chìa khóa.' },
      { type: 'SCENE', name: 'gold_branch' },
      { type: 'DIALOGUE', character: null, text: 'Dùng vàng.' },
    ];

    const vm = new VisualNovelVM(program, undefined, {
      initialVariables: { hasKey: false, gold: 50 },
    });

    const suspendRes = vm.runUntilInteractive();
    expect(suspendRes.stepResult.type).toBe('SUSPEND_CHOICE');

    const choices = vm.getAvailableChoices();
    expect(choices[0]?.enabled).toBe(false);
    expect(choices[1]?.enabled).toBe(false);

    expect(() => vm.choose(0)).toThrowError(InvalidChoiceError);
    expect(() => vm.choose(-1)).toThrowError(InvalidChoiceError);
    expect(() => vm.choose(99)).toThrowError(InvalidChoiceError);

    const vm2 = new VisualNovelVM(program, undefined, {
      initialVariables: { hasKey: true, gold: 50 },
    });
    vm2.runUntilInteractive();
    expect(vm2.getAvailableChoices()[0]?.enabled).toBe(true);
    vm2.choose(0);
    const r1 = vm2.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('Dùng chìa khóa.');

    expect(() => vm2.choose(0)).toThrowError(InvalidChoiceError);
  });

  it('should accurately track visual and audio states via getStateCatchUp() across progress and rollback', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'stage1' },
      { type: 'BACKGROUND', assetId: 'bg_day' },
      { type: 'SHOW', targetId: 'alice', variant: 'happy', position: 'left' },
      { type: 'PLAY', channel: 'music', assetId: 'theme.mp3', volume: 1.0 },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào buổi sáng.' },

      { type: 'SCENE', name: 'stage2' },
      { type: 'BACKGROUND', assetId: 'bg_night' },
      { type: 'SHOW', targetId: 'bob', variant: 'normal', position: 'right' },
      { type: 'HIDE', targetId: 'alice' },
      { type: 'STOP', channel: 'music' },
      { type: 'DIALOGUE', character: 'bob', text: 'Chào buổi tối.' },
    ];

    const vm = new VisualNovelVM(program);

    vm.runUntilInteractive();
    const catchUp1 = vm.getStateCatchUp();
    expect(catchUp1.background?.assetId).toBe('bg_day');
    expect(catchUp1.sprites.has('alice')).toBe(true);
    expect(catchUp1.sprites.has('bob')).toBe(false);
    expect(catchUp1.audio.has('music')).toBe(true);
    expect(catchUp1.currentDialogue?.text).toBe('Chào buổi sáng.');

    vm.runUntilInteractive();
    const catchUp2 = vm.getStateCatchUp();
    expect(catchUp2.background?.assetId).toBe('bg_night');
    expect(catchUp2.sprites.has('alice')).toBe(false);
    expect(catchUp2.sprites.has('bob')).toBe(true);
    expect(catchUp2.audio.has('music')).toBe(false);
    expect(catchUp2.currentDialogue?.text).toBe('Chào buổi tối.');

    expect(vm.canRollback()).toBe(true);
    vm.rollback();

    const catchUpRolled = vm.getStateCatchUp();
    expect(catchUpRolled.background?.assetId).toBe('bg_day');
    expect(catchUpRolled.sprites.has('alice')).toBe(true);
    expect(catchUpRolled.sprites.has('bob')).toBe(false);
    expect(catchUpRolled.audio.has('music')).toBe(true);
    expect(catchUpRolled.currentDialogue?.text).toBe('Chào buổi sáng.');
  });

  it('should accurately preserve image transform properties in getStateCatchUp across progress and rollback', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'stage1' },
      {
        type: 'BACKGROUND',
        assetId: 'bg_day',
        scale: 1.2,
        rotate: 5,
        alpha: 0.9,
      },
      {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'happy',
        scale: 1.5,
        scaleX: 1.4,
        scaleY: 1.6,
        rotate: -20,
        flipX: true,
        x: 0.3,
        y: 0.8,
        offsetX: 15,
        offsetY: -30,
        alpha: 0.85,
        transition: 'shake',
        easing: 'ease_out',
        duration: 0.5,
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Biến đổi hình ảnh thành công!' },

      { type: 'SCENE', name: 'stage2' },
      {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'shocked',
        scale: 2.0,
        rotate: 45,
        flipX: false,
      },
      { type: 'DIALOGUE', character: 'alice', text: 'Phóng to hơn nữa!' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    const catchUp1 = vm.getStateCatchUp();
    expect(catchUp1.background?.scale).toBe(1.2);
    expect(catchUp1.background?.rotate).toBe(5);
    const alice1 = catchUp1.sprites.get('alice');
    expect(alice1?.scale).toBe(1.5);
    expect(alice1?.rotate).toBe(-20);
    expect(alice1?.flipX).toBe(true);
    expect(alice1?.x).toBe(0.3);
    expect(alice1?.offsetX).toBe(15);
    expect(alice1?.transition).toBe('shake');

    vm.runUntilInteractive();
    const catchUp2 = vm.getStateCatchUp();
    const alice2 = catchUp2.sprites.get('alice');
    expect(alice2?.scale).toBe(2.0);
    expect(alice2?.rotate).toBe(45);
    expect(alice2?.flipX).toBe(false);

    vm.rollback();
    const catchUpRolled = vm.getStateCatchUp();
    const aliceRolled = catchUpRolled.sprites.get('alice');
    expect(aliceRolled?.scale).toBe(1.5);
    expect(aliceRolled?.rotate).toBe(-20);
    expect(aliceRolled?.flipX).toBe(true);
    expect(aliceRolled?.offsetX).toBe(15);
  });

  it('should support save/load (serialize/restore) and validate against corrupted save data', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'story' },
      { type: 'ASSIGN', variable: 'score', value: { type: 'Literal', value: 50 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Thoại 1' },
      { type: 'ASSIGN', variable: 'score', value: { type: 'Literal', value: 100 } },
      {
        type: 'CHOICE',
        choices: [
          { text: 'A', targetScene: 'branch_a' },
          { text: 'B', targetScene: 'branch_b' },
        ],
      },
      { type: 'SCENE', name: 'branch_a' },
      { type: 'DIALOGUE', character: 'alice', text: 'Nhánh A' },
      { type: 'SCENE', name: 'branch_b' },
      { type: 'DIALOGUE', character: 'alice', text: 'Nhánh B' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();
    vm.runUntilInteractive();

    const savedJson = vm.serialize();
    expect(typeof savedJson).toBe('string');

    const loadedVM = new VisualNovelVM(program);
    loadedVM.restore(savedJson);

    expect(loadedVM.getState().variables['score']).toBe(100);

    const choices = loadedVM.getAvailableChoices();
    expect(choices).toHaveLength(2);
    loadedVM.choose(0);

    const afterChoiceRes = loadedVM.runUntilInteractive();
    expect(asDialogue(afterChoiceRes.stepResult).text).toBe('Nhánh A');

    expect(() => loadedVM.restore('not-valid-json')).toThrowError(VMRuntimeError);
    expect(() => loadedVM.restore('{}')).toThrowError(/missing state/);
  });

  it('should resolve local dot scenes strictly and reject unqualified suffix guessing', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'chapter1' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chương 1 bắt đầu' },
      { type: 'SCENE', name: 'chapter1.ask_question' },
      { type: 'DIALOGUE', character: 'alice', text: 'Câu hỏi chương 1' },
      { type: 'SCENE', name: 'chapter5' },
      { type: 'DIALOGUE', character: 'bob', text: 'Chương 5 bắt đầu' },
      { type: 'SCENE', name: 'chapter5.ask_question' },
      { type: 'DIALOGUE', character: 'bob', text: 'Câu hỏi chương 5' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    vm.jumpToScene('.ask_question');
    expect(vm.getState().currentScene).toBe('chapter1.ask_question');
    const res1 = vm.runUntilInteractive();
    expect(asDialogue(res1.stepResult).text).toBe('Câu hỏi chương 1');

    vm.jumpToScene('chapter5');
    expect(vm.getState().currentScene).toBe('chapter5');
    vm.runUntilInteractive();

    vm.jumpToScene('.ask_question');
    expect(vm.getState().currentScene).toBe('chapter5.ask_question');
    const res2 = vm.runUntilInteractive();
    expect(asDialogue(res2.stepResult).text).toBe('Câu hỏi chương 5');

    expect(() => vm.jumpToScene('ask_question')).toThrowError(SceneNotFoundError);
  });

  it('should emit HIDE_DIALOGUE as side effect and reset currentDialogue in getStateCatchUp', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'amiya', text: 'Hello' },
      { type: 'HIDE_DIALOGUE' },
      { type: 'WAIT', duration: 1.0 },
    ];

    const vm = new VisualNovelVM(program);
    const r1 = vm.runUntilInteractive();
    expect(r1.stepResult.type).toBe('SUSPEND_DIALOGUE');

    const r2 = vm.runUntilInteractive();
    expect(r2.sideEffects).toEqual([{ type: 'HIDE_DIALOGUE' }]);
    expect(r2.stepResult.type).toBe('SUSPEND_WAIT');

    const catchUp = vm.getStateCatchUp();
    expect(catchUp.currentDialogue).toBeUndefined();
  });

  it('should execute INSPECT_BEGIN and INSPECT_END with activeInspect state and catch-up', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'INSPECT_BEGIN', assetId: 'key_gold', title: 'Ancient Key' },
      { type: 'DIALOGUE', character: null, text: 'A rusted gold key.' },
      { type: 'INSPECT_END' },
      { type: 'DIALOGUE', character: 'amiya', text: 'Nice find!' },
    ];

    const vm = new VisualNovelVM(program);
    const r1 = vm.runUntilInteractive();
    expect(r1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(r1.sideEffects).toEqual([
      { type: 'SCENE', name: 'main' },
      { type: 'INSPECT_BEGIN', assetId: 'key_gold', title: 'Ancient Key' },
    ]);
    expect(vm.getState().activeInspect).toEqual({
      assetId: 'key_gold',
      title: 'Ancient Key',
    });

    const catchUp1 = vm.getStateCatchUp();
    expect(catchUp1.activeInspect).toEqual({
      assetId: 'key_gold',
      title: 'Ancient Key',
    });

    const r2 = vm.runUntilInteractive();
    expect(r2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(r2.sideEffects).toEqual([{ type: 'INSPECT_END' }]);
    expect(vm.getState().activeInspect).toBeNull();

    const catchUp2 = vm.getStateCatchUp();
    expect(catchUp2.activeInspect).toBeNull();
  });

  it('should support choice with call action, returning to instruction following choice', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'start' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Call Branch 1', action: 'call', targetScene: 'start.c1' },
          { text: 'Goto Branch 2', action: 'goto', targetScene: 'start.c2' },
        ],
      },
      { type: 'DIALOGUE', character: 'sys', text: 'After choice continuation.' },
      { type: 'HALT' },
      { type: 'SCENE_END', sceneName: 'start' },

      { type: 'SCENE', name: 'start.c1' },
      { type: 'DIALOGUE', character: 'sys', text: 'Inside branch 1.' },
      { type: 'RETURN' },
      { type: 'SCENE_END', sceneName: 'start.c1' },

      { type: 'SCENE', name: 'start.c2' },
      { type: 'DIALOGUE', character: 'sys', text: 'Inside branch 2.' },
      { type: 'HALT' },
      { type: 'SCENE_END', sceneName: 'start.c2' },
    ];

    const vm = new VisualNovelVM(program);
    const r1 = vm.runUntilInteractive();
    expect(r1.stepResult.type).toBe('SUSPEND_CHOICE');

    vm.choose(0);
    expect(vm.getState().callStack).toHaveLength(1);
    expect(vm.getState().currentScene).toBe('start.c1');

    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toBe('Inside branch 1.');

    const r3 = vm.runUntilInteractive();
    expect(asDialogue(r3.stepResult).text).toBe('After choice continuation.');
    expect(vm.getState().currentScene).toBe('start');
    expect(vm.getState().callStack).toHaveLength(0);

    const r4 = vm.runUntilInteractive();
    expect(r4.stepResult.type).toBe('HALTED');
  });

  it('should safely halt without throw when emptyCallStackBehavior is halt', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'sys', text: 'Hello' },
      { type: 'RETURN' },
    ];

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vm = new VisualNovelVM(program, undefined, { emptyCallStackBehavior: 'halt' });

    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('Hello');

    const r2 = vm.runUntilInteractive();
    expect(r2.stepResult.type).toBe('HALTED');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Script executed 'return' while call stack is empty"),
    );

    warnSpy.mockRestore();
  });

  it('should jump to target line and update currentScene accurately', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'start', loc: { fileId: 'main.vns', line: 1, col: 1 } },
      {
        type: 'DIALOGUE',
        character: 'sys',
        text: 'Line 2',
        loc: { fileId: 'main.vns', line: 2, col: 1 },
      },
      { type: 'SCENE_END', sceneName: 'start', loc: { fileId: 'main.vns', line: 5, col: 1 } },
      { type: 'SCENE', name: 'scene2', loc: { fileId: 'main.vns', line: 10, col: 1 } },
      {
        type: 'DIALOGUE',
        character: 'sys',
        text: 'Line 11',
        loc: { fileId: 'main.vns', line: 11, col: 1 },
      },
      {
        type: 'DIALOGUE',
        character: 'sys',
        text: 'Line 12',
        loc: { fileId: 'main.vns', line: 12, col: 1 },
      },
      { type: 'SCENE_END', sceneName: 'scene2', loc: { fileId: 'main.vns', line: 15, col: 1 } },
    ];

    const vm = new VisualNovelVM(program);
    const success = vm.jumpToLine(12, 'main.vns');
    expect(success).toBe(true);
    expect(vm.getState().currentScene).toBe('scene2');

    const res = vm.runUntilInteractive();
    expect(asDialogue(res.stepResult).text).toBe('Line 12');
  });

  it('should run smoothly with numeric scene names and sub-scenes', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: '1' },
      { type: 'DIALOGUE', character: 'sys', text: 'In scene 1' },
      { type: 'GOTO', targetScene: '2' },
      { type: 'SCENE_END', sceneName: '1' },

      { type: 'SCENE', name: '2' },
      { type: 'DIALOGUE', character: 'sys', text: 'In scene 2' },
      { type: 'CALL', targetScene: '2.1' },
      { type: 'DIALOGUE', character: 'sys', text: 'Back in scene 2' },
      { type: 'HALT' },
      { type: 'SCENE_END', sceneName: '2' },

      { type: 'SCENE', name: '2.1' },
      { type: 'DIALOGUE', character: 'sys', text: 'In sub-scene 2.1' },
      { type: 'RETURN' },
      { type: 'SCENE_END', sceneName: '2.1' },
    ];

    const vm = new VisualNovelVM(program);
    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('In scene 1');
    expect(vm.getState().currentScene).toBe('1');

    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toBe('In scene 2');
    expect(vm.getState().currentScene).toBe('2');

    const r3 = vm.runUntilInteractive();
    expect(asDialogue(r3.stepResult).text).toBe('In sub-scene 2.1');
    expect(vm.getState().currentScene).toBe('2.1');

    const r4 = vm.runUntilInteractive();
    expect(asDialogue(r4.stepResult).text).toBe('Back in scene 2');
    expect(vm.getState().currentScene).toBe('2');

    const r5 = vm.runUntilInteractive();
    expect(r5.stepResult.type).toBe('HALTED');
  });

  it('should only execute implicit return at SCENE_END if current scene matches targetScene of CallFrame (Issue 104)', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'scene_a' },
      { type: 'CALL', targetScene: 'scene_b' },
      { type: 'DIALOGUE', character: 'sys', text: 'Back in scene A' },
      { type: 'HALT' },
      { type: 'SCENE_END', sceneName: 'scene_a' },

      { type: 'SCENE', name: 'scene_b' },
      { type: 'GOTO', targetScene: 'scene_c' },
      { type: 'SCENE_END', sceneName: 'scene_b' },

      { type: 'SCENE', name: 'scene_c' },
      { type: 'DIALOGUE', character: 'sys', text: 'In scene C' },
      { type: 'SCENE_END', sceneName: 'scene_c' },
    ];

    const vm = new VisualNovelVM(program);
    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('In scene C');
    expect(vm.getState().currentScene).toBe('scene_c');
    expect(vm.getState().callStack).toHaveLength(1);
    expect(vm.getState().callStack[0]?.targetScene).toBe('scene_b');

    const r2 = vm.runUntilInteractive();
    expect(r2.stepResult.type).toBe('HALTED');
    expect(vm.getState().currentScene).toBe('scene_c');
  });

  it('should evaluate modulo operator (%) correctly in expressions', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'math_test' },
      {
        type: 'ASSIGN',
        variable: 'res',
        scope: 'local',
        value: {
          type: 'BinaryExpression',
          operator: '%',
          left: { type: 'Literal', value: 25, raw: '25' },
          right: { type: 'Literal', value: 7, raw: '7' },
        },
      },
      { type: 'HALT' },
      { type: 'SCENE_END', sceneName: 'math_test' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();
    expect(vm.getState().localVariables['res']).toBe(4);
  });

  // =========================================================================
  // BỘ KIỂM THỬ MICRO-PHASE 3: UNIFIED SPRITE LAYER & LITERAL SPEAKER
  // =========================================================================
  describe('Unified Sprite Layer & Literal Speaker (Micro-Phase 3)', () => {
    it('[TC-SPRITE-VM-01] vm.step() handles SHOW and stores into state.activeSprites keyed by targetId', () => {
      // `character` là field cũ đã bỏ khỏi contract; VM vẫn đọc nó làm fallback, nên giữ ở đây
      // để chứng minh targetId được ưu tiên.
      const showWithLegacyCharacter: ShowInstruction & { character: string } = {
        type: 'SHOW',
        targetId: 'sword_legendary',
        variant: 'glowing',
        character: 'sword',
        position: 'center',
        anchorX: 0.5,
        anchorY: 1.0,
      };
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        showWithLegacyCharacter,
        {
          type: 'SHOW',
          targetId: 'alice',
          variant: 'happy',
          position: 'left',
        },
      ];

      const vm = new VisualNovelVM(program);
      vm.step(); // SCENE
      vm.step(); // SHOW sword_legendary
      vm.step(); // SHOW alice

      const activeSprites = vm.getState().activeSprites;
      expect(activeSprites['sword_legendary']).toBeDefined();
      expect(activeSprites['sword_legendary']?.targetId).toBe('sword_legendary');
      expect(activeSprites['sword_legendary']?.variant).toBe('glowing');
      expect(activeSprites['sword_legendary']?.anchorX).toBe(0.5);
      expect(activeSprites['sword_legendary']?.anchorY).toBe(1.0);
      expect(activeSprites['alice']).toBeDefined();
      expect(activeSprites['alice']?.variant).toBe('happy');
      // Chắc chắn key là targetId ('sword_legendary'), không bị lưu nhầm theo character ('sword')
      expect(activeSprites['sword']).toBeUndefined();
    });

    it('[TC-SPRITE-VM-02] vm.step() handles HIDE and deletes sprite from state.activeSprites by targetId', () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        {
          type: 'SHOW',
          targetId: 'sword_legendary',
          variant: 'glowing',
        },
        {
          type: 'SHOW',
          targetId: 'alice',
          variant: 'happy',
        },
        {
          type: 'HIDE',
          targetId: 'sword_legendary',
        },
      ];

      const vm = new VisualNovelVM(program);
      vm.step(); // SCENE
      vm.step(); // SHOW sword_legendary
      vm.step(); // SHOW alice
      expect(vm.getState().activeSprites['sword_legendary']).toBeDefined();

      vm.step(); // HIDE sword_legendary
      const activeSprites = vm.getState().activeSprites;
      expect(activeSprites['sword_legendary']).toBeUndefined();
      expect(activeSprites['alice']).toBeDefined();
    });

    it('[TC-SPRITE-VM-03] vm.step() handles DIALOGUE storing currentDialogue with literal speaker (character and speaker)', () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        {
          type: 'DIALOGUE',
          character: 'Alice Carroll',
          speaker: 'Alice Carroll',
          text: 'Xin chào, tôi là Alice Carroll!',
        },
        {
          type: 'DIALOGUE',
          character: '???',
          speaker: '???',
          text: 'Danh tính bí ẩn...',
        },
        {
          type: 'DIALOGUE',
          character: null,
          speaker: null,
          text: 'Trời đổ cơn mưa rào.',
        },
      ];

      const vm = new VisualNovelVM(program);
      vm.step(); // SCENE

      // Dialogue 1: Literal name có khoảng trắng
      const dlg1 = suspendedDialogue(vm.step());
      expect(dlg1.character).toBe('Alice Carroll');
      expect(dlg1.speaker).toBe('Alice Carroll');
      expect(dlg1.displayNameOverride).toBeUndefined();
      expect(dlg1.text).toBe('Xin chào, tôi là Alice Carroll!');
      expect(vm.getState().currentDialogue?.character).toBe('Alice Carroll');
      expect(vm.getState().currentDialogue?.speaker).toBe('Alice Carroll');

      // Dialogue 2: Literal question marks "???"
      const dlg2 = suspendedDialogue(vm.step());
      expect(dlg2.character).toBe('???');
      expect(dlg2.speaker).toBe('???');
      expect(dlg2.displayNameOverride).toBeUndefined();
      expect(vm.getState().currentDialogue?.character).toBe('???');

      // Dialogue 3: Narration (người nói null)
      const dlg3 = suspendedDialogue(vm.step());
      expect(dlg3.character).toBeNull();
      expect(dlg3.speaker).toBeNull();
      expect(vm.getState().currentDialogue?.character).toBeNull();
    });

    it('[TC-SPRITE-VM-04] getStateCatchUp() extracts active sprites Map keyed by targetId', () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        {
          type: 'SHOW',
          targetId: 'alice_hero',
          variant: 'happy',
        },
        {
          type: 'SHOW',
          targetId: 'key_gold',
          variant: 'default',
        },
        {
          type: 'DIALOGUE',
          character: 'Alice',
          speaker: 'Alice',
          text: 'Tôi có chiếc chìa khóa!',
        },
      ];

      const vm = new VisualNovelVM(program);
      vm.runUntilInteractive();

      const catchUp = vm.getStateCatchUp();
      expect(catchUp.sprites).toBeInstanceOf(Map);
      expect(catchUp.sprites.has('alice_hero')).toBe(true);
      expect(catchUp.sprites.has('key_gold')).toBe(true);
      expect(catchUp.sprites.get('alice_hero')?.variant).toBe('happy');
      expect(catchUp.sprites.get('key_gold')?.variant).toBe('default');

      // Kiểm tra seedCatchUpStateUpTo cũng lưu activeSprites theo targetId
      const vm2 = new VisualNovelVM(program);
      vm2.jumpToLine(3, undefined, { seedCatchUp: true });
      const catchUp2 = vm2.getStateCatchUp();
      expect(catchUp2.sprites.has('alice_hero')).toBe(true);
    });

    it('[TC-SPRITE-VM-05] Rollback and Save/Load preserve activeSprites keyed by targetId and literal speaker', () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'step1' },
        {
          type: 'SHOW',
          targetId: 'alice_hero',
          variant: 'happy',
        },
        {
          type: 'DIALOGUE',
          character: '???',
          speaker: '???',
          text: 'Bước 1',
        },
        { type: 'SCENE', name: 'step2' },
        {
          type: 'SHOW',
          targetId: 'sword_prop',
          variant: 'sharp',
        },
        {
          type: 'HIDE',
          targetId: 'alice_hero',
        },
        {
          type: 'DIALOGUE',
          character: 'Alice Carroll',
          speaker: 'Alice Carroll',
          text: 'Bước 2',
        },
      ];

      const vm = new VisualNovelVM(program);
      vm.runUntilInteractive(); // Dừng ở Bước 1
      expect(vm.getState().activeSprites['alice_hero']).toBeDefined();

      vm.runUntilInteractive(); // Dừng ở Bước 2
      expect(vm.getState().activeSprites['alice_hero']).toBeUndefined();
      expect(vm.getState().activeSprites['sword_prop']).toBeDefined();

      // 1. Kiểm tra Save & Restore tại Bước 2
      const savedJson = vm.serialize();
      const restoredVM = new VisualNovelVM(program);
      restoredVM.restore(savedJson);
      expect(restoredVM.getState().activeSprites['sword_prop']).toBeDefined();
      expect(restoredVM.getState().activeSprites['alice_hero']).toBeUndefined();
      expect(restoredVM.getState().currentDialogue?.character).toBe('Alice Carroll');
      expect(restoredVM.getStateCatchUp().sprites.has('sword_prop')).toBe(true);

      // 2. Kiểm tra Rollback về Bước 1 trên vm gốc
      expect(vm.canRollback()).toBe(true);
      vm.rollback();
      expect(vm.getState().activeSprites['alice_hero']).toBeDefined();
      expect(vm.getState().activeSprites['sword_prop']).toBeUndefined();
      expect(vm.getStateCatchUp().sprites.has('alice_hero')).toBe(true);
      expect(vm.getStateCatchUp().sprites.has('sword_prop')).toBe(false);
      expect(vm.getState().currentDialogue?.character).toBe('???');
    });
  });
});
