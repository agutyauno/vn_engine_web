// ==========================================
// VNS ERROR FORMATTER & DIAGNOSTIC CODES
// Tuân thủ Zero-Trust & Clean Plain English Error Reporting
// ==========================================

import type { IRecognitionException } from 'chevrotain';
import type { CompileError } from './semantic';

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
 * Quét chuỗi mã nguồn để tìm dấu mở ngoặc nhọn '{' chưa được đóng lại,
 * bỏ qua chú thích //, chú thích khối /* *\/ và chuỗi ký tự "..." / '...'.
 */
export function findUnclosedBrace(fileContent: string): { line: number; col: number } | null {
  const lines = fileContent.split('\n');
  const braceStack: Array<{ line: number; col: number }> = [];
  let inBlockComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineStr = lines[lineIdx]!;
    let inString = false;
    let stringChar = '';

    for (let colIdx = 0; colIdx < lineStr.length; colIdx++) {
      const ch = lineStr[colIdx];
      const next = lineStr[colIdx + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          colIdx++;
        }
        continue;
      }

      if (inString) {
        if (ch === '\\') {
          colIdx++; // Bỏ qua ký tự escape
        } else if (ch === stringChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '/' && next === '*') {
        inBlockComment = true;
        colIdx++;
        continue;
      }

      if (ch === '/' && next === '/') {
        break; // Phần còn lại của dòng là comment
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '{') {
        braceStack.push({ line: lineIdx + 1, col: colIdx + 1 });
      } else if (ch === '}') {
        if (braceStack.length > 0) {
          braceStack.pop();
        }
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
  err: { message: string; line?: number; column?: number; offset?: number },
  _fileContent: string,
  fileId: string,
): CompileError {
  const line = typeof err.line === 'number' && Number.isFinite(err.line) ? err.line : 1;
  const col = typeof err.column === 'number' && Number.isFinite(err.column) ? err.column : 1;

  return {
    code: VNS_ERROR_CODES.ERR_SYNTAX_GENERIC,
    message: `Lexer error: ${err.message}`,
    rawMessage: err.message,
    loc: { fileId, line, col },
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

  // 1. Kiểm tra thiếu chuỗi thoại sau dấu hai chấm (TC-FE-01)
  for (let l = 0; l < lines.length; l++) {
    const lineTrim = lines[l]?.trim() ?? '';
    if (/^[a-zA-Z_][a-zA-Z0-9_]*(?:\s+as\s+"[^"]*")?:\s*$/.test(lineTrim)) {
      const col = (lines[l]?.indexOf(':') ?? 0) + 1;
      return {
        code: VNS_ERROR_CODES.ERR_SYNTAX_MISSING_DIALOGUE,
        message: `Missing dialogue text after character colon ':' on line ${l + 1}. Expected a string literal.`,
        rawMessage: err.message,
        loc: { fileId, line: l + 1, col },
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
        loc: { fileId, line: l + 1, col },
      };
    }
  }

  // 3. Kiểm tra khối chưa đóng ngoặc nhọn '}' (TC-FE-03)
  const unclosed = findUnclosedBrace(fileContent);
  if (unclosed) {
    return {
      code: VNS_ERROR_CODES.ERR_SYNTAX_UNCLOSED_BRACE,
      message: `Missing closing brace '}' for block starting on line ${unclosed.line}.`,
      rawMessage: err.message,
      loc: { fileId, line: unclosed.line, col: unclosed.col },
    };
  }

  // 4. Dự phòng lỗi cú pháp chung (TC-FE-06)
  return {
    code: VNS_ERROR_CODES.ERR_SYNTAX_GENERIC,
    message: cleanMessage(err.message || 'Syntax error encountered during parsing.'),
    rawMessage: err.message,
    loc: {
      fileId,
      line: Number.isFinite(tokenLine) ? tokenLine : 1,
      col: Number.isFinite(tokenCol) ? tokenCol : 1,
    },
  };
}
