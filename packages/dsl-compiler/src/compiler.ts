// ==========================================
// ĐIỂU PHỐI PIPELINE BIÊN DỊCH (COMPILER PIPELINE ENTRY)
// ==========================================

import type {
  ScriptFile,
  Instruction,
  ProgramAST,
  SceneASTNode,
  StatementAST,
  Character,
} from '@vn-engine/shared-types';
import { VNSLexer } from './lexer';
import { parserInstance } from './parser';
import { VNSAstBuilder } from './ast_builder';
import { runMergePass } from './merge_pass';
import { validateSemantics, validateSceneStructure, type CompileError } from './semantic';
import { generateBytecode } from './codegen';
import {
  formatLexerError,
  formatParserError,
  cleanMessage,
  VNS_ERROR_CODES,
} from './error_formatter';

export interface CompilerOptions {
  characters?: Character[];
  assets?: Array<{ id: string; name?: string; type?: string; category?: string }>;
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
    const allTopLevelStatements: StatementAST[] = [];
    const allScenes: SceneASTNode[] = [];

    // Sắp xếp các file theo thứ tự order
    const sortedFiles = [...files].sort((a, b) => a.order - b.order);

    for (const file of sortedFiles) {
      try {
        // Stage 1: Phân tích từ vựng (Lexer)
        const lexResult = VNSLexer.tokenize(file.content);
        if (lexResult.errors.length > 0) {
          for (const err of lexResult.errors) {
            errors.push(formatLexerError(err, file.content, file.id));
          }
          continue;
        }

        // Stage 2: Phân tích cú pháp (Parser)
        parserInstance.input = lexResult.tokens;
        const cst = parserInstance.program();

        if (parserInstance.errors.length > 0) {
          for (const err of parserInstance.errors) {
            errors.push(formatParserError(err, file.content, file.id));
          }
          continue;
        }

        // Xây dựng AST cho từng file
        const builder = new VNSAstBuilder(file.id);
        const fileAst = builder.visit(cst) as ProgramAST;
        if (fileAst?.topLevelStatements) {
          allTopLevelStatements.push(...fileAst.topLevelStatements);
        }
        if (fileAst?.scenes) {
          allScenes.push(...fileAst.scenes);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const lineMatch = msg.match(/at line (\d+)/i);
        const line = lineMatch ? parseInt(lineMatch[1]!, 10) : 1;
        errors.push({
          code: VNS_ERROR_CODES.ERR_SYNTAX_GENERIC,
          message: cleanMessage(msg),
          rawMessage: msg,
          loc: {
            fileId: file.id,
            line: Number.isFinite(line) ? line : 1,
            col: 1,
          },
        });
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    try {
      const rawAst: ProgramAST = {
        type: 'Program',
        topLevelStatements: allTopLevelStatements.length > 0 ? allTopLevelStatements : undefined,
        scenes: allScenes,
      };

      // Stage 3.5: Kiểm tra cấu trúc phân cấp Scene & Sub-scene (ADR-015: giới hạn 1 cấp)
      const structureErrors = validateSceneStructure(rawAst);
      if (structureErrors.length > 0) {
        return {
          success: false,
          ast: rawAst,
          errors: structureErrors,
        };
      }

      // Stage 0 Merge Pass: Phẳng hóa local sub-scenes và kế thừa UI
      const mergedAst = runMergePass(rawAst);

      // Stage 4: Kiểm tra ngữ nghĩa (Semantic Validation)
      const semanticErrors = validateSemantics(mergedAst, options);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        errors: [
          {
            code: VNS_ERROR_CODES.ERR_SYNTAX_GENERIC,
            message: cleanMessage(msg),
            rawMessage: msg,
          },
        ],
      };
    }
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
