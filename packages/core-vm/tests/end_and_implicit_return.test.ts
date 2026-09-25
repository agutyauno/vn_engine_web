import { describe, it, expect, vi } from 'vitest';
import { VisualNovelVM } from '../src/vm';
import { compileString } from '@vn-engine/dsl-compiler';
import type { DialogueInstruction } from '@vn-engine/shared-types';

function asDialogue(stepResult: unknown): DialogueInstruction {
  return (stepResult as { instruction: DialogueInstruction }).instruction;
}

describe('End statement & Implicit Return at Scene Boundary', () => {
  it('should halt immediately when reaching end statement and not fall through to subsequent scene', () => {
    const script = `
scene first_ending {
    "Đây là kết thúc thứ nhất."
    end
}

scene second_ending {
    "Đây là kết thúc thứ hai - không được chạy tới đây!"
    end
}
`;
    const res = compileString(script, 'test_end.vns');
    expect(res.success).toBe(true);

    const vm = new VisualNovelVM(res.program!);

    // Câu thoại đầu tiên
    const step1 = vm.runUntilInteractive();
    expect(step1.stepResult.type).toBe('SUSPEND_DIALOGUE');
    expect(asDialogue(step1.stepResult).text).toBe('Đây là kết thúc thứ nhất.');

    // Bước tiếp theo gặp lệnh 'end' -> Phải HALTED ngay lập tức
    const step2 = vm.runUntilInteractive();
    expect(step2.stepResult.type).toBe('HALTED');
    expect(vm.getState().currentScene).toBe('first_ending');
  });

  it('should auto-return to caller and emit warning if a scene was called without an explicit return', () => {
    const script = `
scene main {
    "Trước khi gọi sub."
    call my_sub
    "Sau khi trở về main."
    end
}

scene my_sub {
    "Đang ở trong sub routine nhưng không có return."
}

scene subsequent_scene {
    "Cảnh này không được trôi vào!"
    end
}
`;
    const res = compileString(script, 'test_implicit_return.vns');
    expect(res.success).toBe(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const vm = new VisualNovelVM(res.program!);

    // 1. "Trước khi gọi sub."
    const s1 = vm.runUntilInteractive();
    expect(asDialogue(s1.stepResult).text).toBe('Trước khi gọi sub.');

    // 2. Call vào sub -> "Đang ở trong sub routine nhưng không có return."
    const s2 = vm.runUntilInteractive();
    expect(asDialogue(s2.stepResult).text).toBe('Đang ở trong sub routine nhưng không có return.');
    expect(vm.getState().currentScene).toBe('my_sub');
    expect(vm.getState().callStack).toHaveLength(1);

    // 3. Tiến tiếp: Chạm SCENE_END của my_sub -> Tự động return về main, cảnh báo console
    const s3 = vm.runUntilInteractive();
    expect(asDialogue(s3.stepResult).text).toBe('Sau khi trở về main.');
    expect(vm.getState().currentScene).toBe('main');
    expect(vm.getState().callStack).toHaveLength(0);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Scene 'my_sub' reached end without an explicit 'return' statement"),
    );

    // 4. Lệnh end trong main -> HALTED
    const s4 = vm.runUntilInteractive();
    expect(s4.stepResult.type).toBe('HALTED');

    warnSpy.mockRestore();
  });

  it('should halt game and warn when end statement is executed inside an active call stack', () => {
    const script = `
scene main {
    "Đang ở main."
    call game_over_scene
    "Không bao giờ tới đây."
}

scene game_over_scene {
    "Trò chơi kết thúc bất thình lình."
    end
}
`;
    const res = compileString(script, 'test_end_in_call.vns');
    expect(res.success).toBe(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const vm = new VisualNovelVM(res.program!);

    vm.runUntilInteractive(); // "Đang ở main."
    const s2 = vm.runUntilInteractive(); // "Trò chơi kết thúc bất thình lình."
    expect(asDialogue(s2.stepResult).text).toBe('Trò chơi kết thúc bất thình lình.');

    // Chạy tiếp -> gặp 'end' khi callStack vẫn còn 1 frame
    const s3 = vm.runUntilInteractive();
    expect(s3.stepResult.type).toBe('HALTED');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Script executed 'end' while call stack is not empty"),
    );

    warnSpy.mockRestore();
  });

  it('should allow normal sequential scenes without call to pass SCENE_END without warning', () => {
    const script = `
scene scene_a {
    "Phần 1."
}

scene scene_b {
    "Phần 2."
}
`;
    const res = compileString(script, 'test_seq.vns');
    expect(res.success).toBe(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const vm = new VisualNovelVM(res.program!);
    const s1 = vm.runUntilInteractive();
    expect(asDialogue(s1.stepResult).text).toBe('Phần 1.');

    const s2 = vm.runUntilInteractive();
    expect(asDialogue(s2.stepResult).text).toBe('Phần 2.');

    const s3 = vm.runUntilInteractive();
    expect(s3.stepResult.type).toBe('HALTED');

    // Không có cảnh báo nào vì không có call stack bị bỏ quên
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should support choice with call, running subscene and returning to continuation in caller scene', () => {
    const script = `
scene start {
  choice {
    "Choice 1": call .c1
    "Choice 2": call .c2
  }

  scene .c1 {
    "c1"
    return
  }

  scene .c2 {
    "c2"
    return
  }

  "next"
  end
}
`;
    const res = compileString(script, 'test_choice_call.vns');
    expect(res.success).toBe(true);

    const vm = new VisualNovelVM(res.program!);
    const s1 = vm.runUntilInteractive();
    expect(s1.stepResult.type).toBe('SUSPEND_CHOICE');

    // Chọn Choice 1 (call .c1)
    vm.choose(0);
    const s2 = vm.runUntilInteractive();
    expect(asDialogue(s2.stepResult).text).toBe('c1');

    // Chạy tiếp -> return về continuation "next"
    const s3 = vm.runUntilInteractive();
    expect(asDialogue(s3.stepResult).text).toBe('next');

    // Chạy tiếp -> end
    const s4 = vm.runUntilInteractive();
    expect(s4.stepResult.type).toBe('HALTED');
  });
});
