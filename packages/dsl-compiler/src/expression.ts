// ==========================================
// TRÌNH PHÂN TÍCH BIỂU THỨC (EXPRESSION PARSER - JSEP WRAPPER)
// ==========================================

import jsep from 'jsep';
import type { ExpressionAST, SourceLocation } from '@vn-engine/shared-types';

export interface ExpressionParseResult {
  ast: ExpressionAST;
  error?: string;
}

const ALLOWED_BINARY_OPS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
]);

const ALLOWED_UNARY_OPS = new Set(['!', '-', '+']);

/**
 * Chuyển đổi cây cú pháp của jsep sang ExpressionAST chuẩn của Engine
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
      if (!ALLOWED_BINARY_OPS.has(bin.operator)) {
        throw new Error(
          `Unsupported operator "${bin.operator}" in expression. Only standard arithmetic, comparison, and logical operators are allowed.`,
        );
      }
      return {
        type: 'BinaryExpression',
        operator: bin.operator,
        left: convertJsepNode(bin.left),
        right: convertJsepNode(bin.right),
      };
    }

    case 'UnaryExpression': {
      const un = node as jsep.UnaryExpression;
      if (!ALLOWED_UNARY_OPS.has(un.operator)) {
        throw new Error(`Unsupported unary operator "${un.operator}" in expression.`);
      }
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
        throw new Error('Only direct function calls by name (Identifier) are supported');
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
      throw new Error(`Unsupported expression type in DSL sandbox: ${node.type}`);
  }
}

/**
 * Phân tích chuỗi biểu thức điều kiện hoặc tính toán
 */
export function parseExpression(exprString: string, loc?: SourceLocation): ExpressionAST {
  const trimmed = exprString.trim();
  if (!trimmed) {
    throw new Error('Expression cannot be empty');
  }

  try {
    const jsepParsed = jsep(trimmed);
    return convertJsepNode(jsepParsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const atLoc = loc ? ` (at line ${loc.line})` : '';
    throw new Error(`Expression syntax error "${trimmed}"${atLoc}: ${msg}`);
  }
}
