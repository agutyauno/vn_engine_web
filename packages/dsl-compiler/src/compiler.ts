// ==========================================
// ĐIỂU PHỐI PIPELINE BIÊN DỊCH (COMPILER PIPELINE ENTRY)
// ==========================================

import type { ScriptFile, Instruction, ProgramAST, SceneASTNode, Character } from '@vn-engine/shared-types';
import { VNSLexer } from './lexer';
import { parserInstance } from './parser';
import { VNSAstBuilder } from './ast_builder';
import { runMergePass } from './merge_pass';
import { validateSemantics, type CompileError } from './semantic';
import { generateBytecode } from './codegen';

export interface CompilerOptions {
  characters?: Character[];
}

export interface CompileResult {
  success: boolean;
  program?: Instruction[];
  ast?: ProgramAST;
  errors?: CompileError[];
}

export class Compiler {
  public compile(files: ScriptFile[], options?: CompilerOptions): CompileResult {
    const errors: CompileError[] = [];
    const allScenes: SceneASTNode[] = [];

    // Sắp xếp các file theo thứ tự order
    const sortedFiles = [...files].sort((a, b) => a.order - b.order);

    for (const file of sortedFiles) {
      // Stage 1: Phân tích từ vựng (Lexer)
      const lexResult = VNSLexer.tokenize(file.content);
      if (lexResult.errors.length > 0) {
        for (const err of lexResult.errors) {
          errors.push({
            message: `Lỗi từ vựng: ${err.message}`,
            loc: {
              fileId: file.id,
              line: err.line ?? 1,
              col: err.column ?? 1,
            },
          });
        }
        continue;
      }

      // Stage 2: Phân tích cú pháp (Parser)
      parserInstance.input = lexResult.tokens;
      const cst = parserInstance.program();

      if (parserInstance.errors.length > 0) {
        for (const err of parserInstance.errors) {
          errors.push({
            message: `Lỗi cú pháp: ${err.message}`,
            loc: {
              fileId: file.id,
              line: err.token.startLine ?? 1,
              col: err.token.startColumn ?? 1,
            },
          });
        }
        continue;
      }

      // Xây dựng AST cho từng file
      const builder = new VNSAstBuilder(file.id);
      const fileAst = builder.visit(cst) as ProgramAST;
      if (fileAst?.scenes) {
        allScenes.push(...fileAst.scenes);
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    const rawAst: ProgramAST = {
      type: 'Program',
      scenes: allScenes,
    };

    // Stage 0 Merge Pass: Phẳng hóa local sub-scenes và kế thừa UI
    const mergedAst = runMergePass(rawAst);

    // Stage 4: Kiểm tra ngữ nghĩa (Semantic Validation)
    const semanticErrors = validateSemantics(mergedAst);
    if (semanticErrors.length > 0) {
      return {
        success: false,
        ast: mergedAst,
        errors: semanticErrors,
      };
    }

    // Stage 5: Sinh Bytecode (Instruction Set)
    const program = generateBytecode(mergedAst, options?.characters);

    return {
      success: true,
      program,
      ast: mergedAst,
    };
  }

  /**
   * Tiện ích biên dịch nhanh từ một chuỗi mã nguồn DSL đơn lẻ
   */
  public compileString(
    content: string,
    fileName: string = 'main.vns',
    options?: CompilerOptions,
  ): CompileResult {
    return this.compile(
      [
        {
          id: fileName,
          name: fileName,
          content,
          order: 0,
          version: 1,
        },
      ],
      options,
    );
  }
}

export const defaultCompiler = new Compiler();
export function compile(files: ScriptFile[], options?: CompilerOptions): CompileResult {
  return defaultCompiler.compile(files, options);
}
export function compileString(
  content: string,
  fileName?: string,
  options?: CompilerOptions,
): CompileResult {
  return defaultCompiler.compileString(content, fileName, options);
}
