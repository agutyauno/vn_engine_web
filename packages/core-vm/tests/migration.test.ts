import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateVMState,
  migrateSaveData,
  registerSaveMigration,
  clearSaveMigrations,
  VisualNovelVM,
  InvalidSaveDataError,
  VMRuntimeError,
} from '../src';
import type { VMState, Instruction } from '@vn-engine/shared-types';
import { CURRENT_SAVE_VERSION } from '@vn-engine/shared-types';

describe('Save Schema Validation & Migration Engine (TAD 4.4)', () => {
  beforeEach(() => {
    clearSaveMigrations();
  });

  describe('validateVMState', () => {
    it('should accept a valid VMState', () => {
      const validState: VMState = {
        currentScene: 'chapter1',
        instructionPointer: 0,
        callStack: [{ scene: 'intro', ip: 2 }],
        variables: { score: 10, isAlive: true, name: 'Alex' },
        localVariables: {},
        characterDisplayOverrides: { alice: 'Alice Carroll' },
        customScriptState: { minigame: '{}' },
      };

      expect(() => validateVMState(validState)).not.toThrow();
    });

    it('should reject invalid state objects or primitive types', () => {
      expect(() => validateVMState(null)).toThrow(InvalidSaveDataError);
      expect(() => validateVMState('not an object')).toThrow(InvalidSaveDataError);
      expect(() => validateVMState([])).toThrow(InvalidSaveDataError);
    });

    it('should reject invalid or missing currentScene', () => {
      expect(() =>
        validateVMState({
          currentScene: '',
          instructionPointer: 0,
          callStack: [],
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/currentScene/);

      expect(() =>
        validateVMState({
          currentScene: 123,
          instructionPointer: 0,
          callStack: [],
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/currentScene/);
    });

    it('should reject invalid instructionPointer', () => {
      expect(() =>
        validateVMState({
          currentScene: 'main',
          instructionPointer: -1,
          callStack: [],
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/instructionPointer/);

      expect(() =>
        validateVMState({
          currentScene: 'main',
          instructionPointer: 3.14,
          callStack: [],
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/instructionPointer/);
    });

    it('should reject invalid callStack structures', () => {
      expect(() =>
        validateVMState({
          currentScene: 'main',
          instructionPointer: 0,
          callStack: 'not an array',
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/callStack/);

      expect(() =>
        validateVMState({
          currentScene: 'main',
          instructionPointer: 0,
          callStack: [{ scene: 'main' }], // Thiếu ip
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/scene or ip/);
    });

    it('should reject invalid variables container', () => {
      expect(() =>
        validateVMState({
          currentScene: 'main',
          instructionPointer: 0,
          callStack: [],
          variables: 'invalid',
          characterDisplayOverrides: {},
          customScriptState: {},
        }),
      ).toThrow(/variables/);
    });
  });

  describe('migrateSaveData', () => {
    it('should auto-migrate legacy save files without version into v1 SaveFileData', () => {
      const legacyRaw = {
        state: {
          currentScene: 'intro',
          instructionPointer: 3,
          callStack: [],
          variables: { affection: 5 },
        },
        dialogueCounter: 3,
      };

      const migrated = migrateSaveData(legacyRaw, 1);
      expect(migrated.version).toBe(1);
      expect(migrated.dslVersion).toBe('1.0.0');
      expect(migrated.state.characterDisplayOverrides).toEqual({});
      expect(migrated.state.customScriptState).toEqual({});
      expect(migrated.state.variables['affection']).toBe(5);
      expect(migrated.dialogueCounter).toBe(3);
    });

    it('should reject save files from future engine versions', () => {
      const futureSave = {
        version: 999,
        timestamp: Date.now(),
        state: {
          currentScene: 'main',
          instructionPointer: 0,
          callStack: [],
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        },
        dialogueCounter: 0,
      };

      expect(() => migrateSaveData(futureSave, 1)).toThrow(/newer than supported runtime version/);
    });

    it('should execute registered migration functions sequentially across versions', () => {
      // Giả lập migration từ v1 lên v2 (thêm trường dslVersion mới và đổi cấu trúc biến)
      registerSaveMigration(1, 2, prev => {
        const prevState = (prev['state'] as Record<string, unknown>) || {};
        const prevVars = (prevState['variables'] as Record<string, unknown>) || {};
        return {
          ...prev,
          state: {
            ...prevState,
            variables: {
              ...prevVars,
              migrated_v2: true,
            },
          },
        };
      });

      const v1Save = {
        version: 1,
        timestamp: Date.now(),
        state: {
          currentScene: 'main',
          instructionPointer: 0,
          callStack: [],
          variables: { oldKey: 'value' },
          characterDisplayOverrides: {},
          customScriptState: {},
        },
        dialogueCounter: 0,
      };

      const migrated = migrateSaveData(v1Save, 2);
      expect(migrated.version).toBe(2);
      expect(migrated.state.variables['oldKey']).toBe('value');
      expect(migrated.state.variables['migrated_v2']).toBe(true);
    });

    it('should throw error when missing intermediate migration function', () => {
      const v1Save = {
        version: 1,
        timestamp: Date.now(),
        state: {
          currentScene: 'main',
          instructionPointer: 0,
          callStack: [],
          variables: {},
          characterDisplayOverrides: {},
          customScriptState: {},
        },
        dialogueCounter: 0,
      };

      // Đòi migrate lên v3 khi chưa đăng ký v1->v2
      expect(() => migrateSaveData(v1Save, 3)).toThrow(/No migration function found/);
    });
  });

  describe('VisualNovelVM Save & Restore Integration', () => {
    const testProgram: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'ASSIGN', variable: 'points', value: { type: 'Literal', value: 42 } },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello!' },
    ];

    it('should serialize with version metadata and restore seamlessly', () => {
      const vm = new VisualNovelVM(testProgram);
      vm.runUntilInteractive();

      const serialized = vm.serialize('2.0.0');
      const parsed = JSON.parse(serialized);

      expect(parsed.version).toBe(CURRENT_SAVE_VERSION);
      expect(parsed.dslVersion).toBe('2.0.0');
      expect(typeof parsed.timestamp).toBe('number');
      expect(parsed.state.variables['points']).toBe(42);

      const restoredVM = new VisualNovelVM(testProgram);
      restoredVM.restore(serialized);
      expect(restoredVM.getState().variables['points']).toBe(42);
      expect(restoredVM.getState().currentScene).toBe('main');
    });

    it('should restore legacy save files without crash', () => {
      const legacySaveJson = JSON.stringify({
        state: {
          currentScene: 'main',
          instructionPointer: 2,
          callStack: [],
          variables: { points: 100 },
        },
        dialogueCounter: 1,
      });

      const vm = new VisualNovelVM(testProgram);
      vm.restore(legacySaveJson);
      expect(vm.getState().variables['points']).toBe(100);
    });

    it('should reject corrupted json or missing state during restore', () => {
      const vm = new VisualNovelVM(testProgram);
      expect(() => vm.restore('bad-json')).toThrow(VMRuntimeError);
      expect(() => vm.restore('{}')).toThrow(/missing state/);
      expect(() => vm.restore(JSON.stringify({ state: { currentScene: '' } }))).toThrow(
        /currentScene/,
      );
    });
  });
});
