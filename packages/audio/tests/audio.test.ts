import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioManager } from '../src/manager';
import type { PlayInstruction } from '@vn-engine/shared-types';

// Mock howler so unit tests run cleanly in Node environment without Web Audio API
vi.mock('howler', () => {
  class MockHowl {
    private _volume = 1;
    private _loop = false;
    public options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this._volume = (options['volume'] as number) ?? 1;
      this._loop = (options['loop'] as boolean) ?? false;
    }

    play() {
      return 1;
    }

    stop() {
      return this;
    }

    pause() {
      return this;
    }

    fade(_from: number, to: number, _duration: number) {
      this._volume = to;
      return this;
    }

    volume(val?: number) {
      if (val !== undefined) {
        this._volume = val;
        return this;
      }
      return this._volume;
    }

    loop(val?: boolean) {
      if (val !== undefined) {
        this._loop = val;
        return this;
      }
      return this._loop;
    }

    unload() {
      return this;
    }

    on(_event: string, _fn: (...args: unknown[]) => void) {
      return this;
    }
  }

  const MockHowler = {
    volume: vi.fn(),
    mute: vi.fn(),
    ctx: { state: 'running', resume: vi.fn() },
  };

  return {
    Howl: MockHowl,
    Howler: MockHowler,
  };
});

describe('@vn-engine/audio - AudioManager (Open Channel Registry)', () => {
  let audio: AudioManager;

  beforeEach(() => {
    vi.clearAllMocks();
    audio = new AudioManager();
  });

  it('nên khởi tạo và hỗ trợ đăng ký kênh mở động (Open Channel Registry - ADR-017)', () => {
    // Kênh mặc định
    audio.play('music', 'bgm_peaceful', 'https://example.com/bgm.mp3', { volume: 0.8 });
    audio.play('sound', 'sfx_bell', 'https://example.com/bell.wav');

    // Kênh tự do người dùng đặt
    audio.play('voice', 'alice_line1', 'https://example.com/voice.ogg');
    audio.play('ambience_rain', 'rain_loop', 'https://example.com/rain.mp3', { loop: true });

    const states = audio.getChannelsState();
    expect(states).toHaveLength(4);

    const musicState = states.find(s => s.name === 'music');
    expect(musicState).toBeDefined();
    expect(musicState?.currentAssetId).toBe('bgm_peaceful');
    expect(musicState?.isPlaying).toBe(true);
    expect(musicState?.loop).toBe(true); // default loop của preset music

    const soundState = states.find(s => s.name === 'sound');
    expect(soundState?.loop).toBe(false); // default loop của preset sound

    const customState = states.find(s => s.name === 'ambience_rain');
    expect(customState?.currentAssetId).toBe('rain_loop');
    expect(customState?.loop).toBe(true);
  });

  it('nên điều chỉnh âm lượng riêng biệt cho từng kênh và master volume', () => {
    audio.setMasterVolume(0.75);
    expect(audio.getMasterVolume()).toBe(0.75);

    // Kẹp trong khoảng [0, 1]
    audio.setMasterVolume(1.5);
    expect(audio.getMasterVolume()).toBe(1.0);
    audio.setMasterVolume(-0.5);
    expect(audio.getMasterVolume()).toBe(0.0);

    audio.setChannelVolume('music', 0.6);
    expect(audio.getChannelVolume('music')).toBe(0.6);

    audio.setChannelVolume('sound', 0.3);
    expect(audio.getChannelVolume('sound')).toBe(0.3);
  });

  it('nên hỗ trợ mute và unmute toàn bộ hệ thống âm thanh', () => {
    expect(audio.isMuted()).toBe(false);
    audio.mute();
    expect(audio.isMuted()).toBe(true);
    audio.unmute();
    expect(audio.isMuted()).toBe(false);
  });

  it('nên đồng bộ hóa chính xác State Catch-up khi Rollback hoặc Load game', () => {
    // Giả sử đang phát BGM 1 và SFX
    audio.play('music', 'bgm_intro', 'https://example.com/intro.mp3');
    audio.play('sound', 'sfx_explosion', 'https://example.com/boom.wav');

    // Điểm rollback có trạng thái BGM 2 và không còn SFX
    const catchUpMap = new Map<string, PlayInstruction>([
      [
        'music',
        {
          type: 'PLAY',
          channel: 'music',
          assetId: 'bgm_battle',
          volume: 0.9,
          loop: true,
        },
      ],
      [
        'ambience',
        {
          type: 'PLAY',
          channel: 'ambience',
          assetId: 'ambience_wind',
          volume: 0.5,
          loop: true,
        },
      ],
    ]);

    const assetResolver = (assetId: string) => `https://example.com/${assetId}.mp3`;

    audio.syncStateCatchUp(catchUpMap, assetResolver);

    const states = audio.getChannelsState();
    const musicState = states.find(s => s.name === 'music');
    expect(musicState?.currentAssetId).toBe('bgm_battle');
    expect(musicState?.isPlaying).toBe(true);

    const ambienceState = states.find(s => s.name === 'ambience');
    expect(ambienceState?.currentAssetId).toBe('ambience_wind');
    expect(ambienceState?.isPlaying).toBe(true);

    const soundState = states.find(s => s.name === 'sound');
    expect(soundState?.isPlaying).toBe(false); // SFX cũ đã dừng
  });
});
