import { describe, it, expect } from 'vitest';
import {
  isValidProgram,
  isValidInstruction,
  validateProgram,
  VALID_INSTRUCTION_TYPES,
} from '../src/validator';
import type { Instruction } from '@vn-engine/shared-types';

describe('TDD: Bytecode Program & Instruction Validator (Zero-Trust Input Boundary)', () => {
  describe('VALID_INSTRUCTION_TYPES', () => {
    it('contains all 25 official IR instruction types defined in shared-types', () => {
      expect(VALID_INSTRUCTION_TYPES).toContain('SCENE');
      expect(VALID_INSTRUCTION_TYPES).toContain('DIALOGUE');
      expect(VALID_INSTRUCTION_TYPES).toContain('CHOICE');
      expect(VALID_INSTRUCTION_TYPES).toContain('BACKGROUND');
      expect(VALID_INSTRUCTION_TYPES).toContain('SHOW');
      expect(VALID_INSTRUCTION_TYPES).toContain('HIDE');
      expect(VALID_INSTRUCTION_TYPES).toContain('HIDE_DIALOGUE');
      expect(VALID_INSTRUCTION_TYPES).toContain('PLAY');
      expect(VALID_INSTRUCTION_TYPES).toContain('STOP');
      expect(VALID_INSTRUCTION_TYPES).toContain('WAIT');
      expect(VALID_INSTRUCTION_TYPES).toContain('GOTO');
      expect(VALID_INSTRUCTION_TYPES).toContain('CONDITIONAL_GOTO');
      expect(VALID_INSTRUCTION_TYPES).toContain('LOOP_START');
      expect(VALID_INSTRUCTION_TYPES).toContain('LOOP_END');
      expect(VALID_INSTRUCTION_TYPES).toContain('CALL');
      expect(VALID_INSTRUCTION_TYPES).toContain('RETURN');
      expect(VALID_INSTRUCTION_TYPES).toContain('HALT');
      expect(VALID_INSTRUCTION_TYPES).toContain('ASSIGN');
      expect(VALID_INSTRUCTION_TYPES).toContain('LABEL');
      expect(VALID_INSTRUCTION_TYPES).toContain('REVEAL');
      expect(VALID_INSTRUCTION_TYPES).toContain('INSPECT_BEGIN');
      expect(VALID_INSTRUCTION_TYPES).toContain('INSPECT_END');
      expect(VALID_INSTRUCTION_TYPES).toContain('RUN_SCRIPT');
      expect(VALID_INSTRUCTION_TYPES).toContain('SPAWN_SCRIPT');
      expect(VALID_INSTRUCTION_TYPES).toContain('SCENE_END');
      expect(VALID_INSTRUCTION_TYPES.length).toBe(25);
    });
  });

  describe('isValidInstruction', () => {
    it('rejects primitive values, null, undefined, arrays', () => {
      expect(isValidInstruction(null)).toBe(false);
      expect(isValidInstruction(undefined)).toBe(false);
      expect(isValidInstruction('DIALOGUE')).toBe(false);
      expect(isValidInstruction(123)).toBe(false);
      expect(isValidInstruction([])).toBe(false);
    });

    it('rejects unknown instruction types', () => {
      expect(isValidInstruction({ type: 'UNKNOWN_OPCODE' })).toBe(false);
      expect(isValidInstruction({ type: 'EXECUTE_CODE' })).toBe(false);
    });

    it('validates SCENE instruction fields', () => {
      expect(isValidInstruction({ type: 'SCENE' })).toBe(false);
      expect(isValidInstruction({ type: 'SCENE', name: '' })).toBe(false);
      expect(isValidInstruction({ type: 'SCENE', name: 123 })).toBe(false);
      expect(isValidInstruction({ type: 'SCENE', name: 'main' })).toBe(true);
    });

    it('validates DIALOGUE instruction fields', () => {
      expect(isValidInstruction({ type: 'DIALOGUE' })).toBe(false);
      expect(isValidInstruction({ type: 'DIALOGUE', text: 123 })).toBe(false);
      expect(isValidInstruction({ type: 'DIALOGUE', text: 'Hello' })).toBe(true);
      expect(isValidInstruction({ type: 'DIALOGUE', text: 'Hello', character: 'alice' })).toBe(
        true,
      );
      expect(isValidInstruction({ type: 'DIALOGUE', text: 'Hello', character: null })).toBe(true);
      expect(isValidInstruction({ type: 'DIALOGUE', text: 'Hello', character: 123 })).toBe(false);
    });

    it('validates CHOICE instruction fields', () => {
      expect(isValidInstruction({ type: 'CHOICE' })).toBe(false);
      expect(isValidInstruction({ type: 'CHOICE', choices: [] })).toBe(false);
      expect(isValidInstruction({ type: 'CHOICE', choices: ['invalid'] })).toBe(false);
      expect(
        isValidInstruction({
          type: 'CHOICE',
          choices: [{ text: 'Opt 1', targetScene: 'scene1' }],
        }),
      ).toBe(true);
      expect(
        isValidInstruction({
          type: 'CHOICE',
          choices: [{ text: 'Opt 1' }], // Missing targetScene
        }),
      ).toBe(false);
    });

    it('validates GOTO and CALL instruction fields', () => {
      expect(isValidInstruction({ type: 'GOTO' })).toBe(false);
      expect(isValidInstruction({ type: 'GOTO', targetScene: 123 })).toBe(false);
      expect(isValidInstruction({ type: 'GOTO', targetScene: 'target_scene' })).toBe(true);

      expect(isValidInstruction({ type: 'CALL' })).toBe(false);
      expect(isValidInstruction({ type: 'CALL', targetScene: 'sub_scene' })).toBe(true);
    });

    it('validates BACKGROUND, SHOW, HIDE instruction fields', () => {
      expect(isValidInstruction({ type: 'BACKGROUND' })).toBe(false);
      expect(isValidInstruction({ type: 'BACKGROUND', assetId: 'bg_room' })).toBe(true);

      expect(isValidInstruction({ type: 'SHOW', character: 'alice' })).toBe(false); // missing sprite
      expect(isValidInstruction({ type: 'SHOW', character: 'alice', sprite: 'smile' })).toBe(true);

      expect(isValidInstruction({ type: 'HIDE' })).toBe(false);
      expect(isValidInstruction({ type: 'HIDE', character: 'alice' })).toBe(true);
    });

    it('validates PLAY, STOP, WAIT instruction fields', () => {
      expect(isValidInstruction({ type: 'PLAY', channel: 'music' })).toBe(false); // missing assetId
      expect(isValidInstruction({ type: 'PLAY', channel: 'music', assetId: 'bgm' })).toBe(true);

      expect(isValidInstruction({ type: 'STOP' })).toBe(false); // missing channel
      expect(isValidInstruction({ type: 'STOP', channel: 'music' })).toBe(true);

      expect(isValidInstruction({ type: 'WAIT' })).toBe(false);
      expect(isValidInstruction({ type: 'WAIT', duration: -1 })).toBe(false);
      expect(isValidInstruction({ type: 'WAIT', duration: '1s' })).toBe(false);
      expect(isValidInstruction({ type: 'WAIT', duration: 1.5 })).toBe(true);
    });

    it('validates ASSIGN instruction fields', () => {
      expect(isValidInstruction({ type: 'ASSIGN' })).toBe(false);
      expect(isValidInstruction({ type: 'ASSIGN', variable: 'x' })).toBe(false);
      expect(
        isValidInstruction({
          type: 'ASSIGN',
          variable: 'x',
          value: { type: 'Literal', value: 10 },
        }),
      ).toBe(true);
    });
  });

  describe('isValidProgram', () => {
    it('rejects non-arrays and empty arrays', () => {
      expect(isValidProgram(null)).toBe(false);
      expect(isValidProgram(undefined)).toBe(false);
      expect(isValidProgram({})).toBe(false);
      expect(isValidProgram('not array')).toBe(false);
      expect(isValidProgram([])).toBe(false); // Program must have at least one scene
    });

    it('rejects programs containing any invalid instruction', () => {
      const corrupted = [{ type: 'SCENE', name: 'main' }, { type: 'INVALID_OP' }];
      expect(isValidProgram(corrupted)).toBe(false);
    });

    it('rejects programs without any SCENE instruction', () => {
      const noScene = [
        { type: 'DIALOGUE', text: 'Hello' },
        { type: 'PLAY', channel: 'music', assetId: 'bgm' },
      ];
      expect(isValidProgram(noScene)).toBe(false);
    });

    it('accepts valid instruction array with scenes', () => {
      const validProgram: Instruction[] = [
        { type: 'SCENE', name: 'main' },
        { type: 'BACKGROUND', assetId: 'bg_day' },
        { type: 'SHOW', character: 'alice', sprite: 'smile' },
        { type: 'DIALOGUE', character: 'alice', text: 'Xin chào người chơi!' },
        {
          type: 'CHOICE',
          choices: [
            { text: 'Đi tiếp', targetScene: 'next' },
            { text: 'Rẽ trái', targetScene: 'left' },
          ],
        },
      ];
      expect(isValidProgram(validProgram)).toBe(true);
    });
  });

  describe('validateProgram detailed reporting', () => {
    it('returns error messages with indices for malformed instructions', () => {
      const malformed = [
        { type: 'SCENE', name: 'main' },
        { type: 'BAD_TYPE' },
        { type: 'DIALOGUE' }, // missing text
      ];

      const report = validateProgram(malformed);
      expect(report.valid).toBe(false);
      expect(report.errors.length).toBe(2);
      expect(report.errors[0]).toContain('Instruction at index 1');
      expect(report.errors[1]).toContain('Instruction at index 2');
    });

    it('reports empty program error', () => {
      const report = validateProgram([]);
      expect(report.valid).toBe(false);
      expect(report.errors[0]).toContain('Program must be a non-empty array');
    });
  });
});
