import { describe, it, expect } from 'vitest';
import { SnapshotRingBuffer } from '../src/ring_buffer';
import type { VMSnapshot, VMState } from '@vn-engine/shared-types';

function createMockSnapshot(
  dialogueIndex: number,
  affection: number,
  interactionType?: 'DIALOGUE' | 'CHOICE' | 'PAUSE',
): VMSnapshot {
  const state: VMState = {
    currentScene: 'intro',
    instructionPointer: dialogueIndex,
    callStack: [],
    variables: { affection },
    characterDisplayOverrides: {},
    customScriptState: {},
    localVariables: {},
  };

  return {
    timestamp: 1000 + dialogueIndex,
    dialogueIndex,
    interactionType,
    state,
  };
}

describe('SnapshotRingBuffer (Rollback Engine ADR-022)', () => {
  it('should push snapshots and respect max capacity', () => {
    const buffer = new SnapshotRingBuffer(3);
    expect(buffer.size()).toBe(0);
    expect(buffer.canRollback()).toBe(false);

    buffer.push(createMockSnapshot(1, 10));
    buffer.push(createMockSnapshot(2, 20));
    expect(buffer.size()).toBe(2);
    expect(buffer.canRollback()).toBe(true);

    buffer.push(createMockSnapshot(3, 30));
    buffer.push(createMockSnapshot(4, 40)); // Snapshot 1 sẽ bị loại bỏ vì capacity = 3

    expect(buffer.size()).toBe(3);
    const history = buffer.getHistory();
    expect(history[0]?.dialogueIndex).toBe(2);
    expect(history[1]?.dialogueIndex).toBe(3);
    expect(history[2]?.dialogueIndex).toBe(4);
  });

  it('should handle large wrap-around (push 100 items into buffer with capacity 50)', () => {
    const buffer = new SnapshotRingBuffer(50);
    for (let i = 1; i <= 100; i++) {
      buffer.push(createMockSnapshot(i, i * 10));
    }

    expect(buffer.size()).toBe(50);
    const history = buffer.getHistory();
    expect(history[0]?.dialogueIndex).toBe(51);
    expect(history[49]?.dialogueIndex).toBe(100);
  });

  it('should handle empty buffer and single item boundary conditions', () => {
    const buffer = new SnapshotRingBuffer(5);
    expect(buffer.canRollback()).toBe(false);
    expect(buffer.canRollforward()).toBe(false);
    expect(buffer.rollback()).toBeUndefined();
    expect(buffer.rollforward()).toBeUndefined();

    // Single item: cannot rollback (needs at least 2 to go back to previous)
    buffer.push(createMockSnapshot(1, 10));
    expect(buffer.canRollback()).toBe(false);
    expect(buffer.rollback()).toBeUndefined();
  });

  it('should perform multi-step rollback and rollforward correctly', () => {
    const buffer = new SnapshotRingBuffer(5);
    buffer.push(createMockSnapshot(1, 10));
    buffer.push(createMockSnapshot(2, 20));
    buffer.push(createMockSnapshot(3, 30));

    expect(buffer.canRollback()).toBe(true);
    expect(buffer.canRollforward()).toBe(false);

    // Rollback lần 1: từ snapshot 3 quay về snapshot 2
    const prev1 = buffer.rollback() as any;
    expect(prev1).toBeDefined();
    expect(prev1?.restored.dialogueIndex).toBe(2);
    expect(prev1?.restored.state.variables['affection']).toBe(20);
    expect(prev1?.popped.dialogueIndex).toBe(3);
    expect(prev1?.popped.state.variables['affection']).toBe(30);
    expect(buffer.canRollforward()).toBe(true);

    // Rollback lần 2: từ snapshot 2 quay về snapshot 1
    const prev2 = buffer.rollback() as any;
    expect(prev2).toBeDefined();
    expect(prev2?.restored.dialogueIndex).toBe(1);
    expect(prev2?.restored.state.variables['affection']).toBe(10);
    expect(prev2?.popped.dialogueIndex).toBe(2);
    expect(prev2?.popped.state.variables['affection']).toBe(20);
    expect(buffer.canRollback()).toBe(false); // Đã về đầu lịch sử

    // Rollback lần 3: khi đã ở đầu lịch sử -> trả về undefined
    expect(buffer.rollback()).toBeUndefined();

    // Rollforward lần 1: từ snapshot 1 tiến lên snapshot 2
    const forward1 = buffer.rollforward();
    expect(forward1).toBeDefined();
    expect(forward1?.dialogueIndex).toBe(2);
    expect(buffer.canRollback()).toBe(true);

    // Rollforward lần 2: từ snapshot 2 tiến lên snapshot 3
    const forward2 = buffer.rollforward();
    expect(forward2).toBeDefined();
    expect(forward2?.dialogueIndex).toBe(3);
    expect(buffer.canRollforward()).toBe(false); // Đã ở đỉnh tiến trình

    // Rollforward lần 3: khi đã ở đỉnh -> trả về undefined
    expect(buffer.rollforward()).toBeUndefined();
  });

  it('should clear forward history when a new action is taken after rollback', () => {
    const buffer = new SnapshotRingBuffer(5);
    buffer.push(createMockSnapshot(1, 10));
    buffer.push(createMockSnapshot(2, 20));

    // Rollback về 1
    buffer.rollback();
    expect(buffer.canRollforward()).toBe(true);

    // Người chơi chọn nhánh khác, push snapshot mới
    buffer.push(createMockSnapshot(3, 99));

    // Ngăn xếp roll-forward phải bị xóa hoàn toàn
    expect(buffer.canRollforward()).toBe(false);
    expect(buffer.size()).toBe(2);
  });

  it('should guarantee deep immutability: external mutations do not corrupt stored history', () => {
    const buffer = new SnapshotRingBuffer(5);
    const snap = createMockSnapshot(1, 100);
    buffer.push(snap);

    // Mutate the original snapshot object
    snap.state.variables['affection'] = 999;
    expect(buffer.getHistory()[0]?.state.variables['affection']).toBe(100);

    // Push second snapshot and rollback
    buffer.push(createMockSnapshot(2, 200));
    const rolled = buffer.rollback() as any;
    expect(rolled?.restored.state.variables['affection']).toBe(100);
    expect(rolled?.popped.state.variables['affection']).toBe(200);

    // Mutate returned snapshot
    if (rolled) {
      rolled.restored.state.variables['affection'] = 555;
    }

    // Buffer internal state must remain 100
    expect(buffer.getHistory()[0]?.state.variables['affection']).toBe(100);
  });

  it('should clear history and forward stack with clear() and clearForward()', () => {
    const buffer = new SnapshotRingBuffer(5);
    buffer.push(createMockSnapshot(1, 10));
    buffer.push(createMockSnapshot(2, 20));
    buffer.rollback();
    expect(buffer.canRollforward()).toBe(true);

    buffer.clearForward();
    expect(buffer.canRollforward()).toBe(false);

    buffer.clear();
    expect(buffer.size()).toBe(0);
    expect(buffer.canRollback()).toBe(false);
  });

  it('TC-RING-BUFFER-01: preserves interactionType in cloned snapshots and returns { restored, popped } on rollback', () => {
    const buffer = new SnapshotRingBuffer(5);
    buffer.push(createMockSnapshot(1, 10, 'DIALOGUE'));
    buffer.push(createMockSnapshot(2, 20, 'PAUSE'));
    buffer.push(createMockSnapshot(3, 30, 'CHOICE'));

    const history = buffer.getHistory();
    expect(history[0]?.interactionType).toBe('DIALOGUE');
    expect(history[1]?.interactionType).toBe('PAUSE');
    expect(history[2]?.interactionType).toBe('CHOICE');

    const rollbackResult1 = buffer.rollback() as any;
    expect(rollbackResult1).toBeDefined();
    expect(rollbackResult1?.popped.interactionType).toBe('CHOICE');
    expect(rollbackResult1?.restored.interactionType).toBe('PAUSE');
    expect(rollbackResult1?.restored.dialogueIndex).toBe(2);

    const rollbackResult2 = buffer.rollback() as any;
    expect(rollbackResult2).toBeDefined();
    expect(rollbackResult2?.popped.interactionType).toBe('PAUSE');
    expect(rollbackResult2?.restored.interactionType).toBe('DIALOGUE');
    expect(rollbackResult2?.restored.dialogueIndex).toBe(1);
  });
});
