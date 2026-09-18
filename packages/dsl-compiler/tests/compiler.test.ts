/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DialogueInstruction,
  RevealInstruction,
  ChoiceInstruction,
  BackgroundInstruction,
  PlayInstruction,
} from '@vn-engine/shared-types';
import { compileString } from '../src/compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DSL Compiler Core (5-Stage Pipeline)', () => {
  it('should compile the Golden Scenario (mục 10 dsl spec.md) successfully into Bytecode', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'golden_scenario_p0.vns');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const result = compileString(content, 'golden_scenario_p0.vns');

    // 1. Kiểm tra thành công, không có lỗi cú pháp hay ngữ nghĩa
    if (!result.success) {
      console.error('Compiler Errors:', result.errors);
    }
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const program = result.program!;
    expect(program.length).toBeGreaterThan(15);

    // 2. Kiểm tra câu lệnh scene đầu tiên
    const firstScene = program[0];
    expect(firstScene?.type).toBe('SCENE');
    if (firstScene?.type === 'SCENE') {
      expect(firstScene.name).toBe('chapter1_alice_route');
    }

    // 3. Kiểm tra hội thoại & ghi đè tên hiển thị (Cách A: as "???")
    const dialogues = program.filter(i => i.type === 'DIALOGUE') as DialogueInstruction[];
    expect(dialogues.length).toBeGreaterThan(5);

    const firstDialogue = dialogues[0]!;
    expect(firstDialogue.character).toBe('alice');
    expect(firstDialogue.displayNameOverride).toBe('???');
    expect(firstDialogue.text).toBe('Cậu... là ai vậy?');
    // Kiểm tra kế thừa ui: "phone_message_style" từ scene cha
    expect(firstDialogue.uiScreenId).toBe('phone_message_style');

    // 4. Kiểm tra câu lệnh tiết lộ tên thật (Cách B: REVEAL)
    const reveals = program.filter(i => i.type === 'REVEAL') as RevealInstruction[];
    expect(reveals).toHaveLength(1);
    expect(reveals[0]!.characterId).toBe('alice');
    expect(reveals[0]!.displayName).toBe('Alice');

    // 5. Kiểm tra vòng lặp while
    const loopStarts = program.filter(i => i.type === 'LOOP_START');
    const loopEnds = program.filter(i => i.type === 'LOOP_END');
    expect(loopStarts).toHaveLength(1);
    expect(loopEnds).toHaveLength(1);

    // 6. Kiểm tra câu lệnh rẽ nhánh CHOICE
    const choices = program.filter(i => i.type === 'CHOICE') as ChoiceInstruction[];
    expect(choices).toHaveLength(1);
    const choiceInstr = choices[0]!;
    expect(choiceInstr.choices).toHaveLength(3);

    // Lựa chọn có điều kiện has_item("flower")
    expect(choiceInstr.choices[0]!.text).toBe('Tặng hoa và rủ đi chơi');
    expect(choiceInstr.choices[0]!.condition).toBeDefined();
    expect(choiceInstr.choices[0]!.condition?.type).toBe('CallExpression');
    expect(choiceInstr.choices[0]!.targetScene).toBe('chapter1_alice_route.flower_result');

    // Lựa chọn không điều kiện
    expect(choiceInstr.choices[1]!.text).toBe('Đồng ý');
    expect(choiceInstr.choices[1]!.targetScene).toBe('chapter1_alice_route.end');

    // 7. Kiểm tra âm thanh và background
    const bg = program.find(i => i.type === 'BACKGROUND') as BackgroundInstruction | undefined;
    expect(bg).toBeDefined();
    expect(bg?.assetId).toBe('bg_classroom');

    const bgm = program.find(i => i.type === 'PLAY') as PlayInstruction | undefined;
    expect(bgm).toBeDefined();
    expect(bgm?.channel).toBe('music');
    expect(bgm?.volume).toBe(0.7);
    expect(bgm?.loop).toBe(true);
  });

  it('should report semantic errors when goto targets non-existent scene', () => {
    const invalidDsl = `
      scene intro {
        alice: "Đi thôi!"
        goto non_existent_scene
      }
    `;

    const result = compileString(invalidDsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain('non_existent_scene');
  });

  it('should report syntax errors with line coordinates when syntax is broken', () => {
    const brokenDsl = `
      scene intro {
        alice: "Chưa đóng ngoặc nháy
      }
    `;

    const result = compileString(brokenDsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});
