import { describe, it, expect } from 'vitest';
import { interpolate } from '../src/interpolation';
import { SandboxEvaluator } from '../src/evaluator';
import { VisualNovelVM } from '../src/vm';
import type { Instruction, DialogueInstruction, ChoiceInstruction } from '@vn-engine/shared-types';

describe('String Interpolation Module (interpolation.ts)', () => {
  const evaluator = new SandboxEvaluator();
  const context = {
    playerName: 'Alice',
    gold: 1500000,
    ratio: 87.654,
    level: 10,
    cost: 500,
  };

  it('thay thế biến đơn giản chính xác', () => {
    const text = 'Chào mừng {playerName} gia nhập!';
    expect(interpolate(text, context, evaluator)).toBe('Chào mừng Alice gia nhập!');
  });

  it('áp dụng bộ lọc :comma cho số tiền lớn', () => {
    const text = 'Bạn có {gold:comma} vàng.';
    expect(interpolate(text, context, evaluator)).toBe('Bạn có 1,500,000 vàng.');
  });

  it('áp dụng các bộ lọc chữ hoa/thường: :upper, :lower, :capitalize', () => {
    expect(interpolate('{playerName:upper}', context, evaluator)).toBe('ALICE');
    expect(interpolate('{playerName:lower}', context, evaluator)).toBe('alice');
    expect(interpolate('{"bob":capitalize}', context, evaluator)).toBe('Bob');
  });

  it('áp dụng bộ lọc :round làm tròn số', () => {
    expect(interpolate('Tỷ lệ: {ratio:round}%', context, evaluator)).toBe('Tỷ lệ: 88%');
  });

  it('sử dụng giá trị dự phòng fallback ?? khi biến không tồn tại hoặc rỗng', () => {
    expect(interpolate('Chào {unknownVar ?? "Khách lạ"}!', context, evaluator)).toBe(
      'Chào Khách lạ!',
    );
    expect(interpolate("Chào {unknownVar ?? 'Bạn mến'}!", context, evaluator)).toBe(
      'Chào Bạn mến!',
    );
  });

  it('giữ nguyên biến nếu không tìm thấy và không có fallback', () => {
    expect(interpolate('Mã: {notFoundCode}', context, evaluator)).toBe('Mã: {notFoundCode}');
  });

  it('bảo toàn ký hiệu ngoặc nhọn khi được escape bằng \\{ và \\}', () => {
    const text = 'Công thức: \\{a, b, c\\} và biến {playerName}!';
    expect(interpolate(text, context, evaluator)).toBe('Công thức: {a, b, c} và biến Alice!');
  });

  it('bỏ qua và bảo toàn nguyên vẹn các thẻ điều khiển Typewriter ({pause:...}, {speed:...}, {color:...})', () => {
    const text =
      '{speed:slow}Khoan đã... {pause:0.5s}{color:#38bdf8}{playerName}{/color}!{speed:normal}';
    const result = interpolate(text, context, evaluator);
    expect(result).toBe(
      '{speed:slow}Khoan đã... {pause:0.5s}{color:#38bdf8}Alice{/color}!{speed:normal}',
    );

    // Hỗ trợ cả thẻ có khoảng trắng như {pause: 1s}, {speed: slow}, {color: #hex}
    const withSpaces = 'Hi {pause: 1s} {speed: fast}{playerName}{ /color }';
    expect(interpolate(withSpaces, context, evaluator)).toBe(
      'Hi {pause: 1s} {speed: fast}Alice{ /color }',
    );
  });

  it('hỗ trợ biểu thức tính toán an toàn qua Sandbox Evaluator', () => {
    expect(interpolate('Số vàng còn lại: {gold - cost} vàng', context, evaluator)).toBe(
      'Số vàng còn lại: 1499500 vàng',
    );
    expect(interpolate('Cấp độ mới: {level + 1}', context, evaluator)).toBe('Cấp độ mới: 11');
    expect(interpolate('Tổng chi: {cost * 2 : comma}', context, evaluator)).toBe('Tổng chi: 1,000');
  });
});

describe('VNVirtualMachine Interpolation Integration', () => {
  it('nội suy lời thoại DIALOGUE khi chạy VM', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      {
        type: 'ASSIGN',
        variable: 'playerName',
        value: { type: 'Literal', value: 'Khang' },
        scope: 'global',
      },
      {
        type: 'ASSIGN',
        variable: 'gold',
        value: { type: 'Literal', value: 50000 },
        scope: 'global',
      },
      {
        type: 'DIALOGUE',
        character: 'alice',
        text: 'Chào {playerName}, túi đồ có {gold:comma} vàng!',
      },
    ];

    const vm = new VisualNovelVM(program);
    const res = vm.runUntilInteractive();

    expect(res.stepResult.type).toBe('SUSPEND_DIALOGUE');
    const diag = (res.stepResult as { instruction: DialogueInstruction }).instruction;
    expect(diag.text).toBe('Chào Khang, túi đồ có 50,000 vàng!');
  });

  it('nội suy các lựa chọn trong CHOICE', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      { type: 'ASSIGN', variable: 'cost', value: { type: 'Literal', value: 100 }, scope: 'global' },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Mua vé ({cost} vàng)', targetScene: 'buy' },
          { text: 'Đi về', targetScene: 'leave' },
        ],
      },
    ];

    const vm = new VisualNovelVM(program);
    const res = vm.runUntilInteractive();

    expect(res.stepResult.type).toBe('SUSPEND_CHOICE');
    const choiceInstr = (res.stepResult as { instruction: ChoiceInstruction }).instruction;
    expect(choiceInstr.choices[0]?.text).toBe('Mua vé (100 vàng)');
    expect(choiceInstr.choices[1]?.text).toBe('Đi về');
  });

  it('nội suy danh xưng trong REVEAL', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      {
        type: 'ASSIGN',
        variable: 'title',
        value: { type: 'Literal', value: 'Thám tử' },
        scope: 'global',
      },
      { type: 'REVEAL', characterId: 'alice', displayName: '{title} Alice' },
      { type: 'DIALOGUE', character: 'alice', text: 'Chào!' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    expect(vm.getState().characterDisplayOverrides['alice']).toBe('Thám tử Alice');
  });

  it('nội suy câu thoại trong getStateCatchUp()', () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'main' },
      {
        type: 'ASSIGN',
        variable: 'hero',
        value: { type: 'Literal', value: 'Arthur' },
        scope: 'global',
      },
      { type: 'DIALOGUE', character: 'narrator', text: 'Hiệp sĩ {hero} xuất hiện.' },
    ];

    const vm = new VisualNovelVM(program);
    vm.runUntilInteractive();

    const catchUp = vm.getStateCatchUp();
    expect(catchUp.currentDialogue?.text).toBe('Hiệp sĩ Arthur xuất hiện.');
  });
});
