import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import { compileString } from '@vn-engine/dsl-compiler';
import type { DialogueInstruction, StepResult } from '@vn-engine/shared-types';

function asDialogue(stepResult: StepResult): DialogueInstruction {
  if (stepResult.type !== 'SUSPEND_DIALOGUE') {
    throw new Error(`Expected SUSPEND_DIALOGUE, got ${stepResult.type}`);
  }
  return stepResult.instruction as DialogueInstruction;
}

describe('Bug 3.2 & 3.4: SFX Persistence and Choice Rollback Behavior', () => {
  describe('Bug 3.2: One-shot SFX should not persist in activeAudio or replay on rollback', () => {
    it('does not retain one-shot sound in activeAudio while retaining looping music', () => {
      const dsl = `
        scene main {
          play music "bgm_theme" loop: true volume: 0.8
          play sound "sfx_bell" volume: 0.9
          alice: "Line 1"
          alice: "Line 2"
        }
      `;

      const compiled = compileString(dsl);
      expect(compiled.success).toBe(true);

      const vm = new VisualNovelVM(compiled.program!);

      // Step to Line 1
      const res1 = vm.runUntilInteractive();
      expect(res1.stepResult.type).toBe('SUSPEND_DIALOGUE');

      // State after Line 1: music is active, sound (one-shot) must NOT be in activeAudio
      const state1 = vm.getState();
      expect(state1.activeAudio?.['music']).toBeDefined();
      expect(state1.activeAudio?.['music']?.loop).toBe(true);
      expect(state1.activeAudio?.['sound']).toBeUndefined();

      // Step to Line 2
      const res2 = vm.runUntilInteractive();
      expect(res2.stepResult.type).toBe('SUSPEND_DIALOGUE');

      // Rollback to Line 1
      const rollbackOk = vm.rollback();
      expect(rollbackOk).toBe(true);

      const catchUp = vm.getStateCatchUp();
      expect(catchUp.audio.has('music')).toBe(true);
      expect(catchUp.audio.has('sound')).toBe(false);
    });
  });

  describe('Bug 3.4: Rollback from Choice Menu screen', () => {
    it('rolls back to the current line (Line 2) directly before the choice menu rather than skipping back 2 lines to Line 1', () => {
      const dsl = `
        scene main {
          alice: "Line 1"
          alice: "Line 2"
          choice {
            "Option A": goto .opt_a
            "Option B": goto .opt_b
          }
          scene .opt_a {
            alice: "Chosen A"
          }
          scene .opt_b {
            alice: "Chosen B"
          }
        }
      `;

      const compiled = compileString(dsl);
      expect(compiled.success).toBe(true);

      const vm = new VisualNovelVM(compiled.program!);

      // Step 1: Advance to Line 1
      const r1 = vm.runUntilInteractive();
      expect(r1.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(asDialogue(r1.stepResult).text).toBe('Line 1');

      // Step 2: Advance to Line 2
      const r2 = vm.runUntilInteractive();
      expect(r2.stepResult.type).toBe('SUSPEND_DIALOGUE');
      expect(asDialogue(r2.stepResult).text).toBe('Line 2');

      // Step 3: Advance to Choice Menu (suspended at Choice)
      const r3 = vm.runUntilInteractive();
      expect(r3.stepResult.type).toBe('SUSPEND_CHOICE');

      // Now player is looking at the choice menu with Line 2 on screen.
      // Pressing Rollback should rewind to Line 2 (not Line 1).
      const rollbackFromChoice = vm.rollback();
      expect(rollbackFromChoice).toBe(true);

      // Verify that after rolling back from Choice, currentDialogue is Line 2!
      expect(vm.getState().currentDialogue?.text).toBe('Line 2');

      // Pressing Rollback a SECOND time should now rewind to Line 1
      const rollbackSecondTime = vm.rollback();
      expect(rollbackSecondTime).toBe(true);
      expect(vm.getState().currentDialogue?.text).toBe('Line 1');
    });
  });
});
