// ==========================================
// BỘ XỬ LÝ NỘI SUY CHUỖI (STRING INTERPOLATION)
// ==========================================

import jsep from 'jsep';
import type { ExpressionAST } from '@vn-engine/shared-types';
import type { SandboxEvaluator } from './evaluator';

const ESC_LCURLY = '\uE000';
const ESC_RCURLY = '\uE001';

const CONTROL_TAG_PATTERN = /^(pause|wait)\s*:|^(speed)\s*:|^(color)\s*:|^\s*\/color\s*$/i;
const KNOWN_FILTERS = new Set(['comma', 'upper', 'lower', 'capitalize', 'round']);

/**
 * Chuyển đổi cây AST của jsep sang ExpressionAST tương thích SandboxEvaluator
 */
function convertJsepNode(node: jsep.Expression): ExpressionAST {
  switch (node.type) {
    case 'Literal': {
      const lit = node as jsep.Literal;
      return {
        type: 'Literal',
        value: (lit.value as string | number | boolean | null) ?? null,
        raw: lit.raw,
      };
    }

    case 'Identifier': {
      const id = node as jsep.Identifier;
      return {
        type: 'Identifier',
        name: id.name,
      };
    }

    case 'LogicalExpression':
    case 'BinaryExpression': {
      const bin = node as jsep.BinaryExpression;
      return {
        type: 'BinaryExpression',
        operator: bin.operator,
        left: convertJsepNode(bin.left),
        right: convertJsepNode(bin.right),
      };
    }

    case 'UnaryExpression': {
      const un = node as jsep.UnaryExpression;
      return {
        type: 'UnaryExpression',
        operator: un.operator,
        argument: convertJsepNode(un.argument),
        prefix: un.prefix,
      };
    }

    case 'CallExpression': {
      const call = node as jsep.CallExpression;
      if (call.callee.type !== 'Identifier') {
        throw new Error('Only direct function calls by name are supported');
      }
      return {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: (call.callee as jsep.Identifier).name,
        },
        arguments: call.arguments.map(convertJsepNode),
      };
    }

    default:
      throw new Error(`Unsupported expression type in interpolation: ${node.type}`);
  }
}

/**
 * Áp dụng bộ lọc định dạng lên giá trị
 */
function applyFilter(val: unknown, filter: string): unknown {
  switch (filter.toLowerCase()) {
    case 'comma': {
      const num = Number(val);
      return isNaN(num) ? val : num.toLocaleString('en-US');
    }
    case 'upper':
      return String(val).toUpperCase();
    case 'lower':
      return String(val).toLowerCase();
    case 'capitalize': {
      const str = String(val);
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
    case 'round': {
      const num = Number(val);
      return isNaN(num) ? val : Math.round(num);
    }
    default:
      return val;
  }
}

/**
 * Nội suy các biến và biểu thức trong chuỗi văn bản
 *
 * Quy tắc:
 * 1. Thoát ký hiệu: `\{` và `\}` được bảo toàn thành `{` và `}`.
 * 2. Thẻ Typewriter: `{pause:...}`, `{speed:...}`, `{color:...}`, `{/color}` được giữ nguyên.
 * 3. Nội suy biến: `{biến}` hoặc `{biểu_thức}`.
 * 4. Hỗ trợ Filter: `{biến:filter}` (ví dụ: `:comma`, `:upper`, `:round`).
 * 5. Hỗ trợ Fallback: `{biến ?? "giá trị mặc định"}`.
 */
export function interpolate(
  text: string,
  context: Record<string, string | number | boolean>,
  evaluator?: SandboxEvaluator,
): string {
  if (!text || (!text.includes('{') && !text.includes('\\{'))) {
    return text;
  }

  // 1. Bảo vệ các ký hiệu thoát
  let workingText = text.replace(/\\\{/g, ESC_LCURLY).replace(/\\\}/g, ESC_RCURLY);

  // 2. Phân tích nội suy single-pass
  workingText = workingText.replace(/\{([^{}]+)\}/g, (match, rawInner) => {
    const inner = rawInner.trim();

    // Bỏ qua các thẻ điều khiển nhịp Typewriter
    if (CONTROL_TAG_PATTERN.test(inner)) {
      return match;
    }

    // Tách phần Fallback (??) nếu có
    let exprPart = inner;
    let fallbackValue: string | undefined;

    const fallbackIndex = inner.indexOf('??');
    if (fallbackIndex !== -1) {
      exprPart = inner.slice(0, fallbackIndex).trim();
      let rawFallback = inner.slice(fallbackIndex + 2).trim();
      // Bóc dấu ngoặc kép hoặc đơn nếu có
      if (
        (rawFallback.startsWith('"') && rawFallback.endsWith('"')) ||
        (rawFallback.startsWith("'") && rawFallback.endsWith("'"))
      ) {
        rawFallback = rawFallback.slice(1, -1);
      }
      fallbackValue = rawFallback;
    }

    // Tách phần Filter (:filter) nếu có
    let filterName: string | undefined;
    const lastColonIndex = exprPart.lastIndexOf(':');
    if (lastColonIndex !== -1) {
      const potentialFilter = exprPart
        .slice(lastColonIndex + 1)
        .trim()
        .toLowerCase();
      if (KNOWN_FILTERS.has(potentialFilter)) {
        filterName = potentialFilter;
        exprPart = exprPart.slice(0, lastColonIndex).trim();
      }
    }

    // Đánh giá biểu thức
    let val: unknown = undefined;

    // Đường tắt tối ưu cho Identifier đơn thuần (chiếm 95% trường hợp)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(exprPart)) {
      if (Object.prototype.hasOwnProperty.call(context, exprPart)) {
        val = context[exprPart];
      }
    } else if (evaluator) {
      // Biểu thức tính toán an toàn qua jsep + SandboxEvaluator
      try {
        const jsepAst = jsep(exprPart);
        const engineAst = convertJsepNode(jsepAst);
        val = evaluator.evaluate(engineAst, context);
      } catch {
        // Nếu parse hoặc evaluate biểu thức lỗi, fallback sang undefined
        val = undefined;
      }
    }

    // Xử lý giá trị fallback
    if (val === undefined || val === null || val === '') {
      if (fallbackValue !== undefined) {
        val = fallbackValue;
      } else {
        // Biến không tồn tại và không có fallback -> giữ nguyên text gốc
        return match;
      }
    }

    // Áp dụng filter
    if (filterName) {
      val = applyFilter(val, filterName);
    }

    return String(val);
  });

  // 3. Khôi phục các ký tự thoát
  return workingText
    .replace(new RegExp(ESC_LCURLY, 'g'), '{')
    .replace(new RegExp(ESC_RCURLY, 'g'), '}');
}
