import { describe, it, expect } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import {
  VariableNotFoundError,
  VMRuntimeError,
  InstructionBudgetExceededError,
  EmptyCallStackError,
} from '../src/errors';
import type { Instruction, ChoiceInstruction } from '@vn-engine/shared-types';

describe('VNS Test Lab — Runtime Error Cases [R01 - R07]', () => {
  // [R01] Biến chưa khai báo trong biểu thức
  it('[R01] ném lỗi VariableNotFoundError khi đọc biến chưa khởi tạo trong biểu thức', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r01' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R01] Trước khi lỗi.' },
      {
        type: 'CONDITIONAL_GOTO',
        condition: {
          type: 'BinaryExpression',
          operator: '>',
          left: { type: 'Identifier', name: 'scor' },
          right: { type: 'Literal', value: 5 },
        },
        targetScene: 'hub2',
      },
      { type: 'SCENE', name: 'hub2' },
      { type: 'HALT' },
    ];

    const vm = new VisualNovelVM(program);
    vm.step(); // SCENE
    vm.step(); // DIALOGUE

    expect(() => vm.step()).toThrow(VariableNotFoundError);
  });

  // [R02] Hàm ngoài whitelist
  it('[R02] ném lỗi VMRuntimeError khi gọi hàm không có trong whitelist sandbox', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r02' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R02] Trước khi lỗi.' },
      {
        type: 'ASSIGN',
        variable: 'trust',
        value: {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: 'foo' },
          arguments: [{ type: 'Literal', value: 1 }],
        },
      },
    ];

    const vm = new VisualNovelVM(program, { variables: { trust: 0 } });
    vm.step(); // SCENE
    vm.step(); // DIALOGUE

    expect(() => vm.step()).toThrow(VMRuntimeError);
    expect(() => vm.step()).toThrow(/not in the Sandbox allowed whitelist/i);
  });

  // [R03] Chia cho 0
  it('[R03] ném lỗi Division by zero khi thực hiện phép chia cho 0 trong biểu thức', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r03' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R03] Trước khi lỗi.' },
      {
        type: 'ASSIGN',
        variable: 'trust',
        value: {
          type: 'BinaryExpression',
          operator: '/',
          left: { type: 'Literal', value: 10 },
          right: { type: 'Literal', value: 0 },
        },
      },
    ];

    const vm = new VisualNovelVM(program, { variables: { trust: 0 } });
    vm.step(); // SCENE
    vm.step(); // DIALOGUE

    expect(() => vm.step()).toThrow(VMRuntimeError);
    expect(() => vm.step()).toThrow(/Division by zero/i);
  });

  // [R04] Sai kiểu dữ liệu: chuỗi trừ số
  it('[R04] ném lỗi kiểu dữ liệu khi lấy chuỗi trừ số ("abc" - 1)', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r04' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R04] Trước khi lỗi.' },
      {
        type: 'ASSIGN',
        variable: 'trust',
        value: {
          type: 'BinaryExpression',
          operator: '-',
          left: { type: 'Literal', value: 'abc' },
          right: { type: 'Literal', value: 1 },
        },
      },
    ];

    const vm = new VisualNovelVM(program, { variables: { trust: 0 } });
    vm.step(); // SCENE
    vm.step(); // DIALOGUE

    expect(() => vm.step()).toThrow(VMRuntimeError);
    expect(() => vm.step()).toThrow(/requires both operands to be numeric/i);
  });

  // [R05] Vòng lặp vô hạn
  it('[R05] ném lỗi InstructionBudgetExceededError khi vòng lặp vượt quá ngân sách bước lệnh', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r05' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R05] Sắp lặp vô hạn.' },
      { type: 'SCENE', name: 'loop_body' },
      {
        type: 'LOOP_START',
        condition: { type: 'Literal', value: true },
        loopEndTargetScene: 'loop_end',
      },
      {
        type: 'ASSIGN',
        variable: 'counter',
        value: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'counter' },
          right: { type: 'Literal', value: 1 },
        },
      },
      { type: 'LOOP_END', loopStartTargetScene: 'loop_body' },
      { type: 'SCENE', name: 'loop_end' },
      { type: 'HALT' },
    ];

    const vm = new VisualNovelVM(
      program,
      { variables: { counter: 0 } },
      { maxInstructionBudget: 100 },
    );
    vm.runUntilInteractive(); // Dừng ở câu thoại

    // Chạy tiếp vào vòng lặp vô hạn không có điểm dừng tương tác -> ngắt an toàn bằng budget counter
    expect(() => vm.runUntilInteractive()).toThrow(InstructionBudgetExceededError);
  });

  // [R06] return khi call stack rỗng
  it('[R06] ném lỗi EmptyCallStackError khi gọi return mà không có caller', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r06' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R06] Sắp return không có caller.' },
      { type: 'RETURN' },
    ];

    const vm = new VisualNovelVM(program, undefined, { emptyCallStackBehavior: 'throw' });
    vm.step(); // SCENE
    vm.step(); // DIALOGUE

    expect(() => vm.step()).toThrow(EmptyCallStackError);
  });

  // [R07] Mọi lựa chọn bị khóa
  it('[R07] khóa toàn bộ các lựa chọn khi tất cả điều kiện đều là false', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'err_r07' },
      { type: 'DIALOGUE', character: 'narrator', text: '[R07] Mọi lựa chọn đều khóa.' },
      {
        type: 'CHOICE',
        choices: [
          {
            text: 'Không bấm được 1',
            targetScene: 'hub',
            condition: { type: 'Literal', value: false },
          },
          {
            text: 'Không bấm được 2',
            targetScene: 'hub',
            condition: { type: 'Literal', value: false },
          },
        ],
      },
      { type: 'SCENE', name: 'hub' },
      { type: 'HALT' },
    ];

    const vm = new VisualNovelVM(program);
    vm.step(); // SCENE
    vm.step(); // DIALOGUE

    const choiceStep = vm.step();
    expect(choiceStep.type).toBe('SUSPEND_CHOICE');
    if (choiceStep.type === 'SUSPEND_CHOICE') {
      const choiceInstr = choiceStep.instruction as ChoiceInstruction;
      expect(choiceInstr.choices).toHaveLength(2);
    }

    // Kiểm tra khả năng chọn: Cả 2 đều có điều kiện false -> ném InvalidChoiceError
    expect(() => vm.choose(0)).toThrow(/unsatisfied condition/i);
    expect(() => vm.choose(1)).toThrow(/unsatisfied condition/i);
  });
});
