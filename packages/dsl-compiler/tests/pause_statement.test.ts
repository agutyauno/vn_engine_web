/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import type {
  PauseStatement,
  PauseInstruction,
  DialogueInstruction,
  BackgroundInstruction,
  AssignInstruction,
} from '@vn-engine/shared-types';
import { VNSLexer } from '../src/lexer';
import { compileString } from '../src/compiler';
import { formatVns } from '../src/formatter';

describe('Pause Statement DSL Compiler Suite (Micro-Phase 1B)', () => {
  // ---------------------------------------------------------------------------
  // TC-PAUSE-COMP-01: Lexer & Parser
  // ---------------------------------------------------------------------------
  it('TC-PAUSE-COMP-01 (Lexer & Parser): should tokenize "pause" keyword and parse into PauseStatement AST node', () => {
    // 1. Lexer Verification
    const lexResult = VNSLexer.tokenize('pause');
    expect(lexResult.errors).toHaveLength(0);
    expect(lexResult.tokens).toHaveLength(1);
    expect(lexResult.tokens[0]?.tokenType.name).toBe('Pause');
    expect(lexResult.tokens[0]?.image).toBe('pause');

    // 2. Parser & AST Builder Verification
    const dsl = `
      scene test_pause_ast {
        pause
      }
    `;

    const result = compileString(dsl, 'pause_ast.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const scene = result.ast?.scenes.find(s => s.name === 'test_pause_ast');
    expect(scene).toBeDefined();

    const pauseStmt = scene?.body.find((stmt): stmt is PauseStatement => stmt.type === 'PauseStatement');
    expect(pauseStmt).toBeDefined();
    expect(pauseStmt?.type).toBe('PauseStatement');
    expect(pauseStmt?.loc).toBeDefined();
    expect(pauseStmt?.loc?.fileId).toBe('pause_ast.vns');
    expect(pauseStmt?.loc?.line).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // TC-PAUSE-COMP-02: Codegen
  // ---------------------------------------------------------------------------
  it('TC-PAUSE-COMP-02 (Codegen): should emit bytecode PAUSE instruction with accurate source location and ordering', () => {
    const dsl = `
      scene cg_gallery {
        background bg_sunset transition: "fade"
        hide dialogue
        pause
        alice: "Ánh chiều tà buông xuống..."
      }
    `;

    const result = compileString(dsl, 'cg_gallery.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const program = result.program;
    expect(program).toBeDefined();
    if (!program) return;

    // 1. Verify existence and location of PAUSE instruction
    const pauseInstr = program.find((i): i is PauseInstruction => i.type === 'PAUSE');
    expect(pauseInstr).toBeDefined();
    expect(pauseInstr?.type).toBe('PAUSE');
    expect(pauseInstr?.loc).toBeDefined();
    expect(pauseInstr?.loc?.fileId).toBe('cg_gallery.vns');
    expect(pauseInstr?.loc?.line).toBe(5);

    // 2. Verify strict instruction sequence ordering:
    // BACKGROUND -> HIDE_DIALOGUE -> PAUSE -> DIALOGUE
    const bgIdx = program.findIndex(i => i.type === 'BACKGROUND');
    const hideIdx = program.findIndex(i => i.type === 'HIDE_DIALOGUE');
    const pauseIdx = program.findIndex(i => i.type === 'PAUSE');
    const dialogueIdx = program.findIndex(i => i.type === 'DIALOGUE');

    expect(bgIdx).toBeGreaterThanOrEqual(0);
    expect(hideIdx).toBeGreaterThan(bgIdx);
    expect(pauseIdx).toBeGreaterThan(hideIdx);
    expect(dialogueIdx).toBeGreaterThan(pauseIdx);

    // 3. Verify details of surrounding instructions
    const bgInstr = program[bgIdx] as BackgroundInstruction;
    expect(bgInstr.assetId).toBe('bg_sunset');
    expect(bgInstr.transition).toBe('fade');

    expect(program[hideIdx]?.type).toBe('HIDE_DIALOGUE');

    const diagInstr = program[dialogueIdx] as DialogueInstruction;
    expect(diagInstr.character).toBe('alice');
    expect(diagInstr.text).toBe('Ánh chiều tà buông xuống...');
  });

  // ---------------------------------------------------------------------------
  // TC-PAUSE-COMP-03: Formatter
  // ---------------------------------------------------------------------------
  it('TC-PAUSE-COMP-03 (Formatter): should format pause statement cleanly with proper indentation in scene and blocks', () => {
    const unformatted = `
scene gallery {
background bg_sunset
hide dialogue
pause
alice: "Đẹp quá!"
}
`;

    const formatted = formatVns(unformatted, { indentSize: 2 });
    const expected = `scene gallery {
  background bg_sunset
  hide dialogue
  pause
  alice: "Đẹp quá!"
}
`;
    expect(formatted).toBe(expected);

    // Test pause inside nested conditional block
    const unformattedBlock = `
scene block_test {
if has_item {
pause
}
}
`;
    const formattedBlock = formatVns(unformattedBlock, { indentSize: 2 });
    const expectedBlock = `scene block_test {
  if has_item {
    pause
  }
}
`;
    expect(formattedBlock).toBe(expectedBlock);

    // Verify formatted output compiles cleanly into bytecode
    const compileResult = compileString(formatted, 'formatted_gallery.vns');
    expect(compileResult.success).toBe(true);
    expect(compileResult.errors).toBeUndefined();
    const pauseInstr = compileResult.program?.find(i => i.type === 'PAUSE');
    expect(pauseInstr).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // TC-PAUSE-COMP-04: Speaker Identifier Gate & Variable
  // ---------------------------------------------------------------------------
  it('TC-PAUSE-COMP-04 (Speaker Identifier Gate & Variable): should distinguish between pause keyword and speaker/variable named pause', () => {
    const dsl = `
      scene speaker_and_var_gate {
        define pause = 5
        ~ pause = pause + 10
        pause: "Xin chào, tôi tên là Pause!"
        "Người Bí Ẩn": "Tôi là Pause với tên hiển thị tùy chỉnh."
        pause
        "Dẫn chuyện tiếp tục sau khi nhấn chuột."
      }
    `;

    const result = compileString(dsl, 'gate_test.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const program = result.program;
    expect(program).toBeDefined();
    if (!program) return;

    // 1. Variable define & assign with name "pause"
    const assigns = program.filter(
      (i): i is AssignInstruction => i.type === 'ASSIGN' && i.variable === 'pause',
    );
    expect(assigns.length).toBeGreaterThanOrEqual(2);
    expect(assigns[0]?.variable).toBe('pause');
    expect(assigns[1]?.variable).toBe('pause');

    // 2. Dialogue with speaker identifier "pause"
    const normalDialogue = program.find(
      (i): i is DialogueInstruction =>
        i.type === 'DIALOGUE' && i.character === 'pause' && !i.displayNameOverride,
    );
    expect(normalDialogue).toBeDefined();
    expect(normalDialogue?.character).toBe('pause');
    expect(normalDialogue?.text).toBe('Xin chào, tôi tên là Pause!');

    // 3. Dialogue with literal string speaker "Người Bí Ẩn"
    const literalDialogue = program.find(
      (i): i is DialogueInstruction =>
        i.type === 'DIALOGUE' && i.character === 'Người Bí Ẩn',
    );
    expect(literalDialogue).toBeDefined();
    expect(literalDialogue?.character).toBe('Người Bí Ẩn');
    expect(literalDialogue?.speaker).toBe('Người Bí Ẩn');
    expect(literalDialogue?.text).toBe('Tôi là Pause với tên hiển thị tùy chỉnh.');

    // 4. Standalone pause statement (interactive suspend point)
    const pauseInstr = program.find((i): i is PauseInstruction => i.type === 'PAUSE');
    expect(pauseInstr).toBeDefined();
    expect(pauseInstr?.type).toBe('PAUSE');

    // 5. Subsequent dialogue statement
    const narration = program.find(
      (i): i is DialogueInstruction => i.type === 'DIALOGUE' && i.character === null,
    );
    expect(narration).toBeDefined();
    expect(narration?.text).toBe('Dẫn chuyện tiếp tục sau khi nhấn chuột.');
  });
});
