import { describe, it, expect } from 'vitest';
import { compileString } from '../src/compiler';
import { formatVns } from '../src/formatter';
import type { AssignInstruction, ChoiceInstruction, DialogueInstruction, BinaryExpression } from '@vn-engine/shared-types';

describe('Phase 2 Compiler & Language DSL Features', () => {
  it('should support modulo operator (%) in expressions and emit BinaryExpression bytecode', () => {
    const dsl = `
      scene math_scene {
        define rem = 17 % 5
        define check = rem == 2
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const assigns = result.program!.filter(i => i.type === 'ASSIGN') as AssignInstruction[];
    expect(assigns).toHaveLength(2);
    expect(assigns[0]!.variable).toBe('rem');
    expect((assigns[0]!.value as BinaryExpression).operator).toBe('%');
  });

  it('should support goto and call with dotted scene targets (e.g., chapter1.ask_question)', () => {
    const dsl = `
      scene chapter1 {
        goto chapter1.ask_question
        call chapter1.sub_routine

        scene .ask_question {
          "Hỏi câu hỏi."
        }

        scene .sub_routine {
          "Subroutine."
          return
        }
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const gotos = result.program!.filter(i => i.type === 'GOTO');
    expect(gotos[0]?.targetScene).toBe('chapter1.ask_question');

    const calls = result.program!.filter(i => i.type === 'CALL');
    expect(calls[0]?.targetScene).toBe('chapter1.sub_routine');
  });

  it('should allow contextual keywords as variable names and character identifiers', () => {
    const dsl = `
      define x = 100
      define y = 200
      define scale = 1.5
      define volume = 0.8
      define duration = 2.0
      define end = 999

      scene test_contextual {
        ~ x = x + 1
        ~ y = y + 2
        ~ end = end - 1
        x: "Tôi là nhân vật tên x"
        end: "Tôi là nhân vật tên end"
      }
    `;

    const result = compileString(dsl);
    if (!result.success) {
      console.error('Contextual test errors:', result.errors);
    }
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const dialogues = result.program!.filter(i => i.type === 'DIALOGUE') as DialogueInstruction[];
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0]!.character).toBe('x');
    expect(dialogues[1]!.character).toBe('end');
  });

  it('should support multiple choice options inside an if block in choice statement', () => {
    const dsl = `
      scene choice_scene {
        define has_key = true
        choice {
          if has_key == true {
            "Mở cửa phòng 1": goto room1
            "Mở cửa phòng 2": goto room2
          }
          "Rời đi": goto leave
        }
      }

      scene room1 {}
      scene room2 {}
      scene leave {}
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const choiceInstr = result.program!.find(i => i.type === 'CHOICE') as ChoiceInstruction;
    expect(choiceInstr).toBeDefined();
    expect(choiceInstr.choices).toHaveLength(3);
    expect(choiceInstr.choices[0]!.text).toBe('Mở cửa phòng 1');
    expect(choiceInstr.choices[0]!.condition).toBeDefined();
    expect(choiceInstr.choices[1]!.text).toBe('Mở cửa phòng 2');
    expect(choiceInstr.choices[1]!.condition).toBeDefined();
    expect(choiceInstr.choices[2]!.text).toBe('Rời đi');
    expect(choiceInstr.choices[2]!.condition).toBeUndefined();
  });

  it('should reject unsupported bitwise operators at compile time', () => {
    const dsl = `
      scene bitwise_scene {
        define val = 5 | 3
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should validate undeclared variables in expressions (if, while, define, assign, choice)', () => {
    const dsl1 = `
      scene bad_if {
        if undefined_score > 10 {
          "Thắng"
        }
      }
    `;
    const res1 = compileString(dsl1);
    expect(res1.success).toBe(false);
    expect(res1.errors![0]?.message).toContain("Variable 'undefined_score' in expression has not been defined");

    const dsl2 = `
      scene bad_while {
        while undefined_counter < 5 {
          "Lặp"
        }
      }
    `;
    const res2 = compileString(dsl2);
    expect(res2.success).toBe(false);
    expect(res2.errors![0]?.message).toContain("Variable 'undefined_counter' in expression has not been defined");

    const dsl3 = `
      scene bad_assign {
        define x = 10
        ~ x = undefined_rhs + 1
      }
    `;
    const res3 = compileString(dsl3);
    expect(res3.success).toBe(false);
    expect(res3.errors![0]?.message).toContain("Variable 'undefined_rhs' in expression has not been defined");

    const dsl4 = `
      scene bad_choice {
        choice {
          if undefined_cond {
            "Option": goto bad_choice
          }
        }
      }
    `;
    const res4 = compileString(dsl4);
    expect(res4.success).toBe(false);
    expect(res4.errors![0]?.message).toContain("Variable 'undefined_cond' in expression has not been defined");
  });

  it('should reject calling unwhitelisted functions in expressions at compile time', () => {
    const dsl = `
      scene bad_fn {
        define res = malicious_eval("alert(1)")
      }
    `;

    const result = compileString(dsl);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain("Unknown function 'malicious_eval' called in expression");
  });

  it('should preserve multiline strings and their internal indentation/comments in formatVns', () => {
    const source = `scene test {
  alice: """
First line
  Indented line
# Not a comment
{Not a tag}
"""
}`;

    const formatted = formatVns(source);
    expect(formatted).toContain('First line');
    expect(formatted).toContain('  Indented line');
    expect(formatted).toContain('# Not a comment');
    expect(formatted).toContain('{Not a tag}');
  });
});
