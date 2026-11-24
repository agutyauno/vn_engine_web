/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DialogueInstruction,
  ChoiceInstruction,
  BackgroundInstruction,
  PlayInstruction,
  ShowInstruction,
  HideInstruction,
  StopInstruction,
  AssignInstruction,
  ShowStatement,
  HideStatement,
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
    const firstScene = program.find(i => i.type === 'SCENE');
    expect(firstScene?.type).toBe('SCENE');
    if (firstScene?.type === 'SCENE') {
      expect(firstScene.name).toBe('chapter1_alice_route');
    }

    // Kiểm tra hội thoại & ghi đè tên hiển thị
    const dialogues = program.filter(i => i.type === 'DIALOGUE') as DialogueInstruction[];
    expect(dialogues.length).toBeGreaterThan(5);

    const firstDialogue = dialogues[0]!;
    expect(firstDialogue.character).toBe('???');
    expect(firstDialogue.speaker).toBe('???');
    expect(firstDialogue.displayNameOverride).toBeUndefined();
    expect(firstDialogue.text).toBe('Cậu... là ai vậy?');
    expect(firstDialogue.uiScreenId).toBe('phone_message_style');

    // Kiểm tra câu lệnh REVEAL không còn trong golden scenario
    const instructionTypes: string[] = program.map(i => i.type);
    expect(instructionTypes).not.toContain('REVEAL');

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
    expect(show?.targetId).toBe('alice');
    expect(show?.variant).toBe('happy');
    expect(show?.position).toBe('left');
    expect(show?.transition).toBe('dissolve');
    expect(show?.duration).toBe(0.5);

    const hide = result.program!.find(i => i.type === 'HIDE') as HideInstruction | undefined;
    expect(hide?.targetId).toBe('alice');

    const stop = result.program!.find(i => i.type === 'STOP') as StopInstruction | undefined;
    expect(stop?.channel).toBe('music');
    expect(stop?.fadeOut).toBe(2);
  });

  it('should default to "default" when show statement omits sprite variant', () => {
    const dsl = `
      scene default_sprite_test {
        show alice
        show bob(position: "right")
      }
    `;

    const result = compileString(dsl, 'test.vns');
    expect(result.success).toBe(true);

    const shows = result.program!.filter(i => i.type === 'SHOW') as ShowInstruction[];
    expect(shows).toHaveLength(2);
    expect(shows[0]?.targetId).toBe('alice');
    expect(shows[0]?.variant).toBe('default');
    expect(shows[1]?.targetId).toBe('bob');
    expect(shows[1]?.variant).toBe('default');
    expect(shows[1]?.position).toBe('right');
  });

  it('should compile variable assignment with arithmetic and logical expressions', () => {
    const dsl = `
      scene var_scene {
        define score = 100
        ~ score = score + 25
        define isWinner = score >= 120 && score <= 150
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
        define score = 60
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
        define energy = 100
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
        define energy = 100
        ~ energy = energy - 15
        "Tiếng bước chân lại gần..."
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
  });

  it('should compile show statement with all image transform and motion attributes', () => {
    const dsl = `
      scene test_transform {
        show alice.happy(scale: 1.5, rotate: -25, flipX: true, flipY: false, x: 0.35, y: 0.85, offsetX: 10, offsetY: -20, alpha: 0.85, transition: "shake", easing: "ease_out", duration: 0.5s)
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
    const showInstr = result.program!.find(i => i.type === 'SHOW') as ShowInstruction;
    expect(showInstr).toBeDefined();
    expect(showInstr.targetId).toBe('alice');
    expect(showInstr.variant).toBe('happy');
    expect(showInstr.scale).toBe(1.5);
    expect(showInstr.rotate).toBe(-25);
    expect(showInstr.flipX).toBe(true);
    expect(showInstr.flipY).toBe(false);
    expect(showInstr.x).toBe(0.35);
    expect(showInstr.y).toBe(0.85);
    expect(showInstr.offsetX).toBe(10);
    expect(showInstr.offsetY).toBe(-20);
    expect(showInstr.alpha).toBe(0.85);
    expect(showInstr.transition).toBe('shake');
    expect(showInstr.easing).toBe('ease_out');
    expect(showInstr.duration).toBe(0.5);
  });

  it('should compile background statement with transform and motion parameters', () => {
    const dsl = `
      scene test_bg_transform {
        background bg_garden(scale: 1.25, rotate: 5, flipX: true, x: 0.5, y: 0.5, alpha: 0.9, transition: "zoom", easing: "bounce", duration: 1.2s)
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
    const bgInstr = result.program!.find(i => i.type === 'BACKGROUND') as BackgroundInstruction;
    expect(bgInstr).toBeDefined();
    expect(bgInstr.assetId).toBe('bg_garden');
    expect(bgInstr.scale).toBe(1.25);
    expect(bgInstr.rotate).toBe(5);
    expect(bgInstr.flipX).toBe(true);
    expect(bgInstr.x).toBe(0.5);
    expect(bgInstr.y).toBe(0.5);
    expect(bgInstr.alpha).toBe(0.9);
    expect(bgInstr.transition).toBe('zoom');
    expect(bgInstr.easing).toBe('bounce');
    expect(bgInstr.duration).toBe(1.2);
  });

  it('should report compile error when combining position and x/y in show', () => {
    const dsl = `
      scene test_invalid_pos {
        show alice.happy(position: "left", x: 0.2)
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(
      result.errors?.some(e => e.message.includes("cannot use both 'position' and 'x'/'y'")),
    ).toBe(true);
  });

  it('should compile wait statement with duration and number literals', () => {
    const dsl = `
      scene test_wait {
        show alice.happy(x: 0.1, y: 1, transition: "shake", duration: 0.5s)
        wait 0.5s
        show alice.happy(x: 0.5, y: 1)
        wait 1
        alice: "hi doctor"
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
    const waits = result.program!.filter(i => i.type === 'WAIT');
    expect(waits).toHaveLength(2);
    expect(waits[0]).toMatchObject({ type: 'WAIT', duration: 0.5 });
    expect(waits[1]).toMatchObject({ type: 'WAIT', duration: 1.0 });
  });

  it('should compile hide dialogue statement into HIDE_DIALOGUE instruction', () => {
    const dsl = `
      scene start {
        alice: "Hello"
        hide dialogue
        show alice.happy(x: 0.1, y: 1)
        wait 0.5s
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);
    const hideDialogue = result.program!.find(i => i.type === 'HIDE_DIALOGUE');
    expect(hideDialogue).toBeDefined();
    expect(hideDialogue).toMatchObject({ type: 'HIDE_DIALOGUE' });
  });

  it('should compile inspect statement into INSPECT_BEGIN, nested statements, and INSPECT_END', () => {
    const dsl = `
      scene examine_item {
        inspect gold_key title: "Chìa khóa cổ" {
          "Một chiếc chìa khóa bằng đồng đã rỉ sét theo năm tháng."
          alice: "Trông nó có vẻ mở được cánh cửa đấy!"
        }
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const begin = result.program!.find(i => i.type === 'INSPECT_BEGIN');
    const end = result.program!.find(i => i.type === 'INSPECT_END');
    expect(begin).toMatchObject({
      type: 'INSPECT_BEGIN',
      assetId: 'gold_key',
      title: 'Chìa khóa cổ',
    });
    expect(end).toMatchObject({
      type: 'INSPECT_END',
    });

    const dialogues = result.program!.filter(i => i.type === 'DIALOGUE');
    expect(dialogues).toHaveLength(2);
  });

  it('should compile choice statement supporting both goto and call actions', () => {
    const dsl = `
      scene menu_test {
        choice {
          "Branch 1": goto .sub_goto
          "Branch 2": call .sub_call
        }

        scene .sub_goto {
          "Goto branch"
        }

        scene .sub_call {
          "Call branch"
          return
        }
      }
    `;
    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const choiceInstr = result.program!.find(i => i.type === 'CHOICE') as ChoiceInstruction;
    expect(choiceInstr).toBeDefined();
    expect(choiceInstr.choices).toHaveLength(2);
    expect(choiceInstr.choices[0]).toMatchObject({
      text: 'Branch 1',
      action: 'goto',
      targetScene: 'menu_test.sub_goto',
    });
    expect(choiceInstr.choices[1]).toMatchObject({
      text: 'Branch 2',
      action: 'call',
      targetScene: 'menu_test.sub_call',
    });
  });

  it('should compile scenario.vns successfully without syntax or semantic errors', () => {
    const scenarioPath = path.join(__dirname, 'fixtures', 'scenario.vns');
    const content = fs.readFileSync(scenarioPath, 'utf-8');
    const result = compileString(content, 'scenario.vns');
    if (!result.success) {
      console.error('scenario.vns compile errors:', result.errors);
    }
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.program!.length).toBeGreaterThan(50);
  });

  it('should compile multiline dialogue and narrator with triple quotes and literal newlines', () => {
    const dsl = `
      scene multiline_test {
        alice: """
Dòng thoại 1 của Alice
Dòng thoại 2 của Alice
"""

        narrator: """
Dòng dẫn chuyện 1
Dòng dẫn chuyện 2
"""

        """
Dẫn chuyện ẩn danh dòng 1
Dẫn chuyện ẩn danh dòng 2
"""

        "Bác sĩ": "Dòng 1 của Bob
Dòng 2 của Bob"

        "Dẫn chuyện dòng 1
Dẫn chuyện dòng 2"
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const dialogues = result.program!.filter(i => i.type === 'DIALOGUE') as DialogueInstruction[];
    expect(dialogues).toHaveLength(5);

    // 1. Alice triple-quoted dialogue
    expect(dialogues[0]!.character).toBe('alice');
    expect(dialogues[0]!.text).toBe('Dòng thoại 1 của Alice\nDòng thoại 2 của Alice');

    // 2. Explicit narrator triple-quoted
    expect(dialogues[1]!.character).toBeNull();
    expect(dialogues[1]!.text).toBe('Dòng dẫn chuyện 1\nDòng dẫn chuyện 2');

    // 3. Anonymous narrator triple-quoted
    expect(dialogues[2]!.character).toBeNull();
    expect(dialogues[2]!.text).toBe('Dẫn chuyện ẩn danh dòng 1\nDẫn chuyện ẩn danh dòng 2');

    // 4. Bob with literal string speaker and newline
    expect(dialogues[3]!.character).toBe('Bác sĩ');
    expect(dialogues[3]!.speaker).toBe('Bác sĩ');
    expect(dialogues[3]!.text).toBe('Dòng 1 của Bob\nDòng 2 của Bob');

    // 5. Anonymous narrator with literal newline
    expect(dialogues[4]!.character).toBeNull();
    expect(dialogues[4]!.text).toBe('Dẫn chuyện dòng 1\nDẫn chuyện dòng 2');
  });

  describe('Unified Sprite Layer & Literal Speaker (Micro-Phase 2)', () => {
    describe('TC-SPRITE-COMP-01: Literal Speaker Dialogue Compilation', () => {
      it('should compile identifier speaker, string literal speaker, mysterious speaker, and narration', () => {
        const dsl = `
          scene dialogue_syntax {
            alice: "Chào bạn!"
            "Alice Carroll": "Tên đầy đủ của tôi là Alice Carroll."
            "???": "Cậu là ai?"
            "Trời bắt đầu đổ cơn mưa rào."
            narrator: "Tiếng sấm vang lên từ đằng xa."
          }
        `;
        const result = compileString(dsl, 'dialogue_syntax.vns');
        expect(result.success).toBe(true);
        expect(result.errors).toBeUndefined();

        const dialogues = result.program!.filter(
          i => i.type === 'DIALOGUE',
        ) as DialogueInstruction[];
        expect(dialogues).toHaveLength(5);

        // 1. Identifier speaker: alice
        expect(dialogues[0]).toMatchObject({
          type: 'DIALOGUE',
          character: 'alice',
          speaker: 'alice',
          text: 'Chào bạn!',
        });

        // 2. Full string literal speaker: "Alice Carroll"
        expect(dialogues[1]).toMatchObject({
          type: 'DIALOGUE',
          character: 'Alice Carroll',
          speaker: 'Alice Carroll',
          text: 'Tên đầy đủ của tôi là Alice Carroll.',
        });

        // 3. Mysterious string speaker: "???"
        expect(dialogues[2]).toMatchObject({
          type: 'DIALOGUE',
          character: '???',
          speaker: '???',
          text: 'Cậu là ai?',
        });

        // 4. Anonymous narration: no speaker
        expect(dialogues[3]).toMatchObject({
          type: 'DIALOGUE',
          character: null,
          speaker: null,
          text: 'Trời bắt đầu đổ cơn mưa rào.',
        });

        // 5. Explicit narrator keyword/identifier: normalized to null
        expect(dialogues[4]).toMatchObject({
          type: 'DIALOGUE',
          character: null,
          speaker: null,
          text: 'Tiếng sấm vang lên từ đằng xa.',
        });
      });
    });

    describe('TC-SPRITE-COMP-02: Parser Rejects Obsolete Syntax (reveal and as)', () => {
      it('should reject reveal statement with syntax error', () => {
        const dsl = `
          scene reveal_test {
            reveal alice as "Alice"
          }
        `;
        const result = compileString(dsl, 'reveal_test.vns');
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
      });

      it('should reject character dialogue with as alias construct', () => {
        const dsl = `
          scene alias_test {
            alice as "???": "Chào bạn!"
          }
        `;
        const result = compileString(dsl, 'alias_test.vns');
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
      });
    });

    describe('TC-SPRITE-COMP-03: Parser & AST Builder Extracts ShowStatement and HideStatement', () => {
      it('should extract targetId, variant, anchorX, and anchorY in ShowStatement and HideStatement AST', () => {
        const dsl = `
          scene sprite_ast {
            show alice.happy(anchorX: 0.5, anchorY: 1.0)
            show sword(anchorX: 0.5, anchorY: 0.5, x: 0.5, y: 0.5)
            hide alice
          }
        `;
        const result = compileString(dsl, 'sprite_ast.vns');
        expect(result.success).toBe(true);
        expect(result.ast).toBeDefined();

        const scene = result.ast!.scenes[0]!;
        const show1 = scene.body[0] as ShowStatement;
        expect(show1.type).toBe('ShowStatement');
        expect(show1.targetId).toBe('alice');
        expect(show1.variant).toBe('happy');
        expect(show1.anchorX).toBe(0.5);
        expect(show1.anchorY).toBe(1.0);

        const show2 = scene.body[1] as ShowStatement;
        expect(show2.type).toBe('ShowStatement');
        expect(show2.targetId).toBe('sword');
        expect(show2.variant).toBe('');
        expect(show2.anchorX).toBe(0.5);
        expect(show2.anchorY).toBe(0.5);
        expect(show2.x).toBe(0.5);
        expect(show2.y).toBe(0.5);

        const hide1 = scene.body[2] as HideStatement;
        expect(hide1.type).toBe('HideStatement');
        expect(hide1.targetId).toBe('alice');
      });
    });

    describe('TC-SPRITE-COMP-04: Codegen Emits SHOW and HIDE Instructions with Defaults', () => {
      it('should emit SHOW with default anchorX 0.5, anchorY 1.0 and targetId/variant', () => {
        const dsl = `
          scene sprite_codegen {
            show alice.happy
            show sword(anchorX: 0.2, anchorY: 0.8)
            hide alice
          }
        `;
        const result = compileString(dsl, 'sprite_codegen.vns');
        expect(result.success).toBe(true);

        const shows = result.program!.filter(i => i.type === 'SHOW') as ShowInstruction[];
        const hides = result.program!.filter(i => i.type === 'HIDE') as HideInstruction[];
        expect(shows).toHaveLength(2);
        expect(hides).toHaveLength(1);

        // First show: defaults anchorX: 0.5, anchorY: 1.0
        expect(shows[0]).toMatchObject({
          type: 'SHOW',
          targetId: 'alice',
          variant: 'happy',
          anchorX: 0.5,
          anchorY: 1.0,
        });

        // Second show: overrides anchorX: 0.2, anchorY: 0.8
        expect(shows[1]).toMatchObject({
          type: 'SHOW',
          targetId: 'sword',
          variant: 'default',
          anchorX: 0.2,
          anchorY: 0.8,
        });

        // Hide instruction
        expect(hides[0]).toMatchObject({
          type: 'HIDE',
          targetId: 'alice',
        });
      });
    });
  });
});
