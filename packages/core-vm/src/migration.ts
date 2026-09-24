// ==========================================
// CƠ CHẾ VALIDATE SCHEMA & MIGRATE SAVE FILE (TAD 4.4)
// ==========================================

import type { VMState, SaveFileData } from '@vn-engine/shared-types';
import { CURRENT_SAVE_VERSION } from '@vn-engine/shared-types';
import { InvalidSaveDataError } from './errors';

export type SaveMigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

const migrationRegistry = new Map<string, SaveMigrationFn>();

function getMigrationKey(fromVersion: number, toVersion: number): string {
  return `${fromVersion}->${toVersion}`;
}

/**
 * Đăng ký hàm chuyển đổi (migration) giữa 2 phiên bản save file
 */
export function registerSaveMigration(
  fromVersion: number,
  toVersion: number,
  migrator: SaveMigrationFn,
): void {
  migrationRegistry.set(getMigrationKey(fromVersion, toVersion), migrator);
}

/**
 * Xóa toàn bộ migration đã đăng ký (dùng cho test)
 */
export function clearSaveMigrations(): void {
  migrationRegistry.clear();
}

/**
 * Kiểm tra tính hợp lệ chặt chẽ của VMState
 */
export function validateVMState(state: unknown): asserts state is VMState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new InvalidSaveDataError('state must be an object.');
  }

  const s = state as Record<string, unknown>;

  if (typeof s['currentScene'] !== 'string' || s['currentScene'].trim() === '') {
    throw new InvalidSaveDataError('state.currentScene must be a non-empty string.');
  }

  if (
    typeof s['instructionPointer'] !== 'number' ||
    !Number.isInteger(s['instructionPointer']) ||
    s['instructionPointer'] < 0
  ) {
    throw new InvalidSaveDataError('state.instructionPointer must be a non-negative integer.');
  }

  if (!Array.isArray(s['callStack'])) {
    throw new InvalidSaveDataError('state.callStack must be an array.');
  }

  for (let i = 0; i < s['callStack'].length; i++) {
    const frame = s['callStack'][i];
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new InvalidSaveDataError(`state.callStack[${i}] is invalid.`);
    }
    const f = frame as Record<string, unknown>;
    if (typeof f['scene'] !== 'string' || typeof f['ip'] !== 'number') {
      throw new InvalidSaveDataError(`state.callStack[${i}] missing scene or ip field.`);
    }
  }

  if (!s['variables'] || typeof s['variables'] !== 'object' || Array.isArray(s['variables'])) {
    throw new InvalidSaveDataError('state.variables must be an object.');
  }

  if (
    !s['localVariables'] ||
    typeof s['localVariables'] !== 'object' ||
    Array.isArray(s['localVariables'])
  ) {
    throw new InvalidSaveDataError('state.localVariables must be an object.');
  }

  if (
    !s['characterDisplayOverrides'] ||
    typeof s['characterDisplayOverrides'] !== 'object' ||
    Array.isArray(s['characterDisplayOverrides'])
  ) {
    throw new InvalidSaveDataError('state.characterDisplayOverrides must be an object.');
  }

  if (
    !s['customScriptState'] ||
    typeof s['customScriptState'] !== 'object' ||
    Array.isArray(s['customScriptState'])
  ) {
    throw new InvalidSaveDataError('state.customScriptState must be an object.');
  }
}

/**
 * Di trú dữ liệu save game từ phiên bản cũ lên phiên bản targetVersion
 */
export function migrateSaveData(
  data: unknown,
  targetVersion: number = CURRENT_SAVE_VERSION,
): SaveFileData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new InvalidSaveDataError('Save game data must be a JSON object.');
  }

  let current = { ...(data as Record<string, unknown>) };

  // 1. Xử lý dữ liệu save legacy (không có trường version)
  if (current['version'] === undefined || current['version'] === null) {
    if (!current['state']) {
      throw new InvalidSaveDataError('missing state.');
    }
    const rawState = current['state'] as Record<string, unknown>;
    if (!rawState || typeof rawState !== 'object') {
      throw new InvalidSaveDataError('missing state.');
    }

    current = {
      version: 1,
      dslVersion: typeof current['dslVersion'] === 'string' ? current['dslVersion'] : '1.0.0',
      timestamp: typeof current['timestamp'] === 'number' ? current['timestamp'] : Date.now(),
      state: {
        ...rawState,
        callStack: Array.isArray(rawState['callStack']) ? rawState['callStack'] : [],
        variables:
          rawState['variables'] && typeof rawState['variables'] === 'object'
            ? rawState['variables']
            : {},
        localVariables:
          rawState['localVariables'] && typeof rawState['localVariables'] === 'object'
            ? rawState['localVariables']
            : {},
        characterDisplayOverrides:
          rawState['characterDisplayOverrides'] &&
          typeof rawState['characterDisplayOverrides'] === 'object'
            ? rawState['characterDisplayOverrides']
            : {},
        customScriptState:
          rawState['customScriptState'] && typeof rawState['customScriptState'] === 'object'
            ? rawState['customScriptState']
            : {},
      },
      dialogueCounter:
        typeof current['dialogueCounter'] === 'number' ? current['dialogueCounter'] : 0,
    };
  }

  const fileVersion = current['version'];
  if (typeof fileVersion !== 'number' || !Number.isInteger(fileVersion) || fileVersion < 1) {
    throw new InvalidSaveDataError(`Invalid save file version: ${fileVersion}.`);
  }

  // 2. Chặn nếu save file tạo từ phiên bản engine tương lai
  if (fileVersion > targetVersion) {
    throw new InvalidSaveDataError(
      `Save file version (v${fileVersion}) is newer than supported runtime version (v${targetVersion}). Please update the engine.`,
    );
  }

  // 3. Thực thi tuần tự các hàm migration từng bước nếu fileVersion < targetVersion
  let v = fileVersion;
  while (v < targetVersion) {
    const nextV = v + 1;
    const key = getMigrationKey(v, nextV);
    const migrator = migrationRegistry.get(key);
    if (!migrator) {
      throw new InvalidSaveDataError(
        `No migration function found to convert from v${v} to v${nextV}.`,
      );
    }
    current = migrator(current);
    current['version'] = nextV;
    v = nextV;
  }

  if (!current['state']) {
    throw new InvalidSaveDataError('missing state.');
  }

  return current as unknown as SaveFileData;
}
