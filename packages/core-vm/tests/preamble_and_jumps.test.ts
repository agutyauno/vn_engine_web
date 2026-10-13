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

describe('Bug 3.1: Preamble re-execution and internal jumps before first dialogue', () => {
  it('should execute a while loop before the first dialogue without resetting variables or exceeding budget', () => {
    const dsl = `
      define i = 0
      scene main {
        while i < 3 {
          ~ i = i + 1
        }
        alice: "Counter is {i}"
      }
    `;

    const compiled = compileString(dsl);
    expect(compiled.success).toBe(true);

    const vm = new VisualNovelVM(compiled.program!);
    const result = vm.runUntilInteractive();

    expect(result.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const dialogue = asDialogue(result.stepResult);
    expect(dialogue.text).toBe('Counter is 3');
    expect(vm.getState().variables['i']).toBe(3);
  });

  it('should preserve mutated variable when jumping with goto before first dialogue', () => {
    const dsl = `
      define t = 0
      scene main {
        ~ t = 5
        goto scene_b
      }
      scene scene_b {
        alice: "Value is {t}"
      }
    `;

    const compiled = compileString(dsl);
    expect(compiled.success).toBe(true);

    const vm = new VisualNovelVM(compiled.program!);
    const result = vm.runUntilInteractive();

    expect(result.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const dialogue = asDialogue(result.stepResult);
    expect(dialogue.text).toBe('Value is 5');
    expect(vm.getState().variables['t']).toBe(5);
  });

  it('should preserve mutated variable when jumping via conditional goto before first dialogue', () => {
    const dsl = `
      define t = 0
      scene main {
        ~ t = 5
        if t == 5 {
          goto scene_b
        }
      }
      scene scene_b {
        alice: "Target reached with {t}"
      }
    `;

    const compiled = compileString(dsl);
    expect(compiled.success).toBe(true);

    const vm = new VisualNovelVM(compiled.program!);
    const result = vm.runUntilInteractive();

    expect(result.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const dialogue = asDialogue(result.stepResult);
    expect(dialogue.text).toBe('Target reached with 5');
    expect(vm.getState().variables['t']).toBe(5);
  });

  it('should support startAt API starting directly at a scene while properly evaluating global preamble definitions', () => {
    const dsl = `
      define initialScore = 100
      scene first_scene {
        alice: "First scene"
      }
      scene target_scene {
        alice: "Starting with score {initialScore}"
      }
    `;

    const compiled = compileString(dsl);
    expect(compiled.success).toBe(true);

    const vm = new VisualNovelVM(compiled.program!);
    // Public API for jumping from editor/player
    vm.startAt({ scene: 'target_scene' });

    const result = vm.runUntilInteractive();
    expect(result.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const dialogue = asDialogue(result.stepResult);
    expect(dialogue.text).toBe('Starting with score 100');
    expect(vm.getState().variables['initialScore']).toBe(100);
  });
});
