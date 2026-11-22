/// <reference types="node" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PlayInstruction } from '@vn-engine/shared-types';
import type { AudioPlayOptions } from '../src/types';
import { AudioManager } from '../src/manager';

// Type helper cho phép truyền options intro trong giai đoạn TDD
interface ExtendedAudioPlayOptions extends AudioPlayOptions {
  introAssetId?: string;
  introUrl?: string;
}

// ---------------------------------------------------------------------------
// 1. Mock Howler Infrastructure (Hoisted)
// ---------------------------------------------------------------------------
const { mockHowlInstances, MockHowl } = vi.hoisted(() => {
  interface ListenerRecord {
    fn: (...args: unknown[]) => void;
    once: boolean;
  }

  class MockHowl {
    public options: Record<string, unknown>;
    private listeners: Map<string, ListenerRecord[]> = new Map();
    private _volume: number;
    private _loop: boolean;

    public play = vi.fn().mockReturnValue(1);
    public stop = vi.fn().mockReturnValue(this);
    public pause = vi.fn().mockReturnValue(this);
    public fade = vi.fn((_from: number, to: number, _duration: number) => {
      this._volume = to;
      return this;
    });
    public unload = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      this._volume = typeof options?.volume === 'number' ? options.volume : 1.0;
      this._loop = Boolean(options?.loop);
    }

    public volume = vi.fn((val?: number) => {
      if (val !== undefined) {
        this._volume = val;
        return this;
      }
      return this._volume;
    });

    public loop = vi.fn((val?: boolean) => {
      if (val !== undefined) {
        this._loop = val;
        return this;
      }
      return this._loop;
    });

    public on = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      const list = this.listeners.get(event) ?? [];
      list.push({ fn, once: false });
      this.listeners.set(event, list);
      return this;
    });

    public once = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      const list = this.listeners.get(event) ?? [];
      list.push({ fn, once: true });
      this.listeners.set(event, list);
      return this;
    });

    public off = vi.fn((event?: string, fn?: (...args: unknown[]) => void) => {
      if (!event) {
        this.listeners.clear();
        return this;
      }
      if (!fn) {
        this.listeners.delete(event);
        return this;
      }
      const list = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        list.filter(item => item.fn !== fn),
      );
      return this;
    });

    /**
     * Giả lập bắn sự kiện của Howler (ví dụ: 'end', 'load', 'loaderror')
     */
    public emit(event: string, ...args: unknown[]) {
      const list = [...(this.listeners.get(event) ?? [])];
      for (const item of list) {
        item.fn(...args);
        if (item.once) {
          const currentList = this.listeners.get(event) ?? [];
          this.listeners.set(
            event,
            currentList.filter(i => i !== item),
          );
        }
      }
    }
  }

  const mockHowlInstances: MockHowl[] = [];
  return { mockHowlInstances, MockHowl };
});

vi.mock('howler', () => {
  return {
    Howl: vi.fn().mockImplementation((options: Record<string, unknown>) => {
      const instance = new MockHowl(options);
      mockHowlInstances.push(instance);
      return instance;
    }),
    Howler: {
      volume: vi.fn(),
      mute: vi.fn(),
      ctx: { state: 'running', resume: vi.fn() },
    },
  };
});

// ---------------------------------------------------------------------------
// 2. Unit Test Suite (RED Phase)
// ---------------------------------------------------------------------------
describe('AudioManager: Chaining Intro and Loop (TASK-audio-intro-loop)', () => {
  let audioManager: AudioManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHowlInstances.length = 0;
    audioManager = new AudioManager();
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-01: Chaining Sequence
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-01: should play intro first and automatically transition to loop when intro ends', () => {
    const playOptions: ExtendedAudioPlayOptions = {
      introAssetId: 'bgm_battle_intro',
      introUrl: 'https://cdn.example.com/audio/battle_intro.mp3',
      volume: 0.8,
      loop: true,
    };

    audioManager.play(
      'music',
      'bgm_battle',
      'https://cdn.example.com/audio/battle_loop.mp3',
      playOptions as AudioPlayOptions,
    );

    // 1. Phải tạo đúng 2 Howl instance: [0] = introHowl, [1] = loopHowl
    expect(mockHowlInstances).toHaveLength(2);
    const [introHowl, loopHowl] = mockHowlInstances;

    // Kiểm tra cấu hình Howl của Intro
    expect(introHowl.options.src).toEqual(['https://cdn.example.com/audio/battle_intro.mp3']);
    expect(introHowl.options.loop).toBe(false);
    expect(introHowl.volume()).toBe(0.8);

    // Kiểm tra cấu hình Howl của Loop (được preload sẵn)
    expect(loopHowl.options.src).toEqual(['https://cdn.example.com/audio/battle_loop.mp3']);
    expect(loopHowl.options.loop).toBe(true);
    expect(loopHowl.volume()).toBe(0.8);

    // 2. Ban đầu chỉ phát introHowl, loopHowl chưa phát
    expect(introHowl.play).toHaveBeenCalledTimes(1);
    expect(loopHowl.play).not.toHaveBeenCalled();

    const channelStateIntro = audioManager.getChannelsState().find(c => c.name === 'music');
    expect(channelStateIntro?.isPlaying).toBe(true);
    expect(channelStateIntro?.currentAssetId).toBe('bgm_battle');

    // 3. Khi đoạn intro kết thúc: bắn event 'end'
    introHowl.emit('end');

    // loopHowl phải lập tức được kích hoạt play
    expect(loopHowl.play).toHaveBeenCalledTimes(1);
    // introHowl phải được giải phóng bộ nhớ (unload)
    expect(introHowl.unload).toHaveBeenCalledTimes(1);

    // Kênh tiếp tục ở trạng thái isPlaying = true
    const channelStateLoop = audioManager.getChannelsState().find(c => c.name === 'music');
    expect(channelStateLoop?.isPlaying).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-02: Clean Interruption on Stop
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-02: should stop intro, unload both Howls, and never trigger loop if stopped during intro', () => {
    const playOptions: ExtendedAudioPlayOptions = {
      introAssetId: 'bgm_intro',
      introUrl: 'https://cdn.example.com/audio/intro.mp3',
      loop: true,
    };

    audioManager.play(
      'music',
      'bgm_loop',
      'https://cdn.example.com/audio/loop.mp3',
      playOptions as AudioPlayOptions,
    );

    expect(mockHowlInstances).toHaveLength(2);
    const [introHowl, loopHowl] = mockHowlInstances;

    // Khi đang phát intro, người dùng gọi stop()
    audioManager.stop('music');

    // Cả introHowl và loopHowl đều phải được dừng và unload
    expect(introHowl.stop).toHaveBeenCalled();
    expect(introHowl.unload).toHaveBeenCalled();
    expect(loopHowl.stop).toHaveBeenCalled();
    expect(loopHowl.unload).toHaveBeenCalled();

    // Giả lập sự kiện 'end' muộn của intro sau khi đã dừng (race condition)
    introHowl.emit('end');

    // Tuyệt đối không được kích hoạt loopHowl.play()
    expect(loopHowl.play).not.toHaveBeenCalled();

    const state = audioManager.getChannelsState().find(c => c.name === 'music');
    expect(state?.isPlaying).toBe(false);
    expect(state?.currentAssetId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-03: Override by New Play
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-03: should cancel pending intro/loop and prevent ghost audio when a new track plays', () => {
    // 1. Bắt đầu phát bài 1 có intro
    audioManager.play('music', 'bgm_track1', 'https://cdn.example.com/audio/track1_loop.mp3', {
      introAssetId: 'bgm_track1_intro',
      introUrl: 'https://cdn.example.com/audio/track1_intro.mp3',
    } as ExtendedAudioPlayOptions as AudioPlayOptions);

    const [intro1, loop1] = mockHowlInstances;
    expect(intro1.play).toHaveBeenCalledTimes(1);

    // 2. Chuyển ngay sang bài 2 (không có intro) khi bài 1 đang dạo đầu
    audioManager.play('music', 'bgm_track2', 'https://cdn.example.com/audio/track2.mp3', {
      volume: 0.5,
    } as AudioPlayOptions);

    // intro1 và loop1 cũ phải bị dừng và unload
    expect(intro1.stop).toHaveBeenCalled();
    expect(intro1.unload).toHaveBeenCalled();
    expect(loop1.unload).toHaveBeenCalled();

    // Bài 2 được khởi tạo và phát
    expect(mockHowlInstances).toHaveLength(3);
    const track2Howl = mockHowlInstances[2];
    expect(track2Howl.options.src).toEqual(['https://cdn.example.com/audio/track2.mp3']);
    expect(track2Howl.play).toHaveBeenCalledTimes(1);

    // Giả lập intro cũ emit 'end' sau khi đã bị override
    intro1.emit('end');

    // loop1 của bài cũ không bao giờ được phát ngầm ("nhạc ma")
    expect(loop1.play).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-04: Pause / Resume in Intro
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-04: should pause and resume introHowl correctly while in intro phase', () => {
    audioManager.play('music', 'bgm_battle', 'https://cdn.example.com/audio/battle_loop.mp3', {
      introAssetId: 'bgm_battle_intro',
      introUrl: 'https://cdn.example.com/audio/battle_intro.mp3',
    } as ExtendedAudioPlayOptions as AudioPlayOptions);

    const [introHowl, loopHowl] = mockHowlInstances;

    // 1. Tạm dừng kênh music khi đang ở intro
    audioManager.pause('music');
    expect(introHowl.pause).toHaveBeenCalledTimes(1);
    expect(loopHowl.pause).not.toHaveBeenCalled();
    expect(audioManager.getChannelsState().find(c => c.name === 'music')?.isPlaying).toBe(false);

    // 2. Tiếp tục phát
    audioManager.resume('music');
    expect(introHowl.play).toHaveBeenCalledTimes(2); // Lần 1 khi play(), lần 2 khi resume()
    expect(audioManager.getChannelsState().find(c => c.name === 'music')?.isPlaying).toBe(true);

    // 3. Sau khi resume, hết intro thì loop vẫn chuyển tiếp bình thường
    introHowl.emit('end');
    expect(loopHowl.play).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-05: Volume Adjustment in Intro
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-05: should adjust volume on active introHowl and sync target volume to loopHowl', () => {
    audioManager.play('music', 'bgm_battle', 'https://cdn.example.com/audio/battle_loop.mp3', {
      introAssetId: 'bgm_battle_intro',
      introUrl: 'https://cdn.example.com/audio/battle_intro.mp3',
      volume: 0.5, // script volume
    } as ExtendedAudioPlayOptions as AudioPlayOptions);

    const [introHowl, loopHowl] = mockHowlInstances;

    // Âm lượng ban đầu: channel.volume (1.0) * scriptVolume (0.5) = 0.5
    expect(introHowl.volume()).toBe(0.5);

    // Người dùng chỉnh âm lượng kênh music xuống 0.6 -> target volume = 0.6 * 0.5 = 0.3
    audioManager.setChannelVolume('music', 0.6);

    expect(introHowl.volume).toHaveBeenCalledWith(0.3);
    // loopHowl cũng phải được cập nhật âm lượng trước để sẵn sàng
    expect(loopHowl.volume).toHaveBeenCalledWith(0.3);
    expect(audioManager.getChannelVolume('music')).toBe(0.6);
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-06: Catch-up Mode (syncStateCatchUp)
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-06: syncStateCatchUp should skip intro and directly play main loop track', () => {
    const audioMap = new Map<string, PlayInstruction>([
      [
        'music',
        {
          type: 'PLAY',
          channel: 'music',
          assetId: 'bgm_dungeon',
          intro: 'bgm_dungeon_intro',
          volume: 0.75,
          loop: true,
        },
      ],
    ]);

    const assetResolver = (id: string): string | undefined => {
      if (id === 'bgm_dungeon') return 'https://cdn.example.com/audio/dungeon_loop.mp3';
      if (id === 'bgm_dungeon_intro') return 'https://cdn.example.com/audio/dungeon_intro.mp3';
      return undefined;
    };

    audioManager.syncStateCatchUp(audioMap, assetResolver);

    // Theo mục 2.4 D đặc tả: State catch-up bỏ qua intro, phát thẳng loop
    expect(mockHowlInstances).toHaveLength(1);
    const mainHowl = mockHowlInstances[0];

    expect(mainHowl.options.src).toEqual(['https://cdn.example.com/audio/dungeon_loop.mp3']);
    expect(mainHowl.options.loop).toBe(true);
    expect(mainHowl.play).toHaveBeenCalledTimes(1);

    const state = audioManager.getChannelsState().find(c => c.name === 'music');
    expect(state?.isPlaying).toBe(true);
    expect(state?.currentAssetId).toBe('bgm_dungeon');
  });

  // -------------------------------------------------------------------------
  // TC-AUD-INTRO-07 (Edge Case): Fade In during Intro Phase
  // -------------------------------------------------------------------------
  it('TC-AUD-INTRO-07: should apply fadeIn to introHowl instead of main track when intro is present', () => {
    audioManager.play('music', 'bgm_peaceful', 'https://cdn.example.com/audio/peaceful_loop.mp3', {
      introAssetId: 'bgm_peaceful_intro',
      introUrl: 'https://cdn.example.com/audio/peaceful_intro.mp3',
      fadeIn: 2.0, // 2s
      volume: 1.0,
    } as ExtendedAudioPlayOptions as AudioPlayOptions);

    const [introHowl, loopHowl] = mockHowlInstances;

    // introHowl phải nhận lệnh fade từ 0 lên 1.0 trong 2000ms
    expect(introHowl.fade).toHaveBeenCalledWith(0, 1.0, 2000);
    expect(introHowl.play).toHaveBeenCalledTimes(1);

    // loopHowl không được fade in trùng lắp
    expect(loopHowl.fade).not.toHaveBeenCalled();

    // Khi intro kết thúc, loopHowl phát thẳng với volume đầy đủ
    introHowl.emit('end');
    expect(loopHowl.play).toHaveBeenCalledTimes(1);
    expect(loopHowl.volume()).toBe(1.0);
  });
});
