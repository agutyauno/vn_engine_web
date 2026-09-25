import { describe, it, expect } from 'vitest';
import { compile, compileString } from '../src/compiler';
import type { ScriptFile } from '@vn-engine/shared-types';

describe('Semantic Validator & Multi-File Compilation', () => {
  it('should detect duplicate scene names in the same file', () => {
    const dsl = `
      scene intro {
        alice: "Chào lần 1"
      }
      scene intro {
        alice: "Chào lần 2"
      }
    `;

    const result = compileString(dsl, 'duplicate.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain('is defined multiple times');
  });

  it('should detect missing target scenes in goto, call, and choice statements', () => {
    const dsl = `
      scene main {
        goto missing_goto_scene
        call missing_call_scene
        choice {
          "Nhánh 1": goto missing_choice_scene
        }
      }
    `;

    const result = compileString(dsl, 'missing_targets.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors![0]?.message).toContain('missing_goto_scene');
    expect(result.errors![1]?.message).toContain('missing_call_scene');
    expect(result.errors![2]?.message).toContain('missing_choice_scene');
  });

  it('should detect missing target scenes inside nested if/else and while bodies', () => {
    const dsl = `
      scene nested_test {
        if score > 10 {
          goto missing_in_if
        } else {
          goto missing_in_else
        }

        while counter < 5 {
          goto missing_in_while
        }
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('should support multi-file compilation and resolve cross-file scene references', () => {
    const files: ScriptFile[] = [
      {
        id: 'file-prologue',
        name: 'prologue.vns',
        content: `
          scene prologue {
            alice: "Bắt đầu câu chuyện."
            goto chapter1_start
          }
        `,
        order: 0,
        version: 1,
      },
      {
        id: 'file-chapter1',
        name: 'chapter1.vns',
        content: `
          scene chapter1_start {
            alice: "Chào mừng đến Chương 1!"
            call shared_subroutine
          }
        `,
        order: 1,
        version: 1,
      },
      {
        id: 'file-shared',
        name: 'shared.vns',
        content: `
          scene shared_subroutine {
            "Subroutine chung."
            return
          }
        `,
        order: 2,
        version: 1,
      },
    ];

    const result = compile(files);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const sceneNames = result
      .program!.filter(i => i.type === 'SCENE')
      .map(s => (s as { name: string }).name);
    expect(sceneNames).toEqual(['prologue', 'chapter1_start', 'shared_subroutine']);
  });

  it('should detect duplicate scene names across different files with correct fileId', () => {
    const files: ScriptFile[] = [
      {
        id: 'file-a',
        name: 'a.vns',
        content: `scene common_scene { alice: "Ở file A" }`,
        order: 0,
        version: 1,
      },
      {
        id: 'file-b',
        name: 'b.vns',
        content: `scene common_scene { alice: "Ở file B" }`,
        order: 1,
        version: 1,
      },
    ];

    const result = compile(files);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain('is defined multiple times');
  });

  it('should reject unqualified suffix references and not guess matching suffix scenes', () => {
    const dsl = `
      scene chapter1 {
        scene .ask_question {
          alice: "Câu hỏi ở chương 1"
        }
        goto ask_question
      }
      scene chapter5 {
        scene .ask_question {
          alice: "Câu hỏi ở chương 5"
        }
      }
    `;

    const result = compileString(dsl, 'test_suffix.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain('Target of goto "ask_question" does not exist');
  });

  it('should correctly resolve proper local dot labels across different chapters without conflict', () => {
    const dsl = `
      scene chapter1 {
        scene .ask_question {
          alice: "Câu hỏi ở chương 1"
        }
        goto .ask_question
      }
      scene chapter5 {
        scene .ask_question {
          alice: "Câu hỏi ở chương 5"
        }
        goto .ask_question
      }
    `;

    const result = compileString(dsl, 'test_local_labels.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    const gotos = result.program!.filter(i => i.type === 'GOTO') as { targetScene: string }[];
    expect(gotos[0]?.targetScene).toBe('chapter1.ask_question');
    expect(gotos[1]?.targetScene).toBe('chapter5.ask_question');
  });

  it('should validate supported transitions, easings, and positions without error', () => {
    const dsl = `
      scene motion_valid {
        background bg_room transition: "fade"
        background bg_forest(transition: "zoom", easing: "bounce", duration: 1.0s)
        show amiya.happy(position: "left", transition: "shake", easing: "ease_out", duration: 0.5s)
        show amiya(position: "center", transition: "hop", duration: 0.4s)
        show amiya(position: "right", transition: "wobble", duration: 0.6s)
        show amiya(x: 0.5, y: 0.8, transition: "slide_left", duration: 0.5s)
        show amiya(x: 0.5, y: 0.8, transition: "bounce", easing: "elastic", duration: 0.8s)
      }
    `;

    const result = compileString(dsl, 'motion_valid.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject unsupported transitions in show and background statements', () => {
    const dsl = `
      scene motion_invalid {
        background bg_room transition: "teleport_now"
        show amiya.happy(position: "center", transition: "flying_car", duration: 0.5s)
      }
    `;

    const result = compileString(dsl, 'motion_invalid.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(2);
    expect(result.errors![0]?.message).toContain('unknown transition "teleport_now"');
    expect(result.errors![1]?.message).toContain('unknown transition "flying_car"');
  });

  it('should reject unsupported easings and named positions', () => {
    const dsl = `
      scene invalid_easing_and_pos {
        show amiya(position: "somewhere_far", easing: "hyper_speed")
        background bg_room(easing: "invalid_curve")
      }
    `;

    const result = compileString(dsl, 'invalid_easing_and_pos.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(3);
    expect(result.errors![0]?.message).toContain('unknown position "somewhere_far"');
    expect(result.errors![1]?.message).toContain('unknown easing "hyper_speed"');
    expect(result.errors![2]?.message).toContain('unknown easing "invalid_curve"');
  });

  it('should reject local scenes nested inside other local scenes with exact error message (ADR-015)', () => {
    const dsl = `
      scene start {
        background lighthouse
        choice {
          "Choice 1": goto .c1
          "Choice 2": goto .c2
        }

        scene .c1 {
          "c1"
          scene .c2 {
            "c2"
          }
        }
      }
    `;

    const result = compileString(dsl, 'nested_subscene.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]?.message).toBe(
      'Local scene ".c2" cannot be nested inside another local scene ".c1". Sub-scenes are strictly limited to 1 level'
    );
  });

  it('should reject multiple levels of nested sub-scenes', () => {
    const dsl = `
      scene start {
        scene .c1 {
          scene .c2 {
            scene .c3 {
              "c3"
            }
          }
        }
      }
    `;

    const result = compileString(dsl, 'multi_level_subscene.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(2);
    expect(result.errors![0]?.message).toBe(
      'Local scene ".c2" cannot be nested inside another local scene ".c1". Sub-scenes are strictly limited to 1 level'
    );
    expect(result.errors![1]?.message).toBe(
      'Local scene ".c3" cannot be nested inside another local scene ".c2". Sub-scenes are strictly limited to 1 level'
    );
  });

  it('should reject local scene declared at top-level', () => {
    const dsl = `
      scene .orphan {
        "orphan"
      }
    `;

    const result = compileString(dsl, 'orphan_subscene.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      'Local scene ".orphan" cannot be declared at top-level. Sub-scenes must be nested inside a global scene.'
    );
  });

  it('should allow valid 1-level sub-scenes', () => {
    const dsl = `
      scene start {
        choice {
          "Choice 1": call .c1
          "Choice 2": call .c2
        }

        scene .c1 {
          "c1"
        }

        scene .c2 {
          "c2"
        }

        "next"
        end
      }
    `;

    const result = compileString(dsl, 'valid_subscenes.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should support pure numeric global scenes and numeric sub-scenes (e.g., scene 1, goto 2, scene .1)', () => {
    const dsl = `
      scene 1 {
        "Starting scene 1"
        choice {
          "Call sub 1": call .1
          "Call sub 2": call .2
          "Goto scene 2": goto 2
        }

        scene .1 {
          "This is sub 1"
        }

        scene .2 {
          "This is sub 2"
        }

        goto 2
        end
      }

      scene 2 {
        "This is scene 2"
      }
    `;

    const result = compileString(dsl, 'numeric_scenes.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.program).toBeDefined();

    // Verify scene names in bytecode
    const sceneInsts = result.program!.filter(i => i.type === 'SCENE') as { name: string }[];
    const sceneNames = sceneInsts.map(s => s.name);
    expect(sceneNames).toContain('1');
    expect(sceneNames).toContain('1.1');
    expect(sceneNames).toContain('1.2');
    expect(sceneNames).toContain('2');
  });

  it('should support alphanumeric scene names starting with numbers (e.g., scene 1_intro, scene .1_branch)', () => {
    const dsl = `
      scene 1_intro {
        choice {
          "Branch": goto .1_branch
        }

        scene .1_branch {
          "Branch content"
        }

        goto 2nd_phase
      }

      scene 2nd_phase {
        "Phase 2 content"
      }
    `;

    const result = compileString(dsl, 'alphanumeric_scenes.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.program).toBeDefined();

    const sceneInsts = result.program!.filter(i => i.type === 'SCENE') as { name: string }[];
    const sceneNames = sceneInsts.map(s => s.name);
    expect(sceneNames).toContain('1_intro');
    expect(sceneNames).toContain('1_intro.1_branch');
    expect(sceneNames).toContain('2nd_phase');
  });

  it('should reject global scene names containing dots (e.g., scene 1.5)', () => {
    const dsl = `
      scene 1.5 {
        "Invalid global scene name"
      }
    `;

    const result = compileString(dsl, 'dot_global_scene.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      'Global scene "1.5" cannot contain \'.\' in its name. Dots are reserved for sub-scenes.'
    );
  });
});


