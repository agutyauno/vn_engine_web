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
  ShowInstruction,
  HideInstruction,
  StopInstruction,
  AssignInstruction,
} from '@vn-engine/shared-types';
import { compileString } from '../src/compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DSL Compiler Core (5-Stage Pipeline)', () => {
  it('should compile the Golden Scenario successfully into Bytecode', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'golden_scenario_p0.vns');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const result = compileString(content, 'golden_scenario_p0.vns');

    if (!result.success) {
      console.error('Compiler Errors:', result.errors);
    }
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const program = result.program!;
    expect(program.length).toBeGreaterThan(15);

    // Kiểm tra câu lệnh scene đầu tiên
    const firstScene = program[0];
    expect(firstScene?.type).toBe('SCENE');
    if (firstScene?.type === 'SCENE') {
      expect(firstScene.name).toBe('chapter1_alice_route');
    }

    // Kiểm tra hội thoại & ghi đè tên hiển thị
    const dialogues = program.filter(i => i.type === 'DIALOGUE') as DialogueInstruction[];
    expect(dialogues.length).toBeGreaterThan(5);

    const firstDialogue = dialogues[0]!;
    expect(firstDialogue.character).toBe('alice');
    expect(firstDialogue.displayNameOverride).toBe('???');
    expect(firstDialogue.text).toBe('Cậu... là ai vậy?');
    expect(firstDialogue.uiScreenId).toBe('phone_message_style');

    // Kiểm tra câu lệnh REVEAL
    const reveals = program.filter(i => i.type === 'REVEAL') as RevealInstruction[];
    expect(reveals).toHaveLength(1);
    expect(reveals[0]!.characterId).toBe('alice');
    expect(reveals[0]!.displayName).toBe('Alice');

    // Kiểm tra vòng lặp while
    const loopStarts = program.filter(i => i.type === 'LOOP_START');
    const loopEnds = program.filter(i => i.type === 'LOOP_END');
    expect(loopStarts).toHaveLength(1);
    expect(loopEnds).toHaveLength(1);

    // Kiểm tra CHOICE
    const choices = program.filter(i => i.type === 'CHOICE') as ChoiceInstruction[];
    expect(choices).toHaveLength(1);
    const choiceInstr = choices[0]!;
    expect(choiceInstr.choices).toHaveLength(3);
    expect(choiceInstr.choices[0]!.text).toBe('Tặng hoa và rủ đi chơi');
    expect(choiceInstr.choices[0]!.condition).toBeDefined();

    // Background & BGM
    const bg = program.find(i => i.type === 'BACKGROUND') as BackgroundInstruction | undefined;
    expect(bg?.assetId).toBe('bg_classroom');

    const bgm = program.find(i => i.type === 'PLAY') as PlayInstruction | undefined;
    expect(bgm?.channel).toBe('music');
    expect(bgm?.volume).toBe(0.7);
    expect(bgm?.loop).toBe(true);
  });

  it('should compile anonymous narrator dialogues without character identifier', () => {
    const dsl = `
      scene narrator_scene {
        "Một buổi sáng mùa hè oi ả..."
        "Tiếng ve kêu râm ran khắp sân trường."
      }
    `;

    const result = compileString(dsl, 'narrator.vns');
    expect(result.success).toBe(true);
    const dialogues = result.program!.filter(i => i.type === 'DIALOGUE') as DialogueInstruction[];
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0]?.character).toBeNull();
    expect(dialogues[0]?.text).toBe('Một buổi sáng mùa hè oi ả...');
    expect(dialogues[1]?.character).toBeNull();
  });

  it('should compile empty scenes without error', () => {
    const dsl = `
      scene empty_1 {}
      scene empty_2 {}
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.program).toHaveLength(4);
    expect(result.program![0]?.type).toBe('SCENE');
    expect(result.program![1]?.type).toBe('SCENE_END');
    expect(result.program![2]?.type).toBe('SCENE');
    expect(result.program![3]?.type).toBe('SCENE_END');
  });

  it('should compile end statement into HALT instruction', () => {
    const dsl = `
      scene game_over {
        "Hạ màn."
        end
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
    const haltInstr = result.program?.find(i => i.type === 'HALT');
    expect(haltInstr).toBeDefined();
  });

  it('should compile show, hide, stop with full arguments and transitions', () => {
    const dsl = `
      scene visual_test {
        show alice.happy(position: "left", transition: "dissolve", duration: 0.5s)
        hide alice
        stop music fade_out: 2s
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const show = result.program!.find(i => i.type === 'SHOW') as ShowInstruction | undefined;
    expect(show?.character).toBe('alice');
    expect(show?.sprite).toBe('happy');
    expect(show?.position).toBe('left');
    expect(show?.transition).toBe('dissolve');
    expect(show?.duration).toBe(0.5);

    const hide = result.program!.find(i => i.type === 'HIDE') as HideInstruction | undefined;
    expect(hide?.character).toBe('alice');

    const stop = result.program!.find(i => i.type === 'STOP') as StopInstruction | undefined;
    expect(stop?.channel).toBe('music');
    expect(stop?.fadeOut).toBe(2);
  });

  it('should compile variable assignment with arithmetic and logical expressions', () => {
    const dsl = `
      scene var_scene {
        ~ score = 100
        ~ score = score + 25
        ~ isWinner = score >= 120 && hasTicket == true
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const assigns = result.program!.filter(i => i.type === 'ASSIGN') as AssignInstruction[];
    expect(assigns).toHaveLength(3);
    expect(assigns[0]?.variable).toBe('score');
    expect(assigns[1]?.value.type).toBe('BinaryExpression');
    expect(assigns[2]?.variable).toBe('isWinner');
  });

  it('should compile nested sub-scenes and flatten dot identifiers', () => {
    const dsl = `
      scene chapter1 {
        scene .part1 {
          alice: "Đoạn 1"
          goto .part2
        }
        scene .part2 {
          alice: "Đoạn 2"
        }
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const sceneNames = result
      .program!.filter(i => i.type === 'SCENE')
      .map(s => (s as { name: string }).name);
    expect(sceneNames).toContain('chapter1');
    expect(sceneNames).toContain('chapter1.part1');
    expect(sceneNames).toContain('chapter1.part2');
  });

  it('should compile if/else branch with conditional jumps', () => {
    const dsl = `
      scene branch_scene {
        if score > 50 {
          alice: "Điểm cao!"
        } else {
          alice: "Cần cố gắng hơn."
        }
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const condGotos = result.program!.filter(i => i.type === 'CONDITIONAL_GOTO');
    expect(condGotos.length).toBeGreaterThanOrEqual(1);
  });

  it('should compile variable assignment immediately followed by character dialogue', () => {
    const dsl = `
      scene test_order {
        ~ energy = energy - 15
        alice: "Chiếc đèn pin này sẽ giúp chúng ta soi được những góc tối hẹp đấy!"
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
  });

  it('should compile variable assignment immediately followed by anonymous dialogue', () => {
    const dsl = `
      scene test_order {
        ~ energy = energy - 15
        "Tiếng bước chân lại gần..."
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
  });

  it('should compile scenario.vns successfully without syntax or semantic errors', () => {
    const scenarioPath = path.resolve(__dirname, '../../../apps/runtime-player/src/scenario.vns');
    const content = fs.readFileSync(scenarioPath, 'utf-8');
    const result = compileString(content, 'scenario.vns');
    if (!result.success) {
      console.error('scenario.vns compile errors:', result.errors);
    }
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.program!.length).toBeGreaterThan(50);
  });
});

