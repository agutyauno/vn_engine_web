import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import type {
  Instruction,
  PauseInstruction,
  DialogueInstruction,
  RollbackResult,
} from '@vn-engine/shared-types';

describe('Pause Instruction & Interactive Suspend (TASK-pause-statement)', () => {
  // ---------------------------------------------------------------------------
  // TC-PAUSE-VM-01 (Single Step Execution)
  // ---------------------------------------------------------------------------
  describe('TC-PAUSE-VM-01: Single Step Execution of PAUSE Instruction', () => {
    it('vm.step() on PAUSE sets activeExecutingPc, increments instructionPointer before snapshot, captures PAUSE snapshot, and returns SUSPEND_PAUSE', () => {
      const pauseInstr: PauseInstruction = { type: 'PAUSE' };
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        { type: 'DIALOGUE', character: 'alice', text: 'Before pause' },
        pauseInstr,
        { type: 'DIALOGUE', character: 'alice', text: 'Hello after pause' },
      ];

      const vm = new VisualNovelVM(program);

      // Step 0: Execute SCENE 'main' -> instructionPointer moves from 0 to 1
      const sceneStep = vm.step();
      expect(sceneStep.type).toBe('SIDE_EFFECT');
      expect(vm.getState().instructionPointer).toBe(1);

      // Step 1: Execute DIALOGUE 'Before pause' -> captures dialogue snapshot
      const diagStep = vm.step();
      expect(diagStep.type).toBe('SUSPEND_DIALOGUE');
      expect(vm.getState().instructionPointer).toBe(2);

      // Step 2: Execute PAUSE instruction at index 2
      const pauseStep = vm.step();

      // 1. Phải trả về { type: 'SUSPEND_PAUSE', instruction: pauseInstr }
      expect(pauseStep.type).toBe('SUSPEND_PAUSE');
      expect((pauseStep as any).instruction).toEqual(pauseInstr);

      // 2. activeExecutingPc phải lưu vị trí chỉ lệnh PAUSE (index 2)
      expect(vm.getState().activeExecutingPc).toBe(2);

      // 3. getActiveInstruction() phải trả về chính chỉ lệnh PAUSE
      expect((vm as any).getActiveInstruction?.()).toEqual(pauseInstr);

      // 4. instructionPointer phải được tăng lên 3 TRƯỚC KHI lưu snapshot để tránh Double-Pause
      expect(vm.getState().instructionPointer).toBe(3);

      // 5. Snapshot phải được lưu vào ringBuffer với interactionType: 'PAUSE'
      expect(vm.canRollback()).toBe(true);
      const rollbackResult = (vm.rollback() as any);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.poppedInteractionType).toBe('PAUSE');
      expect(rollbackResult.restoredInteractionType).toBe('DIALOGUE');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-PAUSE-VM-02 (runUntilInteractive with Side Effects)
  // ---------------------------------------------------------------------------
  describe('TC-PAUSE-VM-02: runUntilInteractive Stopping at PAUSE', () => {
    it('collects all preceding side-effects (BACKGROUND, HIDE_DIALOGUE, PLAY) and suspends exactly at PAUSE', () => {
      const pauseInstr: PauseInstruction = { type: 'PAUSE' };
      const program: Instruction[] = [
        { type: 'SCENE', name: 'cg_gallery' },
        { type: 'BACKGROUND', assetId: 'cg_sunset' },
        { type: 'HIDE_DIALOGUE' },
        { type: 'PLAY', channel: 'sound', assetId: 'sfx_wind.mp3' },
        pauseInstr,
        { type: 'DIALOGUE', character: null, text: 'Ánh chiều tà buông xuống...' },
      ];

      const vm = new VisualNovelVM(program);

      // Chạy liên tục tới điểm tương tác
      const result = vm.runUntilInteractive();

      // 1. Dừng lại chính xác tại PAUSE với suspendReason.type === 'SUSPEND_PAUSE'
      expect(result.stepResult.type).toBe('SUSPEND_PAUSE');
      expect((result.stepResult as any).instruction).toEqual(pauseInstr);

      // 2. Thu thập đầy đủ tất cả side-effects đứng trước
      expect(result.sideEffects).toHaveLength(4);
      expect(result.sideEffects[0]?.type).toBe('SCENE');
      expect(result.sideEffects[1]?.type).toBe('BACKGROUND');
      expect(result.sideEffects[2]?.type).toBe('HIDE_DIALOGUE');
      expect(result.sideEffects[3]?.type).toBe('PLAY');

      // 3. instructionPointer đang trỏ vào câu thoại kế tiếp (index 5)
      expect(vm.getState().instructionPointer).toBe(5);

      // 4. Tiếp tục chạy sau khi người chơi bấm tiếp tục -> chuyển tới câu thoại tiếp theo
      const nextResult = vm.runUntilInteractive();
      expect(nextResult.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(((nextResult.stepResult as any).instruction as DialogueInstruction).text).toBe(
        'Ánh chiều tà buông xuống...',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // TC-PAUSE-VM-03 (Rollback Buffer Snapshot & No Double-Pause)
  // ---------------------------------------------------------------------------
  describe('TC-PAUSE-VM-03: Rollback Buffer Snapshot & Prevention of Double-Pause', () => {
    it('vm.rollback() returns RollbackResult with popped and restored interactionType, and advancing after rollback does not cause Double-Pause', () => {
      const pauseInstr: PauseInstruction = { type: 'PAUSE' };
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        { type: 'DIALOGUE', character: 'alice', text: 'Câu thoại 1' },
        pauseInstr,
        { type: 'DIALOGUE', character: 'alice', text: 'Câu thoại 2' },
      ];

      const vm = new VisualNovelVM(program);

      // 1. Chạy tới Câu thoại 1
      const step1 = vm.runUntilInteractive();
      expect(step1.stepResult.type).toBe('SUSPEND_DIALOGUE');

      // 2. Chạy tới PAUSE
      const step2 = vm.runUntilInteractive();
      expect(step2.stepResult.type).toBe('SUSPEND_PAUSE');
      expect(vm.getState().activeExecutingPc).toBe(2);

      // 3. Chạy tới Câu thoại 2
      const step3 = vm.runUntilInteractive();
      expect(step3.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(vm.getState().instructionPointer).toBe(4);

      // 4. Tua lùi lần 1: từ Câu thoại 2 ngược về điểm PAUSE
      const rb1 = vm.rollback() as any;
      expect(rb1.success).toBe(true);
      expect(rb1.poppedInteractionType).toBe('DIALOGUE');
      expect(rb1.restoredInteractionType).toBe('PAUSE');
      expect(vm.getState().activeExecutingPc).toBe(2);
      expect((vm as any).getActiveInstruction?.()).toEqual(pauseInstr);

      // 5. Kiểm tra No Double-Pause: người chơi nhấn tiếp tục từ điểm PAUSE
      // Do IP đã được tăng lên 3 trước khi chụp snapshot, lần chạy tiếp theo
      // PHẢI tiến thẳng tới Câu thoại 2, KHÔNG ĐƯỢC kẹt lại ở PAUSE lần thứ 2!
      const resumeResult = vm.runUntilInteractive();
      expect(resumeResult.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(((resumeResult.stepResult as any).instruction as DialogueInstruction).text).toBe(
        'Câu thoại 2',
      );

      // 6. Tua lùi lại về PAUSE, rồi tua lùi tiếp về Câu thoại 1
      const rb2 = vm.rollback() as any; // Từ Câu thoại 2 về PAUSE
      expect(rb2.success).toBe(true);
      expect(rb2.poppedInteractionType).toBe('DIALOGUE');
      expect(rb2.restoredInteractionType).toBe('PAUSE');

      const rb3 = vm.rollback() as any; // Từ PAUSE về Câu thoại 1
      expect(rb3.success).toBe(true);
      expect(rb3.poppedInteractionType).toBe('PAUSE');
      expect(rb3.restoredInteractionType).toBe('DIALOGUE');
      expect(vm.getState().currentDialogue?.text).toBe('Câu thoại 1');

      // 7. Tua lùi khi đã ở đầu lịch sử -> success: false
      const rb4 = vm.rollback() as any;
      expect(rb4.success).toBe(false);
    });

    it('preserves PAUSE activeExecutingPc through save serialization and restoration', () => {
      const pauseInstr: PauseInstruction = { type: 'PAUSE' };
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        { type: 'DIALOGUE', character: 'alice', text: 'Trước pause' },
        pauseInstr,
        { type: 'DIALOGUE', character: 'alice', text: 'Sau pause' },
      ];

      const vm = new VisualNovelVM(program);
      vm.runUntilInteractive(); // Trước pause
      vm.runUntilInteractive(); // Dừng tại PAUSE
      expect(vm.getState().activeExecutingPc).toBe(2);

      // Serialize save state tại điểm pause
      const savedStateJson = vm.serialize();

      // Nạp vào máy ảo mới
      const restoredVM = new VisualNovelVM(program);
      restoredVM.restore(savedStateJson);

      expect(restoredVM.getState().activeExecutingPc).toBe(2);
      expect((restoredVM as any).getActiveInstruction?.()).toEqual(pauseInstr);

      // Sau khi khôi phục, người chơi bấm tiếp tục -> tiến thẳng đến "Sau pause"
      const resume = restoredVM.runUntilInteractive();
      expect(resume.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(((resume.stepResult as any).instruction as DialogueInstruction).text).toBe(
        'Sau pause',
      );
    });
  });
});

