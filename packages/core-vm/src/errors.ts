// ==========================================
// CORE VM RUNTIME ERROR CLASSES
// ==========================================

export class VMRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VMRuntimeError';
  }
}

export class InstructionBudgetExceededError extends VMRuntimeError {
  constructor(steps: number, scene: string, ip: number) {
    super(
      `Execution budget exceeded (${steps} steps) in scene "${scene}" at instruction #${ip}. Potential infinite loop detected!`,
    );
    this.name = 'InstructionBudgetExceededError';
  }
}

export class InvalidChoiceError extends VMRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidChoiceError';
  }
}

export class SceneNotFoundError extends VMRuntimeError {
  constructor(sceneName: string) {
    super(`Target scene does not exist in script program: "${sceneName}".`);
    this.name = 'SceneNotFoundError';
  }
}

export class VariableNotFoundError extends VMRuntimeError {
  constructor(varName: string) {
    super(`Variable "${varName}" is uninitialized or does not exist in VM memory.`);
    this.name = 'VariableNotFoundError';
  }
}

export class FunctionNotAllowedError extends VMRuntimeError {
  constructor(funcName: string) {
    super(`Function "${funcName}" is not in the Sandbox allowed whitelist.`);
    this.name = 'FunctionNotAllowedError';
  }
}

export class PrototypePollutionError extends VMRuntimeError {
  constructor(propName: string) {
    super(`Forbidden property access detected: "${propName}" (Blocked Prototype Pollution).`);
    this.name = 'PrototypePollutionError';
  }
}

export class EmptyCallStackError extends VMRuntimeError {
  constructor() {
    super('RETURN instruction executed while callStack is empty (no caller scene to return to).');
    this.name = 'EmptyCallStackError';
  }
}

export class InvalidSaveDataError extends VMRuntimeError {
  constructor(reason: string) {
    super(`Invalid save game data: ${reason}`);
    this.name = 'InvalidSaveDataError';
  }
}
