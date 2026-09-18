import { describe, it, expect } from 'vitest';
import { SandboxEvaluator } from '../src/evaluator';
import {
  VariableNotFoundError,
  FunctionNotAllowedError,
  PrototypePollutionError,
  VMRuntimeError,
} from '../src/errors';
import type { ExpressionAST } from '@vn-engine/shared-types';

describe('SandboxEvaluator', () => {
  const evaluator = new SandboxEvaluator({
    custom_func: (val: unknown) => `hello_${val}`,
  });

  const variables: Record<string, string | number | boolean> = {
    affection: 20,
    playerName: 'Hero',
    isHappy: true,
    penalty: 5,
  };

  it('should evaluate literal expressions', () => {
    expect(evaluator.evaluate({ type: 'Literal', value: 42 }, variables)).toBe(42);
    expect(evaluator.evaluate({ type: 'Literal', value: 'hello' }, variables)).toBe('hello');
    expect(evaluator.evaluate({ type: 'Literal', value: false }, variables)).toBe(false);
  });

  it('should evaluate identifier expressions safely', () => {
    expect(evaluator.evaluate({ type: 'Identifier', name: 'affection' }, variables)).toBe(20);
    expect(evaluator.evaluate({ type: 'Identifier', name: 'playerName' }, variables)).toBe('Hero');

    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: 'non_existent' }, variables),
    ).toThrowError(VariableNotFoundError);
  });

  it('should block prototype pollution attempts', () => {
    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: '__proto__' }, variables),
    ).toThrowError(PrototypePollutionError);

    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: 'constructor' }, variables),
    ).toThrowError(PrototypePollutionError);
  });

  it('should evaluate unary expressions (!, -)', () => {
    // !isHappy -> false
    expect(
      evaluator.evaluate(
        {
          type: 'UnaryExpression',
          operator: '!',
          prefix: true,
          argument: { type: 'Identifier', name: 'isHappy' },
        },
        variables,
      ),
    ).toBe(false);

    // -penalty -> -5
    expect(
      evaluator.evaluate(
        {
          type: 'UnaryExpression',
          operator: '-',
          prefix: true,
          argument: { type: 'Identifier', name: 'penalty' },
        },
        variables,
      ),
    ).toBe(-5);
  });

  it('should evaluate binary arithmetic and comparison expressions', () => {
    // affection + 10 -> 30
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 10 },
        },
        variables,
      ),
    ).toBe(30);

    // affection > 15 -> true
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '>',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 15 },
        },
        variables,
      ),
    ).toBe(true);

    // division by zero throws error
    expect(() =>
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '/',
          left: { type: 'Literal', value: 10 },
          right: { type: 'Literal', value: 0 },
        },
        variables,
      ),
    ).toThrowError(VMRuntimeError);
  });

  it('should evaluate logical expressions (&&, ||) with short-circuiting', () => {
    // affection > 10 && isHappy -> true
    const andExpr: ExpressionAST = {
      type: 'BinaryExpression',
      operator: '&&',
      left: {
        type: 'BinaryExpression',
        operator: '>',
        left: { type: 'Identifier', name: 'affection' },
        right: { type: 'Literal', value: 10 },
      },
      right: { type: 'Identifier', name: 'isHappy' },
    };
    expect(evaluator.evaluate(andExpr, variables)).toBe(true);

    // false && throw_error -> should short-circuit to false
    const shortCircuitExpr: ExpressionAST = {
      type: 'BinaryExpression',
      operator: '&&',
      left: { type: 'Literal', value: false },
      right: { type: 'Identifier', name: 'variable_that_does_not_exist' },
    };
    expect(evaluator.evaluate(shortCircuitExpr, variables)).toBe(false);
  });

  it('should evaluate allowed function calls and block unauthorized functions', () => {
    // custom_func("world") -> "hello_world"
    expect(
      evaluator.evaluate(
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'custom_func' },
          arguments: [{ type: 'Literal', value: 'world' }],
        },
        variables,
      ),
    ).toBe('hello_world');

    // has_item with context
    const inventory = ['flower', 'key'];
    expect(
      evaluator.evaluate(
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'has_item' },
          arguments: [
            { type: 'Literal', value: 'flower' },
            { type: 'Literal', value: inventory as unknown as string },
          ],
        },
        variables,
      ),
    ).toBe(true);

    // unauthorized function -> throws FunctionNotAllowedError
    expect(() =>
      evaluator.evaluate(
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'eval' },
          arguments: [{ type: 'Literal', value: '1+1' }],
        },
        variables,
      ),
    ).toThrowError(FunctionNotAllowedError);
  });
});
