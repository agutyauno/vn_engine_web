import { describe, it, expect } from 'vitest';
import { resolveCharacterCoordinates } from '../src/types';
import { GameRenderer } from '../src/renderer';

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
});
