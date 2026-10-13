import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import type { Instruction } from '@vn-engine/shared-types';

describe('Dialogue Key & Read Text Tracking in VisualNovelVM', () => {
  it('returns null when not at a DIALOGUE instruction', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'WAIT', duration: 1 },
      { type: 'HALT' },
    ];
    const vm = new VisualNovelVM(program);
    expect(vm.getCurrentDialogueKey()).toBeNull();
    vm.step(); // SCENE intro
    expect(vm.getCurrentDialogueKey()).toBeNull();
  });

  it('generates deterministic dialogue keys with scene, relative index, character, and template text', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'chapter1' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello!' },
      { type: 'DIALOGUE', character: 'bob', text: 'Good morning.' },
      { type: 'SCENE', name: 'chapter2' },
      { type: 'DIALOGUE', character: 'alice', text: 'We are in chapter 2 now.' },
      { type: 'DIALOGUE', character: null, text: 'A narrator speaks.' },
      { type: 'HALT' },
    ];

    const vm = new VisualNovelVM(program);

    // Step into chapter1 first dialogue
    const step1 = vm.runUntilInteractive();
    expect(step1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(vm.getCurrentDialogueKey()).toBe('chapter1#0:alice:Hello!');

    // Step into chapter1 second dialogue
    const step2 = vm.runUntilInteractive();
    expect(step2.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(vm.getCurrentDialogueKey()).toBe('chapter1#1:bob:Good morning.');

    // Step into chapter2 first dialogue (counter resets to 0 for chapter2)
    const step3 = vm.runUntilInteractive();
    expect(step3.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(vm.getCurrentDialogueKey()).toBe('chapter2#0:alice:We are in chapter 2 now.');

    // Step into chapter2 second dialogue (character is null -> empty string in key)
    const step4 = vm.runUntilInteractive();
    expect(step4.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(vm.getCurrentDialogueKey()).toBe('chapter2#1::A narrator speaks.');
  });

  it('keeps dialogue key stable using template text even when variable interpolation occurs', () => {
    const program: Instruction[] = [
      {
        type: 'ASSIGN',
        variable: 'hero_name',
        value: { type: 'Literal', value: 'Arthur' },
      },
      { type: 'SCENE', name: 'main' },
      { type: 'DIALOGUE', character: 'doctor', text: 'Greetings, {hero_name}!' },
    ];

    const vm = new VisualNovelVM(program);
    const res = vm.runUntilInteractive();
    expect(res.stepResult.type).toBe('SUSPEND_DIALOGUE');
    if (res.stepResult.type === 'SUSPEND_DIALOGUE') {
      const diag = res.stepResult.instruction as { text: string };
      expect(diag.text).toBe('Greetings, Arthur!');
    }

    // But the persistent dialogue key retains the template text for consistency
    expect(vm.getCurrentDialogueKey()).toBe('main#0:doctor:Greetings, {hero_name}!');
  });

  it('preserves dialogue key correctly through rollback and rollforward', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'scene_a' },
      { type: 'DIALOGUE', character: 'hero', text: 'Line 1' },
      { type: 'DIALOGUE', character: 'hero', text: 'Line 2' },
      { type: 'DIALOGUE', character: 'hero', text: 'Line 3' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive(); // Line 1
    expect(vm.getCurrentDialogueKey()).toBe('scene_a#0:hero:Line 1');

    vm.runUntilInteractive(); // Line 2
    expect(vm.getCurrentDialogueKey()).toBe('scene_a#1:hero:Line 2');

    vm.runUntilInteractive(); // Line 3
    expect(vm.getCurrentDialogueKey()).toBe('scene_a#2:hero:Line 3');

    // Rollback to Line 2
    expect(vm.rollback()).toBe(true);
    expect(vm.getCurrentDialogueKey()).toBe('scene_a#1:hero:Line 2');

    // Rollback to Line 1
    expect(vm.rollback()).toBe(true);
    expect(vm.getCurrentDialogueKey()).toBe('scene_a#0:hero:Line 1');

    // Rollforward to Line 2
    expect(vm.rollforward()).toBe(true);
    expect(vm.getCurrentDialogueKey()).toBe('scene_a#1:hero:Line 2');
  });

  it('retrieves precalculated dialogue keys by instruction index via getDialogueKey()', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'hub' },
      { type: 'BACKGROUND', assetId: 'bg_hub' },
      { type: 'DIALOGUE', character: 'guide', text: 'Welcome to the hub.' },
    ];

    const vm = new VisualNovelVM(program);
    expect(vm.getDialogueKey(0)).toBeNull(); // SCENE
    expect(vm.getDialogueKey(1)).toBeNull(); // BACKGROUND
    expect(vm.getDialogueKey(2)).toBe('hub#0:guide:Welcome to the hub.');
  });
});
