// ==========================================
// CÁC LỚP LỖI MÁY ẢO RUNTIME (CORE VM ERRORS)
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
      `Đã vượt quá giới hạn ngân sách thực thi (${steps} bước) tại scene "${scene}", vị trí lệnh #${ip}. Phát hiện nguy cơ vòng lặp vô hạn!`,
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
    super(`Scene mục tiêu không tồn tại trong chương trình kịch bản: "${sceneName}".`);
    this.name = 'SceneNotFoundError';
  }
}

export class VariableNotFoundError extends VMRuntimeError {
  constructor(varName: string) {
    super(`Biến "${varName}" chưa được khởi tạo hoặc không tồn tại trong bộ nhớ máy ảo.`);
    this.name = 'VariableNotFoundError';
  }
}

export class FunctionNotAllowedError extends VMRuntimeError {
  constructor(funcName: string) {
    super(`Hàm "${funcName}" không nằm trong danh sách hàm được cấp phép (whitelist) của Sandbox.`);
    this.name = 'FunctionNotAllowedError';
  }
}

export class PrototypePollutionError extends VMRuntimeError {
  constructor(propName: string) {
    super(`Phát hiện hành vi truy cập thuộc tính cấm: "${propName}" (Chặn Prototype Pollution).`);
    this.name = 'PrototypePollutionError';
  }
}

export class EmptyCallStackError extends VMRuntimeError {
  constructor() {
    super('Lệnh RETURN được gọi khi callStack đang rỗng (không có scene nào để quay lại).');
    this.name = 'EmptyCallStackError';
  }
}
