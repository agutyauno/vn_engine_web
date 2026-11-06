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

  // TC-FE-05: Missing voice asset
  it('TC-FE-05: Missing voice asset produces ERR_SEMANTIC_MISSING_AUDIO', () => {
    const code = 'scene intro {\n  play voice "unregistered_voice"\n}';
    const result = compileString(code, 'test.vns', {
      assets: [],
    });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    const err = result.errors!.find(
      e => e.code === 'ERR_SEMANTIC_MISSING_AUDIO' || e.message.includes('unregistered_voice'),
    );
    expect(err).toBeDefined();
    expect(err?.code).toBe('ERR_SEMANTIC_MISSING_AUDIO');
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
});
