/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileString } from '@vn-engine/dsl-compiler';
import { VisualNovelVM } from '../src/vm';
import type { DialogueInstruction, StepResult } from '@vn-engine/shared-types';

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Headless Smoke Test (Golden Scenario P0 End-to-End)', () => {
  it('should compile and simulate a full playthrough of golden_scenario_p0.vns to Good Ending', () => {
    // 1. Đọc kịch bản vàng từ thư mục fixtures dùng chung
    const fixturePath = path.resolve(__dirname, '../../dsl-compiler/tests/fixtures/golden_scenario_p0.vns');
    const source = fs.readFileSync(fixturePath, 'utf-8');

    // 2. Biên dịch qua DSL Compiler
    const compileResult = compileString(source, 'golden_scenario_p0.vns');
    expect(compileResult.success).toBe(true);
    expect(compileResult.program).toBeDefined();
    const bytecode = compileResult.program!;

    // 3. Khởi tạo Máy ảo VM với túi đồ có "flower"
    const vm = new VisualNovelVM(bytecode, undefined, {
      customFunctions: {
        has_item: (item: unknown) => item === 'flower',
      },
    });

    // -------------------------------------------------------------
    // Bước 1: Khởi đầu kịch bản — Chạy đến câu thoại 1
    // -------------------------------------------------------------
    const step1 = vm.runUntilInteractive();
    expect(step1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag1 = asDialogue(step1.stepResult);
    expect(diag1.character).toBe('alice');
    expect(diag1.displayNameOverride).toBe('???');
    expect(diag1.text).toBe('Cậu... là ai vậy?');

    // Kiểm tra đã nạp đúng tài nguyên hình ảnh và âm thanh ở đầu game
    const catchup1 = vm.getStateCatchUp();
    expect(catchup1.background?.assetId).toBe('bg_classroom');
    expect(catchup1.sprites.get('alice')?.sprite).toBe('happy');
    expect(catchup1.audio.get('music')?.assetId).toBe('bgm_school.mp3');

    // -------------------------------------------------------------
    // Bước 2: Câu thoại 2
    // -------------------------------------------------------------
    const step2 = vm.runUntilInteractive();
    expect(step2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag2 = asDialogue(step2.stepResult);
    expect(diag2.text).toBe('Đừng lo, tôi không hại cậu đâu.');

    // -------------------------------------------------------------
    // Bước 3: Vòng lặp while (tăng affection từ 0 lên 100 qua 5 lần tặng hoa)
    // -------------------------------------------------------------
    let loopIteration = 0;

    while (
      vm.getState().variables['affection'] === undefined ||
      (vm.getState().variables['affection'] as number) < 100
    ) {
      loopIteration++;
      if (loopIteration > 10) break; // Chống lặp vô tận trong test

      // Dừng ở câu hỏi của Alice trong .ask_question
      const questionStep = vm.runUntilInteractive();
      expect(questionStep.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(asDialogue(questionStep.stepResult).text).toBe('Cậu có muốn đi chơi với tớ không?');

      // Tiến tới menu CHOICE
      const choiceStep = vm.runUntilInteractive();
      expect(choiceStep.stepResult.type).toBe('SUSPEND_CHOICE');

      // Kiểm tra nhánh "Tặng hoa" được mở khóa
      const availableChoices = vm.getAvailableChoices();
      expect(availableChoices[0]?.text).toBe('Tặng hoa và rủ đi chơi');
      expect(availableChoices[0]?.enabled).toBe(true);

      // Chọn lựa chọn 0: Tặng hoa
      vm.choose(0);

      // Dừng ở câu cảm ơn trong .flower_result
      const thankStep = vm.runUntilInteractive();
      expect(thankStep.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(asDialogue(thankStep.stepResult).text).toBe('Ôi, cảm ơn cậu!');

      // Dừng ở câu chào tạm biệt trong .end
      const byeStep = vm.runUntilInteractive();
      expect(byeStep.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(asDialogue(byeStep.stepResult).text).toBe('Hẹn gặp lại nhé.');
    }

    // Xác nhận đã lặp 5 lần để đạt đủ 100 điểm thiện cảm (mỗi lần +20 điểm)
    expect(loopIteration).toBe(5);
    expect(vm.getState().variables['affection']).toBe(100);

    // -------------------------------------------------------------
    // Bước 4: Kiểm tra Rollback giữa game
    // -------------------------------------------------------------
    expect(vm.canRollback()).toBe(true);
    // Tua lùi 1 câu thoại: quay về câu "Ôi, cảm ơn cậu!" (lúc này điểm chưa cộng 20 nên là 80)
    expect(vm.rollback()).toBe(true);
    expect(vm.getState().variables['affection']).toBe(80);

    // Tua tiến lại về câu "Hẹn gặp lại nhé." (điểm trở lại 100)
    expect(vm.canRollforward()).toBe(true);
    expect(vm.rollforward()).toBe(true);
    expect(vm.getState().variables['affection']).toBe(100);

    // -------------------------------------------------------------
    // Bước 5: Tiếp tục chạy sau khi affection >= 100 -> Nhảy tới Good Ending
    // -------------------------------------------------------------
    const endingStep = vm.runUntilInteractive();
    expect(endingStep.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const endingDiag = asDialogue(endingStep.stepResult);
    expect(endingDiag.character).toBeNull(); // narrator
    expect(endingDiag.text).toBe('Và họ sống hạnh phúc mãi mãi.');
    expect(vm.getState().currentScene).toBe('good_ending');

    // Tiếp tục sang Normal Ending theo thứ tự tuần tự của kịch bản
    const normalEndingStep = vm.runUntilInteractive();
    expect(normalEndingStep.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const normalDiag = asDialogue(normalEndingStep.stepResult);
    expect(normalDiag.text).toBe('Một kết thúc bình yên.');

    // -------------------------------------------------------------
    // Bước 6: Hoàn tất toàn bộ kịch bản -> HALTED
    // -------------------------------------------------------------
    const finalStep = vm.runUntilInteractive();
    expect(finalStep.stepResult.type).toBe('HALTED');
  });
});
