// ==========================================
// BYTECODE PROGRAM & INSTRUCTION VALIDATOR (ADR-021)
// Bảo vệ ranh giới Zero-Trust trước khi nạp vào Runtime VM
// ==========================================

import type { Instruction } from '@vn-engine/shared-types';

export const VALID_INSTRUCTION_TYPES: readonly string[] = [
  'SCENE',
  'DIALOGUE',
  'CHOICE',
  'BACKGROUND',
  'SHOW',
  'HIDE',
  'HIDE_DIALOGUE',
  'PLAY',
  'STOP',
  'WAIT',
  'GOTO',
  'CONDITIONAL_GOTO',
  'LOOP_START',
  'LOOP_END',
  'CALL',
  'RETURN',
  'HALT',
  'ASSIGN',
  'LABEL',
  'REVEAL',
  'INSPECT_BEGIN',
  'INSPECT_END',
  'RUN_SCRIPT',
  'SPAWN_SCRIPT',
  'SCENE_END',
] as const;

const VALID_TYPE_SET: ReadonlySet<string> = new Set(VALID_INSTRUCTION_TYPES);

/**
 * Kiểm tra xem một đối tượng có phải là Instruction hợp lệ hay không (Type Guard)
 */
export function isValidInstruction(item: unknown): item is Instruction {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return false;
  }

  const instr = item as Record<string, unknown>;
  if (typeof instr.type !== 'string' || !VALID_TYPE_SET.has(instr.type)) {
    return false;
  }

  switch (instr.type) {
    case 'SCENE':
      return typeof instr.name === 'string' && instr.name.trim().length > 0;

    case 'DIALOGUE':
      return (
        typeof instr.text === 'string' &&
        (instr.character === null ||
          instr.character === undefined ||
          typeof instr.character === 'string')
      );

    case 'CHOICE':
      return (
        Array.isArray(instr.choices) &&
        instr.choices.length > 0 &&
        instr.choices.every(
          c =>
            c &&
            typeof c === 'object' &&
            !Array.isArray(c) &&
            typeof (c as Record<string, unknown>).text === 'string' &&
            typeof (c as Record<string, unknown>).targetScene === 'string',
        )
      );

    case 'GOTO':
    case 'CALL':
      return typeof instr.targetScene === 'string';

    case 'CONDITIONAL_GOTO':
      return (
        typeof instr.targetScene === 'string' &&
        instr.condition !== null &&
        typeof instr.condition === 'object'
      );

    case 'LOOP_START':
      return (
        typeof instr.loopEndTargetScene === 'string' &&
        instr.condition !== null &&
        typeof instr.condition === 'object'
      );

    case 'LOOP_END':
      return typeof instr.loopStartTargetScene === 'string';

    case 'BACKGROUND':
      return typeof instr.assetId === 'string';

    case 'SHOW':
      return typeof instr.character === 'string' && typeof instr.sprite === 'string';

    case 'HIDE':
      return typeof instr.character === 'string';

    case 'PLAY':
      return typeof instr.channel === 'string' && typeof instr.assetId === 'string';

    case 'STOP':
      return typeof instr.channel === 'string';

    case 'WAIT':
      return (
        typeof instr.duration === 'number' && !Number.isNaN(instr.duration) && instr.duration >= 0
      );

    case 'ASSIGN':
      return (
        typeof instr.variable === 'string' &&
        instr.value !== null &&
        typeof instr.value === 'object' &&
        !Array.isArray(instr.value)
      );

    case 'LABEL':
      return typeof instr.name === 'string';

    case 'REVEAL':
      return typeof instr.characterId === 'string' && typeof instr.displayName === 'string';

    case 'INSPECT_BEGIN':
      return typeof instr.assetId === 'string';

    case 'RUN_SCRIPT':
    case 'SPAWN_SCRIPT':
      return typeof instr.screenId === 'string';

    case 'SCENE_END':
      return typeof instr.sceneName === 'string';

    case 'HIDE_DIALOGUE':
    case 'INSPECT_END':
    case 'RETURN':
    case 'HALT':
      return true;

    default:
      return false;
  }
}

/**
 * Kiểm tra xem toàn bộ mảng có phải là một kịch bản bytecode hợp lệ hay không.
 * Kịch bản hợp lệ phải là mảng không rỗng, mọi lệnh đều hợp lệ và chứa ít nhất một SCENE.
 */
export function isValidProgram(program: unknown): program is Instruction[] {
  if (!Array.isArray(program) || program.length === 0) {
    return false;
  }

  let hasScene = false;
  for (let i = 0; i < program.length; i++) {
    const item = program[i];
    if (!isValidInstruction(item)) {
      return false;
    }
    if (item.type === 'SCENE') {
      hasScene = true;
    }
  }

  return hasScene;
}

/**
 * Kiểm định chi tiết và trả về danh sách lỗi cụ thể (phục vụ Debugger / Error reporting)
 */
export function validateProgram(program: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(program) || program.length === 0) {
    errors.push('Program must be a non-empty array of instructions.');
    return { valid: false, errors };
  }

  let hasScene = false;
  for (let i = 0; i < program.length; i++) {
    const item = program[i];
    if (!isValidInstruction(item)) {
      const typeStr =
        item && typeof item === 'object' && 'type' in item
          ? String((item as Record<string, unknown>).type)
          : typeof item;
      errors.push(`Instruction at index ${i} has invalid structure or unknown type: "${typeStr}".`);
    } else if (item.type === 'SCENE') {
      hasScene = true;
    }
  }

  if (!hasScene) {
    errors.push('Program must contain at least one SCENE instruction.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
