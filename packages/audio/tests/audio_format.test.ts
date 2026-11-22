import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioManager } from '../src/manager';
import type { AudioPlayOptions } from '../src/types';

interface MockHowlOptions {
  src?: string[];
  html5?: boolean;
  loop?: boolean;
  volume?: number;
  format?: string[];
  [key: string]: unknown;
}

const mockHowlInstances: Array<{ options: MockHowlOptions }> = [];

// Mock howler để test chạy độc lập trong môi trường Node và bắt trọn options truyền vào constructor
vi.mock('howler', () => {
  class MockHowl {
    private _volume = 1;
    private _loop = false;
    public options: MockHowlOptions;

    constructor(options: MockHowlOptions) {
      this.options = options;
      this._volume = options.volume ?? 1;
      this._loop = options.loop ?? false;
      mockHowlInstances.push(this);
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

    once(_event: string, _fn: (...args: unknown[]) => void) {
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

describe('@vn-engine/audio - Audio Format Resolution (TASK-audio-format-resolution)', () => {
  let audio: AudioManager;

  beforeEach(() => {
    mockHowlInstances.length = 0;
    vi.clearAllMocks();
    audio = new AudioManager();
  });

  it('TC-FMT-01: Truyền options.format tường minh dạng string đơn lẻ', () => {
    const options: AudioPlayOptions = {
      format: 'mp3',
    };

    audio.play('sound', 'sfx_explosion', 'blob:http://localhost:3000/123-abc-456', options);

    expect(mockHowlInstances).toHaveLength(1);
    expect(mockHowlInstances[0].options.format).toEqual(['mp3']);
  });

  it('TC-FMT-02: Truyền options.format tường minh dạng array nhiều định dạng', () => {
    const options: AudioPlayOptions = {
      format: ['ogg', 'mp3'],
    };

    audio.play('music', 'bgm_track', 'blob:http://localhost:3000/456-def-789', options);

    expect(mockHowlInstances).toHaveLength(1);
    expect(mockHowlInstances[0].options.format).toEqual(['ogg', 'mp3']);
  });

  it('TC-FMT-03: URL blob không có đuôi và assetId không có đuôi file (Fallback format)', () => {
    audio.play('sound', 'sfx_laser', 'blob:http://localhost:3000/789-ghi-012');

    expect(mockHowlInstances).toHaveLength(1);
    expect(mockHowlInstances[0].options.format).toEqual(['mp3', 'wav', 'ogg', 'webm', 'aac']);
  });

  it('TC-FMT-04: URL blob nhưng assetId có phần mở rộng file (VD: sfx_laser.wav)', () => {
    audio.play('sound', 'sfx_laser.wav', 'blob:http://localhost:3000/abc-123-xyz');

    expect(mockHowlInstances).toHaveLength(1);
    expect(mockHowlInstances[0].options.format).toEqual(['wav']);

    // Mở rộng: Đuôi file viết hoa .OGG -> phải chuẩn hóa về chữ thường .ogg
    mockHowlInstances.length = 0;
    audio.play('voice', 'voice_greeting.OGG', 'blob:http://localhost:3000/voice-abc');

    expect(mockHowlInstances).toHaveLength(1);
    expect(mockHowlInstances[0].options.format).toEqual(['ogg']);
  });

  it('TC-FMT-05: Phát intro kèm loop trên URL blob (Chaining intro + loop)', () => {
    // Kịch bản 1: introAssetId và assetId có đuôi file
    audio.play('music', 'bgm_battle.mp3', 'blob:http://localhost:3000/loop-blob', {
      introAssetId: 'bgm_intro.ogg',
      introUrl: 'blob:http://localhost:3000/intro-blob',
    });

    expect(mockHowlInstances).toHaveLength(2);
    expect(mockHowlInstances[0].options.format).toEqual(['ogg']);
    expect(mockHowlInstances[1].options.format).toEqual(['mp3']);

    // Kịch bản 2: Cả intro và loop không có đuôi file -> đều fallback
    mockHowlInstances.length = 0;
    audio.play('music', 'bgm_battle', 'blob:http://localhost:3000/loop-blob-2', {
      introAssetId: 'bgm_intro',
      introUrl: 'blob:http://localhost:3000/intro-blob-2',
    });

    expect(mockHowlInstances).toHaveLength(2);
    expect(mockHowlInstances[0].options.format).toEqual(['mp3', 'wav', 'ogg', 'webm', 'aac']);
    expect(mockHowlInstances[1].options.format).toEqual(['mp3', 'wav', 'ogg', 'webm', 'aac']);
  });

  it('TC-FMT-06: URL HTTP bình thường có đuôi file rõ ràng và không truyền format', () => {
    audio.play('music', 'bgm_peaceful', 'https://example.com/assets/bgm.mp3');

    expect(mockHowlInstances).toHaveLength(1);
    expect(mockHowlInstances[0].options.format).toBeUndefined();
  });
});
