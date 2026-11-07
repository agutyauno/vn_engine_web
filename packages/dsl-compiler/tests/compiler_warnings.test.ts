import { describe, it, expect } from 'vitest';
import type { PlayInstruction, ProgramAST } from '@vn-engine/shared-types';
import { compileString } from '../src/compiler';
import { validateSemantics } from '../src/semantic';
import { parserInstance } from '../src/parser';
import { VNSLexer } from '../src/lexer';
import { VNSAstBuilder } from '../src/ast_builder';

describe('Compiler Warnings & Asset Decoupling (TASK-compiler-diagnostics-decoupling - Phase 1)', () => {
  // TC-CMP-WARN-01: CompileResult includes warnings array
  it('TC-CMP-WARN-01: CompileResult returns warnings array for valid script', () => {
    const code = `
scene intro {
  "Hello, world!"
}
`;
    const result = compileString(code, 'main.vns');
    expect(result.success).toBe(true);
    expect((result as any).warnings).toBeDefined();
    expect(Array.isArray((result as any).warnings)).toBe(true);
  });

  // TC-CMP-ASSET-01: Missing audio asset does not trigger ERR_SEMANTIC_MISSING_AUDIO and generates PLAY instruction
  it('TC-CMP-ASSET-01: play music "bgm_missing" compiles successfully without ERR_SEMANTIC_MISSING_AUDIO and emits PLAY instruction', () => {
    const code = `
scene intro {
  play music "bgm_missing"
  "Background music should play even if asset is not registered"
}
`;
    const result = compileString(code, 'main.vns', {
      assets: [],
    });

    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.program).toBeDefined();

    const playInst = result.program?.find(
      (inst): inst is PlayInstruction => inst.type === 'PLAY',
    );
    expect(playInst).toBeDefined();
    expect(playInst?.channel).toBe('music');
    expect(playInst?.assetId).toBe('bgm_missing');
  });

  // TC-CMP-ASSET-02: Edge case: Multiple audio channels with missing assets all decouple properly
  it('TC-CMP-ASSET-02: Multiple audio channels (music, sound, voice) with missing assets decouple properly', () => {
    const code = `
scene intro {
  play music "bgm_unregistered"
  play sound "sfx_missing"
  play voice "voice_unregistered"
  "All audio commands should produce instructions"
}
`;
    const result = compileString(code, 'main.vns', {
      assets: [],
    });

    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.program).toBeDefined();

    const playInstructions = result.program?.filter(
      (inst): inst is PlayInstruction => inst.type === 'PLAY',
    );
    expect(playInstructions).toBeDefined();
    expect(playInstructions?.length).toBe(3);
    expect(playInstructions?.map(i => i.channel)).toEqual(['music', 'sound', 'voice']);
  });

  // TC-CMP-WARN-02: validateSemantics returns structured object containing errors and warnings arrays
  it('TC-CMP-WARN-02: validateSemantics returns an object containing errors and warnings arrays', () => {
    const code = `
scene intro {
  "Simple scene"
}
`;
    const lexResult = VNSLexer.tokenize(code);
    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.program();
    const builder = new VNSAstBuilder('test.vns');
    const ast = builder.visit(cst) as ProgramAST;

    const validationResult = validateSemantics(ast) as any;
    expect(validationResult).toBeDefined();
    expect(typeof validationResult).toBe('object');
    expect(validationResult.warnings).toBeDefined();
    expect(Array.isArray(validationResult.warnings)).toBe(true);
  });
});

