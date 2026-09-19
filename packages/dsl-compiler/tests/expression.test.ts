import { describe, it, expect } from 'vitest';
import { parseExpression } from '../src/expression';
import type {
  BinaryExpression,
  UnaryExpression,
  CallExpression,
  LiteralExpression,
} from '@vn-engine/shared-types';

describe('Expression Parser (JSEP)', () => {
  it('should parse binary comparison expressions', () => {
    const ast = parseExpression('affection < 100') as BinaryExpression;
    expect(ast.type).toBe('BinaryExpression');
    expect(ast.operator).toBe('<');
    expect(ast.left).toEqual({ type: 'Identifier', name: 'affection' });
    expect(ast.right).toEqual({ type: 'Literal', value: 100, raw: '100' });

    const eqAst = parseExpression('name == "Alice"') as BinaryExpression;
    expect(eqAst.operator).toBe('==');
    expect((eqAst.right as LiteralExpression).value).toBe('Alice');
  });

  it('should parse arithmetic expressions with operator precedence', () => {
    // 2 + 3 * 4 -> '+' with left 2 and right (3 * 4)
    const ast1 = parseExpression('2 + 3 * 4') as BinaryExpression;
    expect(ast1.operator).toBe('+');
    expect((ast1.left as LiteralExpression).value).toBe(2);
    expect((ast1.right as BinaryExpression).operator).toBe('*');

    // (2 + 3) * 4 -> '*' with left (2 + 3) and right 4
    const ast2 = parseExpression('(2 + 3) * 4') as BinaryExpression;
    expect(ast2.operator).toBe('*');
    expect((ast2.left as BinaryExpression).operator).toBe('+');
    expect((ast2.right as LiteralExpression).value).toBe(4);
  });

  it('should parse logical and compound boolean expressions', () => {
    const ast = parseExpression('score >= 50 && !isGameOver || hasKey == true') as BinaryExpression;
    expect(ast.type).toBe('BinaryExpression');
    expect(ast.operator).toBe('||');

    const leftLogical = ast.left as BinaryExpression;
    expect(leftLogical.operator).toBe('&&');

    const unaryNot = leftLogical.right as UnaryExpression;
    expect(unaryNot.type).toBe('UnaryExpression');
    expect(unaryNot.operator).toBe('!');
  });

  it('should parse unary expressions (!, -, +)', () => {
    const notAst = parseExpression('!is_happy') as UnaryExpression;
    expect(notAst.type).toBe('UnaryExpression');
    expect(notAst.operator).toBe('!');
    expect(notAst.argument).toEqual({ type: 'Identifier', name: 'is_happy' });

    const negAst = parseExpression('-points') as UnaryExpression;
    expect(negAst.type).toBe('UnaryExpression');
    expect(negAst.operator).toBe('-');
  });

  it('should parse multi-argument and nested function calls', () => {
    const ast = parseExpression('check_inventory("flower", 3)') as CallExpression;
    expect(ast.type).toBe('CallExpression');
    expect(ast.callee.name).toBe('check_inventory');
    expect(ast.arguments).toHaveLength(2);
    expect((ast.arguments[0] as LiteralExpression).value).toBe('flower');
    expect((ast.arguments[1] as LiteralExpression).value).toBe(3);

    const nestedAst = parseExpression('has_item(get_favorite_gift())') as CallExpression;
    expect(nestedAst.arguments[0]?.type).toBe('CallExpression');
  });

  it('should parse literal values including null and booleans', () => {
    const boolTrue = parseExpression('true') as LiteralExpression;
    expect(boolTrue.value).toBe(true);

    const boolFalse = parseExpression('false') as LiteralExpression;
    expect(boolFalse.value).toBe(false);

    const nullLit = parseExpression('null') as LiteralExpression;
    expect(nullLit.value).toBe(null);

    const decNum = parseExpression('3.14159') as LiteralExpression;
    expect(decNum.value).toBe(3.14159);
  });

  it('should throw clear error on empty or whitespace expression', () => {
    expect(() => parseExpression('')).toThrowError('Biểu thức không được để trống');
    expect(() => parseExpression('   ')).toThrowError('Biểu thức không được để trống');
  });

  it('should throw syntax error on broken or unsupported expressions', () => {
    expect(() => parseExpression('a + ')).toThrowError(/Lỗi cú pháp biểu thức/);
    expect(() => parseExpression('(a + b')).toThrowError(/Lỗi cú pháp biểu thức/);
    expect(() => parseExpression('obj.method()')).toThrowError(
      /Chỉ hỗ trợ gọi hàm trực tiếp theo tên/,
    );
  });
});
