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
    get_zero: () => 0,
    is_falsy: () => false,
  });

  const variables: Record<string, string | number | boolean> = {
    affection: 20,
    playerName: 'Hero',
    isHappy: true,
    penalty: 5,
  };

  it('should evaluate literal expressions (number, string, boolean, null)', () => {
    expect(evaluator.evaluate({ type: 'Literal', value: 42 }, variables)).toBe(42);
    expect(evaluator.evaluate({ type: 'Literal', value: 'hello' }, variables)).toBe('hello');
    expect(evaluator.evaluate({ type: 'Literal', value: false }, variables)).toBe(false);
    expect(evaluator.evaluate({ type: 'Literal', value: null }, variables)).toBe(null);
  });

  it('should evaluate identifier expressions safely and throw VariableNotFoundError on missing vars', () => {
    expect(evaluator.evaluate({ type: 'Identifier', name: 'affection' }, variables)).toBe(20);
    expect(evaluator.evaluate({ type: 'Identifier', name: 'playerName' }, variables)).toBe('Hero');

    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: 'non_existent_key' }, variables),
    ).toThrowError(VariableNotFoundError);
  });

  it('should block prototype pollution attempts', () => {
    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: '__proto__' }, variables),
    ).toThrowError(PrototypePollutionError);

    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: 'constructor' }, variables),
    ).toThrowError(PrototypePollutionError);

    expect(() =>
      evaluator.evaluate({ type: 'Identifier', name: 'prototype' }, variables),
    ).toThrowError(PrototypePollutionError);

    // Registering forbidden name
    expect(() => evaluator.registerFunction('__proto__', () => 'hacked')).toThrowError(
      PrototypePollutionError,
    );
  });

  it('should evaluate unary expressions (!, -, +) and validate operand types', () => {
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

    // +penalty -> 5
    expect(
      evaluator.evaluate(
        {
          type: 'UnaryExpression',
          operator: '+',
          prefix: true,
          argument: { type: 'Identifier', name: 'penalty' },
        },
        variables,
      ),
    ).toBe(5);

    // Type error when applying unary minus to string
    expect(() =>
      evaluator.evaluate(
        {
          type: 'UnaryExpression',
          operator: '-',
          prefix: true,
          argument: { type: 'Identifier', name: 'playerName' },
        },
        variables,
      ),
    ).toThrowError(VMRuntimeError);
  });

  it('should evaluate binary arithmetic (+, -, *, /, %) and guard against division/modulo by zero', () => {
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

    // 20 - 5 -> 15
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '-',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Identifier', name: 'penalty' },
        },
        variables,
      ),
    ).toBe(15);

    // 20 * 3 -> 60
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '*',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 3 },
        },
        variables,
      ),
    ).toBe(60);

    // 20 / 4 -> 5
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '/',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 4 },
        },
        variables,
      ),
    ).toBe(5);

    // 20 % 6 -> 2
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '%',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 6 },
        },
        variables,
      ),
    ).toBe(2);

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
    ).toThrowError(/Division by zero/);

    // modulo by zero throws error
    expect(() =>
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '%',
          left: { type: 'Literal', value: 10 },
          right: { type: 'Literal', value: 0 },
        },
        variables,
      ),
    ).toThrowError(/Division by zero/);
  });

  it('should support string concatenation with numbers and strings', () => {
    // "Điểm: " + affection -> "Điểm: 20"
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Literal', value: 'Điểm: ' },
          right: { type: 'Identifier', name: 'affection' },
        },
        variables,
      ),
    ).toBe('Điểm: 20');

    // "Xin chào " + playerName -> "Xin chào Hero"
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Literal', value: 'Xin chào ' },
          right: { type: 'Identifier', name: 'playerName' },
        },
        variables,
      ),
    ).toBe('Xin chào Hero');
  });

  it('should evaluate comparisons (==, !=, >, >=, <, <=)', () => {
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '==',
          left: { type: 'Identifier', name: 'playerName' },
          right: { type: 'Literal', value: 'Hero' },
        },
        variables,
      ),
    ).toBe(true);

    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '!=',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 0 },
        },
        variables,
      ),
    ).toBe(true);

    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '>=',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 20 },
        },
        variables,
      ),
    ).toBe(true);

    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '<=',
          left: { type: 'Identifier', name: 'penalty' },
          right: { type: 'Literal', value: 10 },
        },
        variables,
      ),
    ).toBe(true);
  });

  it('should evaluate logical expressions (&&, ||) with short-circuiting', () => {
    // true && isHappy -> true
    expect(
      evaluator.evaluate(
        {
          type: 'BinaryExpression',
          operator: '&&',
          left: { type: 'Literal', value: true },
          right: { type: 'Identifier', name: 'isHappy' },
        },
        variables,
      ),
    ).toBe(true);

    // false && throw_error -> should short-circuit to false
    const andShortCircuit: ExpressionAST = {
      type: 'BinaryExpression',
      operator: '&&',
      left: { type: 'Literal', value: false },
      right: { type: 'Identifier', name: 'variable_that_does_not_exist' },
    };
    expect(evaluator.evaluate(andShortCircuit, variables)).toBe(false);

    // true || throw_error -> should short-circuit to true
    const orShortCircuit: ExpressionAST = {
      type: 'BinaryExpression',
      operator: '||',
      left: { type: 'Literal', value: true },
      right: { type: 'Identifier', name: 'variable_that_does_not_exist' },
    };
    expect(evaluator.evaluate(orShortCircuit, variables)).toBe(true);
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

    // get_zero() -> 0 (falsy number value preserved)
    expect(
      evaluator.evaluate(
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'get_zero' },
          arguments: [],
        },
        variables,
      ),
    ).toBe(0);

    // is_falsy() -> false
    expect(
      evaluator.evaluate(
        {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'is_falsy' },
          arguments: [],
        },
        variables,
      ),
    ).toBe(false);

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
