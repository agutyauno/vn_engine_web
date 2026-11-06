// ==========================================
// VNS ERROR FORMATTER & DIAGNOSTIC CODES
// Tuân thủ Zero-Trust & Clean Plain English Error Reporting
// ==========================================

import type { IRecognitionException } from 'chevrotain';
import type { CompileError } from './semantic';
import { VNSLexer, LCurly, RCurly } from './lexer';

export const VNS_ERROR_CODES = {
  ERR_SYNTAX_MISSING_DIALOGUE: 'ERR_SYNTAX_MISSING_DIALOGUE',
  ERR_SYNTAX_MISSING_SCENE_NAME: 'ERR_SYNTAX_MISSING_SCENE_NAME',
  ERR_SYNTAX_UNCLOSED_BRACE: 'ERR_SYNTAX_UNCLOSED_BRACE',
  ERR_SYNTAX_GENERIC: 'ERR_SYNTAX_GENERIC',
  ERR_SEMANTIC_DANGLING_SCENE: 'ERR_SEMANTIC_DANGLING_SCENE',
  ERR_SEMANTIC_UNDEFINED_VAR: 'ERR_SEMANTIC_UNDEFINED_VAR',
  ERR_SEMANTIC_MISSING_AUDIO: 'ERR_SEMANTIC_MISSING_AUDIO',
} as const;

export type VnsErrorCode = (typeof VNS_ERROR_CODES)[keyof typeof VNS_ERROR_CODES];

/**
 * Quét token stream bằng Lexer để tìm dấu mở ngoặc nhọn '{' chưa được đóng lại.
 * Bỏ qua hoàn toàn các comment (#) và string literal vì Lexer đã lọc hoặc token hóa chính xác.
 */
export function findUnclosedBrace(fileContent: string): { line: number; col: number } | null {
  const lexResult = VNSLexer.tokenize(fileContent);
  const braceStack: Array<{ line: number; col: number }> = [];

  for (const token of lexResult.tokens) {
    if (token.tokenType === LCurly) {
      braceStack.push({ line: token.startLine ?? 1, col: token.startColumn ?? 1 });
    } else if (token.tokenType === RCurly) {
      if (braceStack.length > 0) {
        braceStack.pop();
      }
    }
  }

  if (braceStack.length > 0) {
    return braceStack[braceStack.length - 1]!;
  }
  return null;
}

/**
 * Loại bỏ các tiền tố thô như "Syntax error: " hoặc "Lexer error: "
 */
export function cleanMessage(raw: string): string {
  return raw
    .replace(/^Syntax error:\s*/i, '')
    .replace(/^Lexer error:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Định dạng lỗi từ tầng Lexer thành CompileError thân thiện
 */
export function formatLexerError(
  err: { message: string; line?: number; column?: number; offset?: number; length?: number },
  _fileContent: string,
  fileId: string,
): CompileError {
  const line = typeof err.line === 'number' && Number.isFinite(err.line) ? err.line : 1;
  const col = typeof err.column === 'number' && Number.isFinite(err.column) ? err.column : 1;
  const endLine = line;
  const endCol =
    typeof err.length === 'number' && Number.isFinite(err.length) ? col + err.length : undefined;

  return {
    code: VNS_ERROR_CODES.ERR_SYNTAX_GENERIC,
    message: `Lexer error: ${err.message}`,
    rawMessage: err.message,
    loc: {
      fileId,
      line,
      col,
      endLine,
      endCol,
    },
  };
}

/**
 * Định dạng lỗi từ Chevrotain Parser thành thông điệp tiếng Anh rõ ràng kèm mã lỗi chuẩn
 */
export function formatParserError(
  err: IRecognitionException,
  fileContent: string,
  fileId: string,
): CompileError {
  const lines = fileContent.split('\n');
  const tokenLine = err.token?.startLine || 1;
  const tokenCol = err.token?.startColumn || 1;
  const tokenEndLine = err.token?.endLine ?? tokenLine;
  const tokenEndCol =
    typeof err.token?.endColumn === 'number'
      ? err.token.endColumn + 1
      : typeof err.token?.image === 'string' && err.token.image.length > 0
        ? tokenCol + err.token.image.length
        : undefined;

  // 1. Kiểm tra thiếu chuỗi thoại sau dấu hai chấm (TC-FE-01)
  for (let l = 0; l < lines.length; l++) {
    const lineTrim = lines[l]?.trim() ?? '';
    if (/^[a-zA-Z_][a-zA-Z0-9_]*(?:\s+as\s+"[^"]*")?:\s*$/.test(lineTrim)) {
      const col = (lines[l]?.indexOf(':') ?? 0) + 1;
      return {
        code: VNS_ERROR_CODES.ERR_SYNTAX_MISSING_DIALOGUE,
        message: `Missing dialogue text after character colon ':' on line ${l + 1}. Expected a string literal.`,
        rawMessage: err.message,
        loc: { fileId, line: l + 1, col, endLine: l + 1, endCol: col + 1 },
      };
    }
  }

  // 2. Kiểm tra thiếu tên scene sau từ khóa 'scene' (TC-FE-02)
  for (let l = 0; l < lines.length; l++) {
    const lineTrim = lines[l]?.trim() ?? '';
    if (/^scene\s*\{/.test(lineTrim)) {
      const col = (lines[l]?.indexOf('scene') ?? 0) + 1;
      return {
        code: VNS_ERROR_CODES.ERR_SYNTAX_MISSING_SCENE_NAME,
        message: `Missing scene identifier after 'scene' keyword on line ${l + 1}.`,
        rawMessage: err.message,
        loc: { fileId, line: l + 1, col, endLine: l + 1, endCol: col + 5 },
      };
    }
  }

  // 3. Kiểm tra khối chưa đóng ngoặc nhọn '}' (TC-FE-03, TC-FE-07, TC-FE-09)
  const unclosed = findUnclosedBrace(fileContent);
  if (unclosed && tokenLine >= unclosed.line) {
    return {
      code: VNS_ERROR_CODES.ERR_SYNTAX_UNCLOSED_BRACE,
      message: `Missing closing brace '}' for block starting on line ${unclosed.line}.`,
      rawMessage: err.message,
      loc: {
        fileId,
        line: unclosed.line,
        col: unclosed.col,
        endLine: unclosed.line,
        endCol: unclosed.col + 1,
      },
    };
  }

  // 4. Dự phòng lỗi cú pháp chung (TC-FE-06, TC-FE-08)
  return {
    code: VNS_ERROR_CODES.ERR_SYNTAX_GENERIC,
    message: cleanMessage(err.message || 'Syntax error encountered during parsing.'),
    rawMessage: err.message,
    loc: {
      fileId,
      line: Number.isFinite(tokenLine) ? tokenLine : 1,
      col: Number.isFinite(tokenCol) ? tokenCol : 1,
      endLine: Number.isFinite(tokenEndLine) ? tokenEndLine : undefined,
      endCol: Number.isFinite(tokenEndCol) ? tokenEndCol : undefined,
    },
  };
}
