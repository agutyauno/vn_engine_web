// Nút Continue bị vô hiệu (chưa có save) phải nhìn thấy được trên màn Title, nhưng vẫn khác rõ
// với nút đang dùng được. Đọc wireframe.css dạng text và tự phân giải var(--x, fallback).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/** Ngưỡng tương phản cho chữ của nút bị vô hiệu: đọc được nhưng vẫn trông "tắt". */
const MIN_DISABLED_CONTRAST = 3;
const MIN_DISABLED_OPACITY = 0.7;

const css = readFileSync(resolve(__dirname, '../src/wireframe.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Thân của mọi rule có `selector` trong danh sách selector (kể cả dạng gộp `a, b { }`). */
function ruleBodies(selector: string): string[] {
  const bodies: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? '').split(',').map(s => s.trim());
    if (selectors.includes(selector)) bodies.push(match[2] ?? '');
  }
  return bodies;
}

function declaredValue(bodies: string[], prop: RegExp): string | undefined {
  let value: string | undefined;
  for (const body of bodies) {
    for (const decl of body.split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      if (prop.test(decl.slice(0, idx).trim())) value = decl.slice(idx + 1).trim();
    }
  }
  return value;
}

const rootBodies = ruleBodies(':root');

/** Phân giải var(--name, fallback) theo :root; không có thì dùng fallback. */
function resolveVar(value: string): string {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!match) return value.trim();
  const defined = declaredValue(rootBodies, new RegExp(`^${match[1]}$`));
  if (defined !== undefined) return resolveVar(defined);
  if (match[2] === undefined) throw new Error(`Unresolved CSS variable ${match[1]}`);
  return resolveVar(match[2]);
}

function parseColor(value: string): [number, number, number] {
  const v = resolveVar(value).toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1] ?? '';
    const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`Unsupported color literal: "${value}"`);
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRgb(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Màu nhìn thấy khi phần tử có `opacity` nằm trên nền `background`. */
function blend(
  color: [number, number, number],
  background: [number, number, number],
  opacity: number,
): [number, number, number] {
  return color.map((c, i) => Math.round(c * opacity + (background[i] ?? 0) * (1 - opacity))) as [
    number,
    number,
    number,
  ];
}

describe('Disabled Continue button on the title screen', () => {
  const disabled = ruleBodies('.title-screen-btn:disabled');
  const boxBackground = declaredValue(ruleBodies('.title-screen-box'), /^background(-color)?$/);

  it('has a .title-screen-btn:disabled rule and a title box background', () => {
    expect(disabled.length).toBeGreaterThan(0);
    expect(boxBackground).toBeDefined();
  });

  it('is not faded out with a low opacity', () => {
    const opacity = declaredValue(disabled, /^opacity$/);
    if (opacity !== undefined) {
      expect(Number(opacity)).toBeGreaterThanOrEqual(MIN_DISABLED_OPACITY);
    }
  });

  it('keeps its label readable against the title box, opacity included', () => {
    const color = declaredValue(disabled, /^color$/);
    expect(color).toBeDefined();
    const opacity = Number(declaredValue(disabled, /^opacity$/) ?? '1');
    const background = parseColor(boxBackground ?? '');
    const visible = blend(parseColor(color ?? ''), background, opacity);
    expect(contrastRgb(visible, background)).toBeGreaterThanOrEqual(MIN_DISABLED_CONTRAST);
  });

  it('differs from the enabled button by border style, not only by color', () => {
    const border = declaredValue(disabled, /^border(-style)?$/) ?? '';
    expect(border).toMatch(/dashed|dotted/);
  });
});
