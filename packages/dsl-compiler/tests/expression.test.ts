import { describe, it, expect } from 'vitest';
import { parseExpression } from '../src/expression';

describe('Expression Parser (JSEP)', () => {
  it('should parse binary comparison expressions', () => {
    const ast = parseExpression('affection < 100');
    expect(ast.type).toBe('BinaryExpression');
    if (ast.type === 'BinaryExpression') {
      expect(ast.operator).toBe('<');
      expect(ast.left).toEqual({ type: 'Identifier', name: 'affection' });
      expect(ast.right).toEqual({ type: 'Literal', value: 100, raw: '100' });
    }
  });

  it('should parse arithmetic expressions with variables', () => {
    const ast = parseExpression('affection + 20');
    expect(ast.type).toBe('BinaryExpression');
    if (ast.type === 'BinaryExpression') {
      expect(ast.operator).toBe('+');
      expect(ast.left).toEqual({ type: 'Identifier', name: 'affection' });
      expect(ast.right).toEqual({ type: 'Literal', value: 20, raw: '20' });
    }
  });

  it('should parse safe function call expressions', () => {
    const ast = parseExpression('has_item("flower")');
    expect(ast.type).toBe('CallExpression');
    if (ast.type === 'CallExpression') {
      expect(ast.callee.name).toBe('has_item');
      expect(ast.arguments).toHaveLength(1);
      expect(ast.arguments[0]).toEqual({ type: 'Literal', value: 'flower', raw: '"flower"' });
    }
  });
});
