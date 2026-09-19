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
    expect(result.errors![0]?.message).toContain('bị định nghĩa trùng lặp');
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
    expect(result.errors![0]?.message).toContain('bị định nghĩa trùng lặp');
  });
});
