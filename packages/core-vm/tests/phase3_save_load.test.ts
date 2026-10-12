import { describe, it, expect, beforeEach } from 'vitest';
import {
  VisualNovelVM,
  migrateSaveData,
  clearSaveMigrations,
  registerSaveMigration,
} from '../src';
import type { Instruction, SaveFileData, StepResult, DialogueInstruction } from '@vn-engine/shared-types';
import { CURRENT_SAVE_VERSION } from '@vn-engine/shared-types';

describe('Phase 3: Save/Load System, Migration v2 & Re-anchoring', () => {
  beforeEach(() => {
    clearSaveMigrations();
  });

  describe('defaultMigrationV1ToV2', () => {
    it('automatically applies default v1 to v2 migration when no custom migration is registered', () => {
      const v1Save: Record<string, unknown> = {
        version: 1,
        timestamp: 1600000000000,
        dialogueCounter: 5,
        state: {
          currentScene: 'chapter1',
          instructionPointer: 3,
          callStack: [],
          variables: { gold: 50 },
          characterDisplayOverrides: {},
          customScriptState: {},
        },
      };

      const migrated = migrateSaveData(v1Save as unknown as SaveFileData, 2);

      expect(migrated.version).toBe(2);
      expect(migrated.state.localVariables).toEqual({});
      expect(migrated.sceneOffset).toBe(3);
      expect(migrated.backlog).toEqual([]);
      expect(migrated.state.variables['gold']).toBe(50);
    });

    it('allows registering custom migration from v1 to v2 that takes precedence', () => {
      registerSaveMigration(1, 2, (data: Record<string, unknown>) => {
        const rawState = (data.state as Record<string, unknown>) || {};
        return {
          ...data,
          version: 2,
          state: {
            ...rawState,
            localVariables: {},
            variables: {
              ...((rawState.variables as Record<string, unknown>) || {}),
              bonus_v2: true,
            },
          },
        };
      });

      const v1Save: Record<string, unknown> = {
        version: 1,
        timestamp: 1600000000000,
        dialogueCounter: 1,
        state: {
          currentScene: 'main',
          instructionPointer: 0,
          callStack: [],
          variables: { score: 10 },
          characterDisplayOverrides: {},
          customScriptState: {},
        },
      };

      const migrated = migrateSaveData(v1Save as unknown as SaveFileData, 2);
      expect(migrated.version).toBe(2);
      expect(migrated.state.variables['score']).toBe(10);
      expect(migrated.state.variables['bonus_v2']).toBe(true);
    });
  });

  describe('Scene Offset Anchoring (Bug 3.6 fix)', () => {
    const originalProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'alice', text: 'Line 1' },
      { type: 'DIALOGUE', character: 'alice', text: 'Line 2' },
    ];

    it('serializes sceneOffset relative to the current scene', () => {
      const vm = new VisualNovelVM(originalProgram);
      vm.runUntilInteractive(); // Stops at Line 1 (after executing Line 1, IP = 2, ready for Line 2)

      const saveJson = vm.serialize({ projectId: 'test_project' });
      const parsed: SaveFileData = JSON.parse(saveJson);

      expect(parsed.version).toBe(CURRENT_SAVE_VERSION);
      expect(parsed.projectId).toBe('test_project');
      expect(parsed.state.currentScene).toBe('intro');
      expect(parsed.sceneOffset).toBe(2); // intro is at 0, IP is at 2 => offset = 2
    });

    it('re-anchors instruction pointer accurately when script is modified/prepended with new scenes', () => {
      const vm1 = new VisualNovelVM(originalProgram);
      vm1.runUntilInteractive(); // Line 1 suspended, IP = 2 (points to Line 2)

      const saveJson = vm1.serialize({ projectId: 'test_project' });

      // Modified program with prepended prologue
      const modifiedProgram: Instruction[] = [
        { type: 'SCENE', name: 'prologue' },
        { type: 'DIALOGUE', character: 'narrator', text: 'Prologue intro' },
        { type: 'SCENE', name: 'intro' }, // intro is now at index 2 instead of 0
        { type: 'DIALOGUE', character: 'alice', text: 'Line 1' }, // index 3
        { type: 'DIALOGUE', character: 'alice', text: 'Line 2' }, // index 4
      ];

      const vm2 = new VisualNovelVM(modifiedProgram);
      vm2.restore(saveJson);

      // Verify that IP is safely re-anchored to index 4 (sceneIdx 2 + offset 2 = 4)
      expect(vm2.getState().currentScene).toBe('intro');
      expect(vm2.getState().instructionPointer).toBe(4);

      // Verify execution continues at Line 2 seamlessly
      const stepRes = vm2.step();
      expect(stepRes.type).toBe('SUSPEND_DIALOGUE');
      const dialogueInst = (stepRes as Extract<StepResult, { type: 'SUSPEND_DIALOGUE' }>).instruction as DialogueInstruction;
      expect(dialogueInst?.text).toBe('Line 2');
    });
  });

  describe('ProjectId and ScriptHash persistence', () => {
    it('saves and restores projectId and scriptHash metadata', () => {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        { type: 'DIALOGUE', character: 'alice', text: 'Hi' },
      ];
      const vm = new VisualNovelVM(program);
      vm.runUntilInteractive();

      const saveJson = vm.serialize({
        projectId: 'proj_alpha',
        scriptHash: 'sha256_mock_hash_123',
        dslVersion: '2.1.0',
      });

      const parsed: SaveFileData = JSON.parse(saveJson);
      expect(parsed.projectId).toBe('proj_alpha');
      expect(parsed.scriptHash).toBe('sha256_mock_hash_123');
      expect(parsed.dslVersion).toBe('2.1.0');

      const restoredVM = new VisualNovelVM(program);
      restoredVM.restore(saveJson);
      expect(restoredVM.getState().currentScene).toBe('main');
    });
  });
});
