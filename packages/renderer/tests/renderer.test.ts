import { describe, it, expect } from 'vitest';
import {
  resolveCharacterCoordinates,
  resolveCharacterPlacement,
  EASING_FUNCTIONS,
} from '../src/types';
import { GameRenderer, computeTargetScale, computeTargetRotation } from '../src/renderer';

describe('@vn-engine/renderer - Coordinate Resolution & GameRenderer Setup', () => {
  it('nên phân giải chính xác các vị trí định danh (Named Positions: left, center, right)', () => {
    const baseW = 1280;
    const baseH = 720;

    const left = resolveCharacterCoordinates('left', baseW, baseH);
    expect(left.x).toBeCloseTo(baseW * 0.22);
    expect(left.y).toBe(baseH);

    const center = resolveCharacterCoordinates('center', baseW, baseH);
    expect(center.x).toBeCloseTo(baseW * 0.5);
    expect(center.y).toBe(baseH);

    const right = resolveCharacterCoordinates('right', baseW, baseH);
    expect(right.x).toBeCloseTo(baseW * 0.78);
    expect(right.y).toBe(baseH);

    const fallback = resolveCharacterCoordinates(undefined, baseW, baseH);
    expect(fallback.x).toBeCloseTo(baseW * 0.5);
    expect(fallback.y).toBe(baseH);
  });

  it('nên hỗ trợ tọa độ số cụ thể { x, y } (ADR-018)', () => {
    const baseW = 1280;
    const baseH = 720;

    const custom = resolveCharacterCoordinates({ x: 350, y: 600 }, baseW, baseH);
    expect(custom.x).toBe(350);
    expect(custom.y).toBe(600);

    const defaultY = resolveCharacterCoordinates({ x: 400 }, baseW, baseH);
    expect(defaultY.x).toBe(400);
    expect(defaultY.y).toBe(baseH);
  });

  it('nên khởi tạo GameRenderer với kích thước cơ sở 1280x720 chuẩn 16:9', () => {
    const renderer = new GameRenderer({ width: 1280, height: 720 });
    expect(renderer.baseWidth).toBe(1280);
    expect(renderer.baseHeight).toBe(720);
    expect(renderer.app).toBeDefined();
  });

  it('nên phân giải chính xác tọa độ tỉ lệ và pixel offset trong resolveCharacterPlacement', () => {
    const baseW = 1280;
    const baseH = 720;

    // Tọa độ tỉ lệ 0.0 - 1.0
    const ratioPos = resolveCharacterPlacement({ x: 0.3, y: 0.8 }, baseW, baseH);
    expect(ratioPos.x).toBeCloseTo(1280 * 0.3);
    expect(ratioPos.y).toBeCloseTo(720 * 0.8);

    // Kèm offset pixel
    const withOffset = resolveCharacterPlacement(
      { position: 'center', offsetX: 25, offsetY: -50 },
      baseW,
      baseH,
    );
    expect(withOffset.x).toBeCloseTo(baseW * 0.5 + 25);
    expect(withOffset.y).toBe(baseH - 50);
  });

  it('nên tính toán chính xác scale và lật gương flipX/flipY trong computeTargetScale', () => {
    // Mặc định 1.0
    expect(computeTargetScale(undefined, undefined, undefined, undefined, undefined)).toEqual({
      scaleX: 1,
      scaleY: 1,
    });

    // Đồng đều scale: 1.5
    expect(computeTargetScale(1.5, undefined, undefined, undefined, undefined)).toEqual({
      scaleX: 1.5,
      scaleY: 1.5,
    });

    // scaleX/scaleY riêng lẻ
    expect(computeTargetScale(undefined, 1.2, 0.8, undefined, undefined)).toEqual({
      scaleX: 1.2,
      scaleY: 0.8,
    });

    // Lật gương flipX
    expect(computeTargetScale(1.5, undefined, undefined, true, false)).toEqual({
      scaleX: -1.5,
      scaleY: 1.5,
    });

    // Lật gương cả flipX và flipY
    expect(computeTargetScale(2, undefined, undefined, true, true)).toEqual({
      scaleX: -2,
      scaleY: -2,
    });
  });

  it('nên đổi góc xoay độ sang radian chính xác trong computeTargetRotation', () => {
    expect(computeTargetRotation(0)).toBe(0);
    expect(computeTargetRotation(90)).toBeCloseTo(Math.PI / 2);
    expect(computeTargetRotation(180)).toBeCloseTo(Math.PI);
    expect(computeTargetRotation(-45)).toBeCloseTo(-Math.PI / 4);
  });

  it('nên tính toán đúng giá trị biên cho các hàm easing (linear, ease_out, bounce, elastic)', () => {
    // Giá trị tại t = 0 và t = 1
    expect(EASING_FUNCTIONS.linear!(0)).toBe(0);
    expect(EASING_FUNCTIONS.linear!(1)).toBe(1);

    expect(EASING_FUNCTIONS.ease_out!(0)).toBe(0);
    expect(EASING_FUNCTIONS.ease_out!(1)).toBe(1);

    expect(EASING_FUNCTIONS.bounce!(0)).toBe(0);
    expect(EASING_FUNCTIONS.bounce!(1)).toBe(1);

    expect(EASING_FUNCTIONS.elastic!(0)).toBe(0);
    expect(EASING_FUNCTIONS.elastic!(1)).toBe(1);
  });
});
