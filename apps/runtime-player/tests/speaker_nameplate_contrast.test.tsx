import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { SpeakerNameplate } from '../src/ui/components/SpeakerNameplate';

/** The kernel's fallback speaker color (see kernel_character_colors.test.ts). */
const KERNEL_DEFAULT_SPEAKER_COLOR = '#ffffff';
/** WCAG AA contrast for normal text. */
const MIN_CONTRAST = 4.5;

const css = readFileSync(resolve(__dirname, '../src/wireframe.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Bodies of every rule whose whole selector is exactly `selector`. */
function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return Array.from(css.matchAll(re), m => m[1] ?? '');
}

/** Last value declared for `prop` (e.g. `background`, `color`) across the rule bodies. */
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

function parseColor(value: string): [number, number, number] {
  const v = value.trim().toLowerCase();
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`Unsupported color literal in .speaker-nameplate: "${value}"`);
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(parseColor(a));
  const lb = luminance(parseColor(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('SpeakerNameplate readability with the default speaker color', () => {
  afterEach(() => {
    cleanup();
  });

  const bodies = ruleBodies('.speaker-nameplate');
  const background = declaredValue(bodies, /^background(-color)?$/);
  const textColor = declaredValue(bodies, /^color$/);

  it('defines a .speaker-nameplate rule with a background and a text color', () => {
    expect(bodies.length).toBeGreaterThan(0);
    expect(background).toBeDefined();
    expect(textColor).toBeDefined();
  });

  it('keeps the kernel default color (#ffffff) readable on the nameplate background', () => {
    expect(contrast(KERNEL_DEFAULT_SPEAKER_COLOR, background!)).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
  });

  it('keeps the CSS default text color readable when no speaker color is given', () => {
    expect(contrast(textColor!, background!)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('still applies a custom speaker color inline', () => {
    const { container } = render(
      <SpeakerNameplate speakerName="Alice" speakerColorHex="#38bdf8" />,
    );
    const nameplate = container.querySelector<HTMLElement>('#speaker-nameplate');
    expect(nameplate).not.toBeNull();
    expect(nameplate!.style.color).toBe('rgb(56, 189, 248)');
    expect(nameplate!.style.borderColor).toBe('rgb(56, 189, 248)');
  });

  it('applies the kernel default color inline for a speaker without a custom color', () => {
    const { container } = render(
      <SpeakerNameplate speakerName="Bob" speakerColorHex={KERNEL_DEFAULT_SPEAKER_COLOR} />,
    );
    const nameplate = container.querySelector<HTMLElement>('#speaker-nameplate');
    expect(nameplate?.textContent).toBe('Bob');
    expect(nameplate!.style.color).toBe('rgb(255, 255, 255)');
  });
});
