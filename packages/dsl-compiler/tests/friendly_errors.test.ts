import { describe, it, expect } from 'vitest';
import { compileString } from '../src/compiler';

describe('Friendly Diagnostics & Error Formatter (TDD RED)', () => {
  // TC-FE-01: Missing dialogue string
  it('TC-FE-01: Missing dialogue string produces ERR_SYNTAX_MISSING_DIALOGUE', () => {
    const code = 'alice:\n';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.code).toBe('ERR_SYNTAX_MISSING_DIALOGUE');
    expect(err.message).toContain('Missing dialogue text after character colon');
  });

  // TC-FE-02: Missing scene name
  it('TC-FE-02: Missing scene name produces ERR_SYNTAX_MISSING_SCENE_NAME', () => {
    const code = 'scene {\n  "hello"\n}';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.code).toBe('ERR_SYNTAX_MISSING_SCENE_NAME');
    expect(err.message).toContain("Missing scene identifier after 'scene' keyword");
  });

  // TC-FE-03: Unclosed block brace
  it('TC-FE-03: Unclosed block brace produces ERR_SYNTAX_UNCLOSED_BRACE with opening line reference', () => {
    const code = 'scene intro {\n  "hello"';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.code).toBe('ERR_SYNTAX_UNCLOSED_BRACE');
    expect(err.message).toContain("Missing closing brace '}' for block starting on line 1");
    expect(err.loc?.line).toBe(1);
  });

  // TC-FE-04: Dangling scene jump
  it('TC-FE-04: Dangling scene jump produces ERR_SEMANTIC_DANGLING_SCENE', () => {
    const code = 'scene intro {\n  goto non_existent\n}';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    const err = result.errors!.find(
      e => e.code === 'ERR_SEMANTIC_DANGLING_SCENE' || e.message.includes('non_existent'),
    );
    expect(err).toBeDefined();
    expect(err?.code).toBe('ERR_SEMANTIC_DANGLING_SCENE');
    expect(err?.message).toContain('non_existent');
  });

  // TC-FE-05: Missing voice asset (Decoupled: missing audio does not block compilation)
  it('TC-FE-05: Missing voice asset does not block compilation and emits bytecode', () => {
    const code = 'scene intro {\n  play voice "unregistered_voice"\n}';
    const result = compileString(code, 'test.vns', {
      assets: [],
    });
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  // TC-FE-06: Generic fallback
  it('TC-FE-06: Generic syntax fallback produces ERR_SYNTAX_GENERIC with cleaned message', () => {
    const code = 'scene intro {\n  ???\n}';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.code).toBe('ERR_SYNTAX_GENERIC');
    expect(err.message).not.toMatch(/^Syntax error:\s*/i);
  });

  // TC-FE-07: Comment # chứa { sau lỗi cú pháp dòng đầu
  it('TC-FE-07: Comment # containing { does not mask earlier syntax error or report false unclosed brace', () => {
    const code = 'wrong_syntax\n# Main visual novel script: test\n# scene bla {\n#   bla:"bruh"\n#\n#\n';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.loc?.line).toBe(1);
    expect(err.loc?.col).toBe(1);
    expect(err.loc?.endCol).toBe(13);
    expect(err.code).not.toBe('ERR_SYNTAX_UNCLOSED_BRACE');
    expect(err.message).not.toContain("Missing closing brace '}' for block starting on line 3");
  });

  // TC-FE-08: Token span coordinates - endCol/endLine
  it('TC-FE-08: Syntax error provides complete token span coordinates (endLine and endCol)', () => {
    const code = 'invalid_token\n';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.loc).toBeDefined();
    expect(err.loc?.line).toBe(1);
    expect(err.loc?.col).toBe(1);
    expect(err.loc?.endLine).toBe(1);
    expect(err.loc?.endCol).toBeDefined();
    expect(err.loc!.endCol!).toBeGreaterThan(err.loc!.col!);
  });

  // TC-FE-09: Unclosed brace thực sự với comment # chứa {
  it('TC-FE-09: Genuine unclosed brace correctly identifies block line ignoring # comments with {', () => {
    const code = 'scene intro {\n  # a comment with { bracket\n  "hello"\n';
    const result = compileString(code, 'test.vns');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    const err = result.errors![0]!;
    expect(err.code).toBe('ERR_SYNTAX_UNCLOSED_BRACE');
    expect(err.loc?.line).toBe(1);
    expect(err.message).toContain("Missing closing brace '}' for block starting on line 1");
    expect(err.message).not.toContain('line 2');
  });
});
