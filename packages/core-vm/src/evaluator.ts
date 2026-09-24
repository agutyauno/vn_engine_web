// ==========================================
// SAFE EXPRESSION EVALUATOR (SANDBOX EVALUATOR)
// ==========================================

import type { ExpressionAST } from '@vn-engine/shared-types';
import {
  VariableNotFoundError,
  FunctionNotAllowedError,
  PrototypePollutionError,
  VMRuntimeError,
} from './errors';

export type AllowedFunction = (...args: unknown[]) => unknown;

const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

export class SandboxEvaluator {
  private allowedFunctions: Map<string, AllowedFunction> = new Map();

  constructor(customFunctions?: Record<string, AllowedFunction>) {
    // Default built-in has_item helper function (checks inventory context if available)
    this.registerFunction('has_item', (itemId: unknown, contextInventory?: unknown) => {
      if (Array.isArray(contextInventory)) {
        return contextInventory.includes(itemId);
      }
      return false;
    });

    if (customFunctions) {
      for (const [name, fn] of Object.entries(customFunctions)) {
        this.registerFunction(name, fn);
      }
    }
  }

  public registerFunction(name: string, fn: AllowedFunction): void {
    if (FORBIDDEN_PROPERTIES.has(name)) {
      throw new PrototypePollutionError(name);
    }
    this.allowedFunctions.set(name, fn);
  }

  public evaluate(
    node: ExpressionAST,
    variables: Record<string, string | number | boolean>,
  ): string | number | boolean | null {
    switch (node.type) {
      case 'Literal': {
        return node.value;
      }

      case 'Identifier': {
        const name = node.name;
        if (FORBIDDEN_PROPERTIES.has(name)) {
          throw new PrototypePollutionError(name);
        }

        if (!Object.prototype.hasOwnProperty.call(variables, name)) {
          throw new VariableNotFoundError(name);
        }

        return variables[name] ?? null;
      }

      case 'UnaryExpression': {
        const argVal = this.evaluate(node.argument, variables);

        if (node.operator === '!') {
          return !argVal;
        }
        if (node.operator === '-') {
          if (typeof argVal !== 'number') {
            throw new VMRuntimeError(
              `Unary negation operator "-" requires numeric value, received: ${typeof argVal}`,
            );
          }
          return -argVal;
        }
        if (node.operator === '+') {
          if (typeof argVal !== 'number') {
            throw new VMRuntimeError(
              `Unary plus operator "+" requires numeric value, received: ${typeof argVal}`,
            );
          }
          return +argVal;
        }

        throw new VMRuntimeError(`Unsupported unary operator: "${node.operator}"`);
      }

      case 'BinaryExpression': {
        const leftVal = this.evaluate(node.left, variables);

        if (node.operator === '&&') {
          if (!leftVal) return false;
          return !!this.evaluate(node.right, variables);
        }
        if (node.operator === '||') {
          if (leftVal) return true;
          return !!this.evaluate(node.right, variables);
        }

        const rightVal = this.evaluate(node.right, variables);

        switch (node.operator) {
          case '+': {
            if (typeof leftVal === 'string' || typeof rightVal === 'string') {
              return String(leftVal) + String(rightVal);
            }
            if (typeof leftVal === 'number' && typeof rightVal === 'number') {
              return leftVal + rightVal;
            }
            throw new VMRuntimeError(
              `Addition operator "+" only supports strings or numbers, received: ${typeof leftVal} and ${typeof rightVal}`,
            );
          }
          case '-': {
            if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
              throw new VMRuntimeError(
                'Subtraction operator "-" requires both operands to be numeric',
              );
            }
            return leftVal - rightVal;
          }
          case '*': {
            if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
              throw new VMRuntimeError('Multiplication "*" requires both operands to be numeric');
            }
            return leftVal * rightVal;
          }
          case '/': {
            if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
              throw new VMRuntimeError('Division "/" requires both operands to be numeric');
            }
            if (rightVal === 0) {
              throw new VMRuntimeError('Division by zero in expression!');
            }
            return leftVal / rightVal;
          }
          case '%': {
            if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
              throw new VMRuntimeError('Modulo "%" requires both operands to be numeric');
            }
            if (rightVal === 0) {
              throw new VMRuntimeError('Division by zero in expression!');
            }
            return leftVal % rightVal;
          }
          case '==':
          case '===':
            return leftVal === rightVal;
          case '!=':
          case '!==':
            return leftVal !== rightVal;
          case '>':
            return (leftVal as number) > (rightVal as number);
          case '>=':
            return (leftVal as number) >= (rightVal as number);
          case '<':
            return (leftVal as number) < (rightVal as number);
          case '<=':
            return (leftVal as number) <= (rightVal as number);
          default:
            throw new VMRuntimeError(`Unsupported binary operator: "${node.operator}"`);
        }
      }

      case 'CallExpression': {
        const funcName = node.callee.name;
        if (FORBIDDEN_PROPERTIES.has(funcName)) {
          throw new PrototypePollutionError(funcName);
        }

        const fn = this.allowedFunctions.get(funcName);
        if (!fn) {
          throw new FunctionNotAllowedError(funcName);
        }

        const args = node.arguments.map(argNode => this.evaluate(argNode, variables));
        const res = fn(...args);
        return (res as string | number | boolean | null) ?? null;
      }

      default:
        throw new VMRuntimeError(
          `Unsupported expression node type: "${(node as { type: string }).type}"`,
        );
    }
  }
}
