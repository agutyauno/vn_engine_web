import { describe, it, expect } from 'vitest';
import { compileString } from '../src/compiler';
import type { AssignInstruction } from '@vn-engine/shared-types';

describe('Variable Scoping & Declaration Specification (Stage 4 & 5)', () => {
  it('should compile top-level define as global variables in preamble', () => {
    const dsl = `
      define affection = 0
      define gold = 100

      scene chapter1 {
        alice: "Chào cậu!"
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const program = result.program!;
    // 2 lệnh preamble ASSIGN ở đầu chương trình
    expect(program[0]?.type).toBe('ASSIGN');
    const a0 = program[0] as AssignInstruction;
    expect(a0.variable).toBe('affection');
    expect(a0.scope).toBe('global');

    expect(program[1]?.type).toBe('ASSIGN');
    const a1 = program[1] as AssignInstruction;
    expect(a1.variable).toBe('gold');
    expect(a1.scope).toBe('global');

    expect(program[2]?.type).toBe('SCENE');
  });

  it('should compile scene local define as local variables', () => {
    const dsl = `
      scene chapter1 {
        define temp_score = 50
        alice: "Điểm số là {temp_score}"
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const assigns = result.program!.filter(i => i.type === 'ASSIGN') as AssignInstruction[];
    expect(assigns).toHaveLength(1);
    expect(assigns[0]!.variable).toBe('temp_score');
    expect(assigns[0]!.scope).toBe('local');
  });

  it('should distinguish global write vs local write with ~ syntax', () => {
    const dsl = `
      define affection = 10

      scene chapter1 {
        define temp = 1
        ~ affection = affection + 5
        ~ temp = temp + 1
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const assigns = result.program!.filter(i => i.type === 'ASSIGN') as AssignInstruction[];
    // 1 top-level global (preamble) + 1 local define + 1 global assign + 1 local assign = 4
    expect(assigns).toHaveLength(4);

    // Preamble
    expect(assigns[0]!.variable).toBe('affection');
    expect(assigns[0]!.scope).toBe('global');

    // Local define
    expect(assigns[1]!.variable).toBe('temp');
    expect(assigns[1]!.scope).toBe('local');

    // Gán vào global affection
    expect(assigns[2]!.variable).toBe('affection');
    expect(assigns[2]!.scope).toBe('global');

    // Gán vào local temp
    expect(assigns[3]!.variable).toBe('temp');
    expect(assigns[3]!.scope).toBe('local');
  });

  it('should reject duplicate top-level global definitions', () => {
    const dsl = `
      define score = 0
      define score = 100

      scene main {
        "Xin chào"
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      'Biến global "score" bị định nghĩa trùng lặp ở top-level',
    );
  });

  it('should reject local variable colliding with a global variable name', () => {
    const dsl = `
      define score = 0

      scene minigame {
        define score = 100
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      "Biến 'score' đã được khai báo là global (ở top-level). Không thể dùng cùng tên 'score' làm biến local trong scene 'minigame'.",
    );
  });

  it('should reject duplicate local variable definitions within the same scene', () => {
    const dsl = `
      scene main {
        define temp = 1
        define temp = 2
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      "Biến local 'temp' bị khai báo trùng lặp trong scene 'main'.",
    );
  });

  it('should allow two different scenes to declare the same local variable name', () => {
    const dsl = `
      scene sceneA {
        define counter = 0
        ~ counter = counter + 1
      }

      scene sceneB {
        define counter = 10
        ~ counter = counter + 1
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject ~ assignment when variable is undeclared (Strict Mode)', () => {
    const dsl = `
      scene main {
        ~ unknown_var = 123
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      "Biến 'unknown_var' chưa được khai báo trước khi gán giá trị trong scene 'main'. Vui lòng dùng 'define unknown_var = ...' trước.",
    );
  });

  it('should emit LABEL instructions instead of SCENE for if and while branches', () => {
    const dsl = `
      scene control_flow {
        define score = 10
        if score > 5 {
          alice: "Thắng!"
        } else {
          alice: "Thua!"
        }

        while score > 0 {
          ~ score = score - 1
        }
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);

    const labels = result.program!.filter(i => i.type === 'LABEL');
    expect(labels.length).toBeGreaterThanOrEqual(4); // if_true, if_else, if_end, while_start, while_end

    const scenes = result.program!.filter(i => i.type === 'SCENE');
    // Chỉ có đúng 1 scene thực sự
    expect(scenes).toHaveLength(1);
    expect((scenes[0] as { name: string }).name).toBe('control_flow');
  });
});
