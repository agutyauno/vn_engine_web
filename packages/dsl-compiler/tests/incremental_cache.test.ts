/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest';
import type { ScriptFile, DialogueInstruction } from '@vn-engine/shared-types';
import { Compiler } from '../src/compiler';
import { VNSLexer } from '../src/lexer';

// Declaration merging mở rộng kiểu dữ liệu cho tính năng Pha 6 đang trong RED Phase
declare module '../src/compiler' {
  interface Compiler {
    getCacheSize(): number;
    clearCache(): void;
  }
  interface CompileResult {
    bytecodeChecksum?: string;
  }
}

/**
 * Helper khởi tạo đối tượng ScriptFile chuẩn xác theo Data Contract
 */
function createScriptFile(
  id: string,
  name: string,
  content: string,
  order = 0,
  version = 1,
): ScriptFile {
  return {
    id,
    name,
    content,
    order,
    version,
  };
}

describe('Incremental AST Caching & Bytecode Checksum (Phase 6)', () => {
  it('TC-INC-01: Incremental Cache Hit - reuses parsed AST when file is unchanged', () => {
    const compiler = new Compiler();
    const fileA = createScriptFile('fileA', 'sceneA.vns', 'scene a { "Hello world" }');

    const tokenizeSpy = vi.spyOn(VNSLexer, 'tokenize');
    tokenizeSpy.mockClear();

    // Biên dịch lần 1: cache miss ban đầu
    const result1 = compiler.compile([fileA]);
    expect(result1.success).toBe(true);
    expect(result1.program).toBeDefined();
    expect(compiler.getCacheSize()).toBe(1);
    const initialTokenizeCalls = tokenizeSpy.mock.calls.length;
    expect(initialTokenizeCalls).toBeGreaterThan(0);

    // Biên dịch lần 2 với cùng fileA: cache hit
    const result2 = compiler.compile([fileA]);
    expect(result2.success).toBe(true);
    expect(result2.program).toBeDefined();
    expect(compiler.getCacheSize()).toBe(1);

    // Khẳng định không tokenize lại fileA (tái sử dụng AST trong cache)
    expect(tokenizeSpy.mock.calls.length).toBe(initialTokenizeCalls);

    // AST và Bytecode đầu ra đồng nhất
    expect(result2.ast?.scenes).toEqual(result1.ast?.scenes);
    expect(result2.program).toEqual(result1.program);

    tokenizeSpy.mockRestore();
  });

  it('TC-INC-02: Incremental Cache Miss - updates AST when file content changes', () => {
    const compiler = new Compiler();
    const fileA = createScriptFile('fileA', 'sceneA.vns', 'scene a { "hello" }');

    // Biên dịch lần 1
    const result1 = compiler.compile([fileA]);
    expect(result1.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(1);
    const dialogue1 = (result1.program?.find(i => i.type === 'DIALOGUE') as DialogueInstruction)?.text;
    expect(dialogue1).toBe('hello');

    // Biên dịch lần 2 với fileA sửa đổi nội dung
    const fileAModified = createScriptFile('fileA', 'sceneA.vns', 'scene a { "goodbye" }');
    const result2 = compiler.compile([fileAModified]);
    expect(result2.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(1);

    const dialogue2 = (result2.program?.find(i => i.type === 'DIALOGUE') as DialogueInstruction)?.text;
    expect(dialogue2).toBe('goodbye');
    expect(result2.ast?.scenes[0]?.body).not.toEqual(result1.ast?.scenes[0]?.body);
  });

  it('TC-INC-03: Multi-file Partial Cache - only re-parses modified files in multi-file project', () => {
    const compiler = new Compiler();
    const file1 = createScriptFile('f1', 'file1.vns', 'scene s1 { "scene 1 text" }', 0);
    const file2 = createScriptFile('f2', 'file2.vns', 'scene s2 { "scene 2 original" }', 1);
    const file3 = createScriptFile('f3', 'file3.vns', 'scene s3 { "scene 3 text" }', 2);

    // Biên dịch lần 1: 3 files
    const result1 = compiler.compile([file1, file2, file3]);
    expect(result1.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(3);

    // Biên dịch lần 2: chỉ sửa file2, giữ nguyên file1 và file3
    const file2Modified = createScriptFile('f2', 'file2.vns', 'scene s2 { "scene 2 updated" }', 1);
    const result2 = compiler.compile([file1, file2Modified, file3]);
    expect(result2.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(3);

    const dialogues = result2.program
      ?.filter(i => i.type === 'DIALOGUE')
      .map(i => (i as DialogueInstruction).text);
    expect(dialogues).toContain('scene 1 text');
    expect(dialogues).toContain('scene 2 updated');
    expect(dialogues).toContain('scene 3 text');
    expect(dialogues).not.toContain('scene 2 original');
  });

  it('TC-INC-04: Cache Reset via clearCache - flushes all cached AST entries', () => {
    const compiler = new Compiler();
    const file1 = createScriptFile('f1', 'file1.vns', 'scene s1 { "hello 1" }', 0);
    const file2 = createScriptFile('f2', 'file2.vns', 'scene s2 { "hello 2" }', 1);

    const result = compiler.compile([file1, file2]);
    expect(result.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(2);

    // Xóa bộ nhớ đệm
    compiler.clearCache();
    expect(compiler.getCacheSize()).toBe(0);
  });

  it('TC-INC-05: Garbage Collection on Deleted Files - evicts deleted files from cache', () => {
    const compiler = new Compiler();
    const file1 = createScriptFile('f1', 'file1.vns', 'scene s1 { "hello 1" }', 0);
    const file2 = createScriptFile('f2', 'file2.vns', 'scene s2 { "hello 2" }', 1);
    const file3 = createScriptFile('f3', 'file3.vns', 'scene s3 { "hello 3" }', 2);

    // Biên dịch lần 1 với 3 file
    const result1 = compiler.compile([file1, file2, file3]);
    expect(result1.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(3);

    // Biên dịch lần 2 xóa file3 (chỉ truyền file1 và file2)
    const result2 = compiler.compile([file1, file2]);
    expect(result2.success).toBe(true);
    expect(compiler.getCacheSize()).toBe(2);
  });

  it('TC-INC-06: bytecodeChecksum Generation - generates consistent hash and updates on change', () => {
    const compiler = new Compiler();
    const fileA = createScriptFile('f1', 'main.vns', 'scene start { "original text" }');

    // Biên dịch lần 1
    const result1 = compiler.compile([fileA]);
    expect(result1.success).toBe(true);
    expect(result1.bytecodeChecksum).toBeDefined();
    expect(typeof result1.bytecodeChecksum).toBe('string');
    expect(result1.bytecodeChecksum!.length).toBeGreaterThan(0);

    // Biên dịch lại cùng mã nguồn cho ra cùng bytecodeChecksum
    const result2 = compiler.compile([fileA]);
    expect(result2.success).toBe(true);
    expect(result2.bytecodeChecksum).toBe(result1.bytecodeChecksum);

    // Thay đổi mã nguồn cho ra bytecodeChecksum khác
    const fileAModified = createScriptFile('f1', 'main.vns', 'scene start { "modified text" }');
    const result3 = compiler.compile([fileAModified]);
    expect(result3.success).toBe(true);
    expect(result3.bytecodeChecksum).toBeDefined();
    expect(result3.bytecodeChecksum).not.toBe(result1.bytecodeChecksum);
  });
});
