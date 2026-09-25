import { describe, it, expect } from 'vitest';
import { compileString } from '../src/compiler';

describe('Interpolation Semantic Validation (interpolation_semantic.test.ts)', () => {
  it('báo lỗi compile khi tham chiếu biến chưa từng define trong lời thoại', () => {
    const dsl = `
      scene main {
        alice: "Xin chào {undeclared_hero}!"
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]?.message).toContain(
      "Variable 'undeclared_hero' in string interpolation",
    );
  });

  it('hợp lệ khi dùng biến Global đã define ở top-level', () => {
    const dsl = `
      define hero_name = "Arthur"

      scene main {
        alice: "Xin chào {hero_name}!"
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(true);
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('hợp lệ khi dùng biến Local đã define trong scene', () => {
    const dsl = `
      scene main {
        define local_score = 100
        alice: "Điểm của bạn là {local_score}!"
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(true);
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('bỏ qua và không báo lỗi các thẻ nhịp điệu Typewriter ({pause:...}, {speed:...}, {color:...})', () => {
    const dsl = `
      define target = "Boss"

      scene main {
        alice: "{speed:slow}Khoan đã... {pause:0.8s}Mục tiêu là {color:#ef4444}{target}{/color}!{speed:normal}"
        doctor: "Hi {pause: 1s} Amiya {speed: fast}here{ /color }"
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(true);
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('bỏ qua và không báo lỗi ký hiệu ngoặc nhọn escape \\{ và \\}', () => {
    const dsl = `
      scene main {
        alice: "Tập hợp \\{1, 2, 3\\} không chứa biến."
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(true);
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('hỗ trợ filter và fallback mà không báo lỗi nếu biến đã define', () => {
    const dsl = `
      define gold = 1000

      scene main {
        alice: "Bạn có {gold:comma} vàng hoặc {gold ?? 'không có'}."
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(true);
    expect(result.errors?.length ?? 0).toBe(0);
  });

  it('kiểm tra và báo lỗi biến chưa define trong Choice và Reveal', () => {
    const dsl = `
      scene main {
        reveal alice as "{unknown_title} Alice"
        choice {
          "Mua vé ({unknown_cost} vàng)": goto end_scene
        }
      }

      scene end_scene {
        narrator: "Hết"
      }
    `;
    const result = compileString(dsl);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.message.includes("'unknown_title'"))).toBe(true);
    expect(result.errors!.some(e => e.message.includes("'unknown_cost'"))).toBe(true);
  });
});
