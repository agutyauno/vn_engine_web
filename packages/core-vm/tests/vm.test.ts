import { describe, it, expect, vi } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import {
  InstructionBudgetExceededError,
  InvalidChoiceError,
  EmptyCallStackError,
  VMRuntimeError,
  SceneNotFoundError,
} from '../src/errors';
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
    expect(res2.sideEffects).toHaveLength(0);

    // Lượt 3: hết chương trình
    const res3 = vm.runUntilInteractive();
    expect(res3.stepResult.type).toBe('HALTED');
  });

  it('should suspend on WAIT instruction and resume to next interactive step', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'wait_demo' },
      { type: 'SHOW', character: 'amiya', sprite: 'default', x: 0.1, y: 1 },
      { type: 'WAIT', duration: 0.5 },
      { type: 'SHOW', character: 'amiya', sprite: 'default', x: 0.5, y: 1 },
      { type: 'DIALOGUE', character: 'amiya', text: 'hi doctor' },
    ];

    const vm = new VisualNovelVM(program);

    // Turn 1: runs SHOW 1 then pauses at WAIT
    const r1 = vm.runUntilInteractive();
    expect(r1.stepResult.type).toBe('SUSPEND_WAIT');
    if (r1.stepResult.type === 'SUSPEND_WAIT') {
      expect(r1.stepResult.duration).toBe(0.5);
    }
    expect(r1.sideEffects).toHaveLength(2); // SCENE + SHOW 1
    expect(r1.sideEffects[1]?.type).toBe('SHOW');

    // Turn 2: resumes from WAIT, executes SHOW 2 and pauses at DIALOGUE
    const r2 = vm.runUntilInteractive();
    expect(r2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(r2.sideEffects).toHaveLength(1); // SHOW 2
    expect(r2.sideEffects[0]?.type).toBe('SHOW');

    // Turn 3: finishes
    const r3 = vm.runUntilInteractive();
    expect(r3.stepResult.type).toBe('HALTED');
  });

  it('should handle empty programs and programs with only side effects', () => {
    // 1. Chương trình hoàn toàn rỗng
    const emptyVM = new VisualNovelVM([]);
    const emptyRes = emptyVM.runUntilInteractive();
    expect(emptyRes.stepResult.type).toBe('HALTED');

    // 2. Chương trình chỉ có side-effects (không có thoại hay lựa chọn)
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

  it('should handle REVEAL and update characterDisplayOverrides', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'alice', text: 'Tôi giấu tên.', displayNameOverride: '???' },
      { type: 'REVEAL', characterId: 'alice', displayName: 'Alice' },
      { type: 'DIALOGUE', character: 'alice', text: 'Giờ bạn đã biết tên tôi.' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();
    expect(vm.getState().characterDisplayOverrides['alice']).toBeUndefined();

    vm.runUntilInteractive();
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

  it('should abort and throw InstructionBudgetExceededError on infinite loops and infinite goto cycles', () => {
    // 1. While loop vô hạn
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

    // 2. Vòng lặp chuyển scene liên tục (scene A -> goto B -> goto A)
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
      { type: 'RETURN' }, // Gọi RETURN khi callStack đã rỗng -> lỗi

      { type: 'SCENE', name: 'level1' },
      { type: 'CALL', targetScene: 'level2' },
      { type: 'RETURN' },

      { type: 'SCENE', name: 'level2' },
      { type: 'DIALOGUE', character: null, text: 'Ở level 2.' },
      { type: 'RETURN' },
    ];

    const vm = new VisualNovelVM(program);

    // Đi sâu qua 2 cấp: main -> level1 -> level2
    const r1 = vm.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('Ở level 2.');
    expect(vm.getState().callStack).toHaveLength(2);

    // Return từ level 2 về level 1, return tiếp về main
    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toBe('Trở về main.');
    expect(vm.getState().callStack).toHaveLength(0);

    // Return khi callStack rỗng
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

    // VM không thỏa mãn bất kỳ điều kiện nào (hasKey=false, gold=50)
    const vm = new VisualNovelVM(program, undefined, {
      initialVariables: { hasKey: false, gold: 50 },
    });

    const suspendRes = vm.runUntilInteractive();
    expect(suspendRes.stepResult.type).toBe('SUSPEND_CHOICE');

    const choices = vm.getAvailableChoices();
    expect(choices[0]?.enabled).toBe(false);
    expect(choices[1]?.enabled).toBe(false);

    // Cố chọn lựa chọn bị khóa
    expect(() => vm.choose(0)).toThrowError(InvalidChoiceError);

    // Cố chọn chỉ mục ngoài phạm vi
    expect(() => vm.choose(-1)).toThrowError(InvalidChoiceError);
    expect(() => vm.choose(99)).toThrowError(InvalidChoiceError);

    // Cập nhật biến để thỏa mãn điều kiện và chọn thành công
    const vm2 = new VisualNovelVM(program, undefined, {
      initialVariables: { hasKey: true, gold: 50 },
    });
    vm2.runUntilInteractive();
    expect(vm2.getAvailableChoices()[0]?.enabled).toBe(true);
    vm2.choose(0);
    const r1 = vm2.runUntilInteractive();
    expect(asDialogue(r1.stepResult).text).toBe('Dùng chìa khóa.');

    // Gọi choose() khi VM đang ở DIALOGUE (không phải CHOICE) -> ném InvalidChoiceError
    expect(() => vm2.choose(0)).toThrowError(InvalidChoiceError);
  });

  it('should accurately track visual and audio states via getStateCatchUp() across progress and rollback', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'stage1' },
      { type: 'BACKGROUND', assetId: 'bg_day' },
      { type: 'SHOW', character: 'alice', sprite: 'happy', position: 'left' },
      { type: 'PLAY', channel: 'music', assetId: 'theme.mp3', volume: 1.0 },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào buổi sáng.' },

      { type: 'SCENE', name: 'stage2' },
      { type: 'BACKGROUND', assetId: 'bg_night' },
      { type: 'SHOW', character: 'bob', sprite: 'normal', position: 'right' },
      { type: 'HIDE', character: 'alice' },
      { type: 'STOP', channel: 'music' },
      { type: 'DIALOGUE', character: 'bob', text: 'Chào buổi tối.' },
    ];

    const vm = new VisualNovelVM(program);

    // Điểm dừng 1: Stage 1
    vm.runUntilInteractive();
    const catchUp1 = vm.getStateCatchUp();
    expect(catchUp1.background?.assetId).toBe('bg_day');
    expect(catchUp1.sprites.has('alice')).toBe(true);
    expect(catchUp1.sprites.has('bob')).toBe(false);
    expect(catchUp1.audio.has('music')).toBe(true);
    expect(catchUp1.currentDialogue?.text).toBe('Chào buổi sáng.');

    // Điểm dừng 2: Stage 2
    vm.runUntilInteractive();
    const catchUp2 = vm.getStateCatchUp();
    expect(catchUp2.background?.assetId).toBe('bg_night');
    expect(catchUp2.sprites.has('alice')).toBe(false); // Alice đã bị HIDE
    expect(catchUp2.sprites.has('bob')).toBe(true); // Bob đang hiển thị
    expect(catchUp2.audio.has('music')).toBe(false); // Nhạc đã bị STOP
    expect(catchUp2.currentDialogue?.text).toBe('Chào buổi tối.');

    // Rollback về Stage 1
    expect(vm.canRollback()).toBe(true);
    vm.rollback();

    // Catch-up phải phản ánh đúng trạng thái quá khứ của Stage 1!
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
        character: 'alice',
        sprite: 'happy',
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
        character: 'alice',
        sprite: 'shocked',
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

    // Stage 2
    vm.runUntilInteractive();
    const catchUp2 = vm.getStateCatchUp();
    const alice2 = catchUp2.sprites.get('alice');
    expect(alice2?.scale).toBe(2.0);
    expect(alice2?.rotate).toBe(45);
    expect(alice2?.flipX).toBe(false);

    // Rollback về Stage 1
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
    vm.runUntilInteractive(); // Dừng ở Thoại 1
    vm.runUntilInteractive(); // Dừng ở CHOICE

    // Lưu game tại thời điểm đang dừng ở CHOICE
    const savedJson = vm.serialize();
    expect(typeof savedJson).toBe('string');

    // Khôi phục trên một VM hoàn toàn mới
    const loadedVM = new VisualNovelVM(program);
    loadedVM.restore(savedJson);

    // Trạng thái biến được giữ nguyên
    expect(loadedVM.getState().variables['score']).toBe(100);

    // Lựa chọn CHOICE vẫn hoạt động bình thường
    const choices = loadedVM.getAvailableChoices();
    expect(choices).toHaveLength(2);
    loadedVM.choose(0);

    const afterChoiceRes = loadedVM.runUntilInteractive();
    expect(asDialogue(afterChoiceRes.stepResult).text).toBe('Nhánh A');

    // Kiểm tra bảo vệ khi nạp dữ liệu save hỏng
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
    vm.runUntilInteractive(); // Đang ở chapter1

    // 1. Nhảy bằng local dot label trong chapter1 -> phải tới chapter1.ask_question
    vm.jumpToScene('.ask_question');
    expect(vm.getState().currentScene).toBe('chapter1.ask_question');
    const res1 = vm.runUntilInteractive();
    expect(asDialogue(res1.stepResult).text).toBe('Câu hỏi chương 1');

    // 2. Chuyển sang chapter5
    vm.jumpToScene('chapter5');
    expect(vm.getState().currentScene).toBe('chapter5');
    vm.runUntilInteractive();

    // Nhảy bằng local dot label trong chapter5 -> phải tới chapter5.ask_question
    vm.jumpToScene('.ask_question');
    expect(vm.getState().currentScene).toBe('chapter5.ask_question');
    const res2 = vm.runUntilInteractive();
    expect(asDialogue(res2.stepResult).text).toBe('Câu hỏi chương 5');

    // 3. Cố gắng nhảy tới tên chưa resolve / thiếu dấu chấm ("ask_question")
    // Tuyệt đối không được đoán hậu tố (suffix match) mà phải quăng lỗi SceneNotFoundError
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

    // Chọn lựa chọn 0 (Call)
    vm.choose(0);
    expect(vm.getState().callStack).toHaveLength(1);
    expect(vm.getState().currentScene).toBe('start.c1');

    // Chạy tới câu thoại trong branch 1
    const r2 = vm.runUntilInteractive();
    expect(asDialogue(r2.stepResult).text).toBe('Inside branch 1.');

    // Chạy tiếp -> gặp RETURN trong branch 1, tự pop callStack và quay lại câu thoại "After choice continuation." trong scene start
    const r3 = vm.runUntilInteractive();
    expect(asDialogue(r3.stepResult).text).toBe('After choice continuation.');
    expect(vm.getState().currentScene).toBe('start');
    expect(vm.getState().callStack).toHaveLength(0);

    // Chạy tiếp -> HALT
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

    // Chạy lệnh RETURN khi callStack rỗng với emptyCallStackBehavior: 'halt'
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
    // Nhảy tới dòng 12 (trong scene2)
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
    // Kịch bản: A calls B. B goto C. C reaches SCENE_END without explicit return.
    // SCENE_END của C không được pop frame của B và return về A!
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

    // Chạy tiếp qua SCENE_END của scene_c
    const r2 = vm.runUntilInteractive();
    // Vì scene_c !== callStack[0].targetScene ('scene_b'), VM KHÔNG pop frame và KHÔNG return về scene_a.
    // Thay vào đó chương trình kết thúc vì hết program.
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
});
