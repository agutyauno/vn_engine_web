// ============================================================================
// TASK-player-settings-modal, phase S1 (Contract & Storage)
// Spec: docs/tasks/TASK-player-settings-modal.md §3.1, §3.2 (storage), §3.4,
//       §2.4 risks 1-2, §7 items 1-2.
//
// Dùng Web Storage THẬT của jsdom (cài bởi tests/setup.ts). Không stub localStorage.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach, expectTypeOf } from 'vitest';
import { StorageAdapter } from '../src/adapters/StorageAdapter';
import {
  DEFAULT_PLAYER_SETTINGS,
  type DialogueFontSize,
  type KernelAdapters,
  type PlayerSettingsData,
} from '../src/core/contracts';

const P1_KEY = 'vn_engine_player_p1_settings';

const EXPECTED_DEFAULTS: PlayerSettingsData = {
  masterVolume: 1.0,
  musicVolume: 0.8,
  sfxVolume: 0.8,
  voiceVolume: 1.0,
  isMuted: false,
  textSpeed: 40,
  autoDelayMs: 1500,
  fontSize: 'medium',
  boxOpacity: 0.85,
  stageScaleMode: 'auto',
};

const EXPECTED_KEYS = [
  'autoDelayMs',
  'boxOpacity',
  'fontSize',
  'isMuted',
  'masterVolume',
  'musicVolume',
  'sfxVolume',
  'stageScaleMode',
  'textSpeed',
  'voiceVolume',
];

function storeRaw(value: unknown, key: string = P1_KEY): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function readStored(key: string = P1_KEY): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

function newAdapter(): StorageAdapter {
  return new StorageAdapter({ projectId: 'p1' });
}

/** Spy pass-through trên Storage.prototype.setItem, đếm số lần ghi vào một key. */
function spySettingsWrites(key: string = P1_KEY): () => number {
  const spy = vi.spyOn(Storage.prototype, 'setItem');
  return () => spy.mock.calls.filter(call => call[0] === key).length;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// §3.1 Contract
// ---------------------------------------------------------------------------
describe('[S1] PlayerSettingsData contract (§3.1)', () => {
  it('DEFAULT_PLAYER_SETTINGS matches spec values exactly', () => {
    expect(DEFAULT_PLAYER_SETTINGS).toStrictEqual(EXPECTED_DEFAULTS);
  });

  it('DEFAULT_PLAYER_SETTINGS has no legacy autoDelay key (§7.1 rename)', () => {
    expect(DEFAULT_PLAYER_SETTINGS).not.toHaveProperty('autoDelay');
    expect(Object.keys(DEFAULT_PLAYER_SETTINGS).sort()).toEqual(EXPECTED_KEYS);
  });

  it('DialogueFontSize is the union small | medium | large', () => {
    expectTypeOf<DialogueFontSize>().toEqualTypeOf<'small' | 'medium' | 'large'>();
    expectTypeOf<PlayerSettingsData['fontSize']>().toEqualTypeOf<DialogueFontSize>();
    expectTypeOf<PlayerSettingsData['autoDelayMs']>().toEqualTypeOf<number>();
    expectTypeOf<PlayerSettingsData['isMuted']>().toEqualTypeOf<boolean>();
    expectTypeOf<PlayerSettingsData['boxOpacity']>().toEqualTypeOf<number>();
  });
});

// ---------------------------------------------------------------------------
// §3.2 KernelAdapters.storage (type level, §7.2)
// ---------------------------------------------------------------------------
describe('[S1] KernelAdapters.storage settings contract (§3.2, §7.2)', () => {
  type StorageContract = NonNullable<KernelAdapters['storage']>;

  it('declares optional getSettings/saveSettings with the spec signatures', () => {
    expectTypeOf<NonNullable<StorageContract['getSettings']>>().toEqualTypeOf<
      () => PlayerSettingsData
    >();
    expectTypeOf<NonNullable<StorageContract['saveSettings']>>().toEqualTypeOf<
      (settings: Partial<PlayerSettingsData>) => void
    >();
  });

  it('StorageAdapter is assignable to KernelAdapters.storage and exposes settings methods', () => {
    const storage: StorageContract = new StorageAdapter({ projectId: 'p1' });
    expect(typeof storage.getSettings).toBe('function');
    expect(typeof storage.saveSettings).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// §3.4 getSettings
// ---------------------------------------------------------------------------
describe('[S1] StorageAdapter.getSettings (§3.4)', () => {
  it('returns defaults when storage is empty', () => {
    expect(newAdapter().getSettings()).toStrictEqual(EXPECTED_DEFAULTS);
  });

  it('returns a copy: mutating the result does not mutate DEFAULT_PLAYER_SETTINGS', () => {
    const adapter = newAdapter();
    const result = adapter.getSettings();
    expect(result).not.toBe(DEFAULT_PLAYER_SETTINGS);
    result.textSpeed = 99;
    result.fontSize = 'large';
    expect(DEFAULT_PLAYER_SETTINGS.textSpeed).toBe(40);
    expect(DEFAULT_PLAYER_SETTINGS.fontSize).toBe('medium');
    expect(adapter.getSettings()).toStrictEqual(EXPECTED_DEFAULTS);
  });

  it('reads valid stored settings from vn_engine_player_${projectId}_settings', () => {
    const stored: PlayerSettingsData = {
      masterVolume: 0.5,
      musicVolume: 0.3,
      sfxVolume: 0.2,
      voiceVolume: 0.9,
      isMuted: true,
      textSpeed: 75,
      autoDelayMs: 3000,
      fontSize: 'large',
      boxOpacity: 0.7,
      stageScaleMode: 'native',
    };
    storeRaw(stored);
    expect(newAdapter().getSettings()).toStrictEqual(stored);
  });

  it('fills missing fields of a partial stored object with defaults', () => {
    storeRaw({ textSpeed: 70 });
    expect(newAdapter().getSettings()).toStrictEqual({ ...EXPECTED_DEFAULTS, textSpeed: 70 });
  });

  describe('key partitioning (same prefix scheme as existing keys, ADR-024)', () => {
    it.each([
      [{ projectId: 'p1', isPreview: false }, 'vn_engine_player_p1_settings'],
      [{ projectId: 'p1', isPreview: true }, 'vn_engine_preview_p1_settings'],
      [{ isPreview: false }, 'vn_engine_player_settings'],
      [{ isPreview: true }, 'vn_engine_preview_settings'],
    ])('options %j use key %s', (options, key) => {
      storeRaw({ textSpeed: 77 }, key);
      expect(new StorageAdapter(options).getSettings().textSpeed).toBe(77);
    });

    it('flushes to the partitioned key', () => {
      const adapter = new StorageAdapter({ projectId: 'p1', isPreview: true });
      adapter.saveSettings({ textSpeed: 55 });
      adapter.flushSettings();
      expect(localStorage.getItem('vn_engine_preview_p1_settings')).not.toBeNull();
      expect(localStorage.getItem('vn_engine_player_p1_settings')).toBeNull();
    });

    it('does not leak settings across projects or between preview and player', () => {
      storeRaw({ textSpeed: 77 }, 'vn_engine_player_p1_settings');
      expect(new StorageAdapter({ projectId: 'p2' }).getSettings().textSpeed).toBe(40);
      expect(new StorageAdapter({ projectId: 'p1', isPreview: true }).getSettings().textSpeed).toBe(
        40,
      );
    });
  });

  describe('corrupt payloads fall back to defaults (§2.4 risk 2)', () => {
    it.each([
      ['corrupt JSON', '{not json'],
      ['JSON null', 'null'],
      ['number', '42'],
      ['string', '"hello"'],
      ['boolean', 'true'],
      ['array', '[1,2,3]'],
      ['array of objects', '[{"textSpeed":70}]'],
      ['NaN literal (invalid JSON)', '{"masterVolume": NaN}'],
    ])('%s -> defaults', (_label, raw) => {
      localStorage.setItem(P1_KEY, raw);
      expect(newAdapter().getSettings()).toStrictEqual(EXPECTED_DEFAULTS);
    });
  });

  describe('numeric clamping and fallback', () => {
    const numericFields: Array<{
      field:
        | 'masterVolume'
        | 'musicVolume'
        | 'sfxVolume'
        | 'voiceVolume'
        | 'textSpeed'
        | 'autoDelayMs'
        | 'boxOpacity';
      min: number;
      max: number;
    }> = [
      { field: 'masterVolume', min: 0, max: 1 },
      { field: 'musicVolume', min: 0, max: 1 },
      { field: 'sfxVolume', min: 0, max: 1 },
      { field: 'voiceVolume', min: 0, max: 1 },
      { field: 'textSpeed', min: 1, max: 100 },
      { field: 'autoDelayMs', min: 500, max: 5000 },
      { field: 'boxOpacity', min: 0.6, max: 1.0 },
    ];

    for (const { field, min, max } of numericFields) {
      describe(field, () => {
        it('null (serialized NaN) -> default', () => {
          storeRaw({ [field]: NaN });
          expect(newAdapter().getSettings()[field]).toBe(EXPECTED_DEFAULTS[field]);
        });

        it('numeric string -> default (no coercion)', () => {
          storeRaw({ [field]: String(min) });
          expect(newAdapter().getSettings()[field]).toBe(EXPECTED_DEFAULTS[field]);
        });

        it('object / boolean -> default', () => {
          storeRaw({ [field]: { valueOf: 1 } });
          expect(newAdapter().getSettings()[field]).toBe(EXPECTED_DEFAULTS[field]);
          storeRaw({ [field]: true });
          expect(newAdapter().getSettings()[field]).toBe(EXPECTED_DEFAULTS[field]);
        });

        it(`below min clamps to ${min}`, () => {
          storeRaw({ [field]: min - 1 });
          expect(newAdapter().getSettings()[field]).toBe(min);
          storeRaw({ [field]: -999999 });
          expect(newAdapter().getSettings()[field]).toBe(min);
        });

        it(`above max clamps to ${max}`, () => {
          storeRaw({ [field]: max + 1 });
          expect(newAdapter().getSettings()[field]).toBe(max);
          storeRaw({ [field]: 1e9 });
          expect(newAdapter().getSettings()[field]).toBe(max);
        });

        it('boundary values are kept', () => {
          storeRaw({ [field]: min });
          expect(newAdapter().getSettings()[field]).toBe(min);
          storeRaw({ [field]: max });
          expect(newAdapter().getSettings()[field]).toBe(max);
        });
      });
    }
  });

  describe('enum and boolean fields', () => {
    it.each(['small', 'medium', 'large'] as const)('fontSize %s is kept', size => {
      storeRaw({ fontSize: size });
      expect(newAdapter().getSettings().fontSize).toBe(size);
    });

    it.each([['huge'], ['LARGE'], [''], [16], [null], [{}]])(
      'invalid fontSize %j -> medium',
      value => {
        storeRaw({ fontSize: value });
        expect(newAdapter().getSettings().fontSize).toBe('medium');
      },
    );

    it('isMuted boolean values are kept', () => {
      storeRaw({ isMuted: true });
      expect(newAdapter().getSettings().isMuted).toBe(true);
      storeRaw({ isMuted: false });
      expect(newAdapter().getSettings().isMuted).toBe(false);
    });

    it.each([['true'], [1], [0], [null], [{}]])(
      'non-boolean isMuted %j -> default false',
      value => {
        storeRaw({ isMuted: value });
        expect(newAdapter().getSettings().isMuted).toBe(false);
      },
    );

    it('stageScaleMode native is kept', () => {
      storeRaw({ stageScaleMode: 'native' });
      expect(newAdapter().getSettings().stageScaleMode).toBe('native');
    });

    it.each([['auto'], ['NATIVE'], ['stretch'], [1], [null]])(
      'stageScaleMode %j -> auto',
      value => {
        storeRaw({ stageScaleMode: value });
        expect(newAdapter().getSettings().stageScaleMode).toBe('auto');
      },
    );
  });

  describe('legacy autoDelay key (§7.1)', () => {
    it('reads legacy autoDelay when autoDelayMs is absent', () => {
      storeRaw({ autoDelay: 2000 });
      const result = newAdapter().getSettings();
      expect(result.autoDelayMs).toBe(2000);
      expect(result).not.toHaveProperty('autoDelay');
    });

    it('autoDelayMs wins when both keys are present', () => {
      storeRaw({ autoDelay: 2000, autoDelayMs: 3500 });
      expect(newAdapter().getSettings().autoDelayMs).toBe(3500);
    });

    it('legacy autoDelay is clamped to 500..5000', () => {
      storeRaw({ autoDelay: 100 });
      expect(newAdapter().getSettings().autoDelayMs).toBe(500);
      storeRaw({ autoDelay: 99999 });
      expect(newAdapter().getSettings().autoDelayMs).toBe(5000);
    });
  });

  describe('prototype pollution and unknown keys (§2.4 risk 2)', () => {
    it('__proto__ payload does not pollute Object.prototype and result has only known keys', () => {
      localStorage.setItem(
        P1_KEY,
        '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted2": true}}, "textSpeed": 60, "extra": "x"}',
      );
      const result = newAdapter().getSettings();

      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted2')).toBe(false);
      expect('polluted' in {}).toBe(false);
      expect(Object.keys(result).sort()).toEqual(EXPECTED_KEYS);
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result, 'polluted')).toBe(false);
      expect('polluted' in result).toBe(false);
      expect(result.textSpeed).toBe(60);
    });

    it('flushing after reading a polluted payload writes only known keys', () => {
      localStorage.setItem(P1_KEY, '{"__proto__": {"polluted": true}, "extra": 1}');
      const adapter = newAdapter();
      adapter.saveSettings({ textSpeed: 61 });
      adapter.flushSettings();

      const stored = readStored();
      expect(stored).not.toBeNull();
      expect(Object.keys(stored ?? {}).sort()).toEqual(EXPECTED_KEYS);
      expect('polluted' in {}).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// §3.4 saveSettings / flushSettings (§2.4 risk 1: 200ms debounce)
// ---------------------------------------------------------------------------
describe('[S1] StorageAdapter.saveSettings debounce (§3.4, §2.4 risk 1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not write before 200ms and writes merged settings at 200ms', () => {
    const writes = spySettingsWrites();
    const adapter = newAdapter();

    adapter.saveSettings({ textSpeed: 70 });
    vi.advanceTimersByTime(199);
    expect(localStorage.getItem(P1_KEY)).toBeNull();
    expect(writes()).toBe(0);

    vi.advanceTimersByTime(1);
    expect(writes()).toBe(1);
    expect(readStored()).toStrictEqual({ ...EXPECTED_DEFAULTS, textSpeed: 70 });
  });

  it('merges the partial with current stored settings', () => {
    storeRaw({ ...EXPECTED_DEFAULTS, musicVolume: 0.4, fontSize: 'small' });
    const adapter = newAdapter();

    adapter.saveSettings({ textSpeed: 90 });
    vi.advanceTimersByTime(200);

    expect(readStored()).toStrictEqual({
      ...EXPECTED_DEFAULTS,
      musicVolume: 0.4,
      fontSize: 'small',
      textSpeed: 90,
    });
  });

  it('repeated calls within the window reset the timer and produce one merged write', () => {
    const writes = spySettingsWrites();
    const adapter = newAdapter();

    adapter.saveSettings({ masterVolume: 0.1 });
    vi.advanceTimersByTime(150);
    adapter.saveSettings({ masterVolume: 0.2, isMuted: true });
    vi.advanceTimersByTime(150);
    adapter.saveSettings({ boxOpacity: 0.7 });
    vi.advanceTimersByTime(150);
    expect(writes()).toBe(0);

    vi.advanceTimersByTime(50);
    expect(writes()).toBe(1);
    expect(readStored()).toStrictEqual({
      ...EXPECTED_DEFAULTS,
      masterVolume: 0.2,
      isMuted: true,
      boxOpacity: 0.7,
    });

    vi.advanceTimersByTime(1000);
    expect(writes()).toBe(1);
  });

  it('getSettings during a pending debounce returns the pending merged values', () => {
    const adapter = newAdapter();
    adapter.saveSettings({ textSpeed: 70 });
    adapter.saveSettings({ fontSize: 'large' });

    const pending = adapter.getSettings();
    expect(pending).toStrictEqual({ ...EXPECTED_DEFAULTS, textSpeed: 70, fontSize: 'large' });
    expect(localStorage.getItem(P1_KEY)).toBeNull();

    // Trả về bản sao: sửa kết quả không làm đổi giá trị đang chờ ghi.
    pending.textSpeed = 1;
    expect(adapter.getSettings().textSpeed).toBe(70);
  });

  it('a later save after a completed write starts a new debounce window', () => {
    const writes = spySettingsWrites();
    const adapter = newAdapter();

    adapter.saveSettings({ textSpeed: 10 });
    vi.advanceTimersByTime(200);
    adapter.saveSettings({ textSpeed: 20 });
    vi.advanceTimersByTime(199);
    expect(writes()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(writes()).toBe(2);
    expect(readStored()).toStrictEqual({ ...EXPECTED_DEFAULTS, textSpeed: 20 });
  });
});

describe('[S1] StorageAdapter.flushSettings (§3.4, §7.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('writes pending settings immediately', () => {
    const writes = spySettingsWrites();
    const adapter = newAdapter();

    adapter.saveSettings({ voiceVolume: 0.3 });
    adapter.flushSettings();

    expect(writes()).toBe(1);
    expect(readStored()).toStrictEqual({ ...EXPECTED_DEFAULTS, voiceVolume: 0.3 });
  });

  it('clears the debounce timer: advancing time afterwards causes no extra write', () => {
    const writes = spySettingsWrites();
    const adapter = newAdapter();

    adapter.saveSettings({ voiceVolume: 0.3 });
    adapter.flushSettings();
    vi.advanceTimersByTime(1000);

    expect(writes()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is a no-op when nothing is pending', () => {
    const writes = spySettingsWrites();
    const adapter = newAdapter();

    adapter.flushSettings();
    expect(writes()).toBe(0);
    expect(localStorage.getItem(P1_KEY)).toBeNull();

    adapter.saveSettings({ textSpeed: 33 });
    adapter.flushSettings();
    adapter.flushSettings();
    expect(writes()).toBe(1);
  });

  it('after flush, getSettings reads the persisted values', () => {
    const adapter = newAdapter();
    adapter.saveSettings({ textSpeed: 33, fontSize: 'small' });
    adapter.flushSettings();
    expect(adapter.getSettings()).toStrictEqual({
      ...EXPECTED_DEFAULTS,
      textSpeed: 33,
      fontSize: 'small',
    });
  });

  it('swallows StorageQuotaError on settings write (settings are non-critical)', () => {
    const adapter = newAdapter();
    // Đảm bảo phương thức tồn tại, để test không pass nhờ TypeError bị nuốt.
    expect(typeof adapter.flushSettings).toBe('function');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    adapter.saveSettings({ textSpeed: 80 });
    expect(() => adapter.flushSettings()).not.toThrow();
  });

  it('swallows StorageQuotaError when the debounce timer fires', () => {
    const adapter = newAdapter();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    adapter.saveSettings({ textSpeed: 80 });
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });
});

describe('[S1] settings persistence round trip', () => {
  it('a fresh StorageAdapter with the same options reads flushed settings', () => {
    const first = new StorageAdapter({ projectId: 'p1', isPreview: true });
    first.saveSettings({
      masterVolume: 0.25,
      isMuted: true,
      autoDelayMs: 4000,
      fontSize: 'large',
      boxOpacity: 0.6,
    });
    first.flushSettings();

    const second = new StorageAdapter({ projectId: 'p1', isPreview: true });
    expect(second.getSettings()).toStrictEqual({
      ...EXPECTED_DEFAULTS,
      masterVolume: 0.25,
      isMuted: true,
      autoDelayMs: 4000,
      fontSize: 'large',
      boxOpacity: 0.6,
    });
  });

  it('a fresh StorageAdapter reads settings written by the debounce timer', () => {
    vi.useFakeTimers();
    const first = newAdapter();
    first.saveSettings({ textSpeed: 12 });
    vi.advanceTimersByTime(200);

    expect(newAdapter().getSettings()).toStrictEqual({ ...EXPECTED_DEFAULTS, textSpeed: 12 });
  });
});
