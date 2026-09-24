// ==========================================
// TRÌNH QUẢN LÝ ÂM THANH ĐA KÊNH MỞ (ADR-017)
// ==========================================

import { Howl, Howler } from 'howler';
import type { PlayInstruction } from '@vn-engine/shared-types';
import type {
  AudioChannelState,
  AudioPlayOptions,
  AudioStopOptions,
  ChannelPreset,
  AssetAudioResolver,
} from './types';

interface InternalChannel {
  name: string;
  currentAssetId: string | null;
  currentUrl: string | null;
  howl: Howl | null;
  volume: number;
  loop: boolean;
  isPlaying: boolean;
}

export class AudioManager {
  private channels: Map<string, InternalChannel> = new Map();
  private channelPresets: Map<string, ChannelPreset> = new Map([
    ['music', { defaultLoop: true, defaultVolume: 1.0 }],
    ['sound', { defaultLoop: false, defaultVolume: 1.0 }],
    ['voice', { defaultLoop: false, defaultVolume: 1.0 }],
    ['ambience', { defaultLoop: true, defaultVolume: 0.8 }],
  ]);

  private masterVolume: number = 1.0;
  private muted: boolean = false;
  private audioUnlocked: boolean = false;

  constructor() {
    this.setupAudioUnlockListener();
  }

  /**
   * Đăng ký lắng nghe tương tác đầu tiên của người dùng để mở khóa Web Audio (Browser Autoplay Policy)
   */
  private setupAudioUnlockListener(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      try {
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
          void Howler.ctx.resume();
        }
      } catch {
        // Bỏ qua lỗi audio context trên môi trường không hỗ trợ
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /**
   * Lấy hoặc tự động khởi tạo cấu hình cho một kênh âm thanh bất kỳ (Open Channel Registry)
   */
  private getOrCreateChannel(channelName: string): InternalChannel {
    let channel = this.channels.get(channelName);
    if (!channel) {
      const preset = this.channelPresets.get(channelName) ?? {
        defaultLoop: false,
        defaultVolume: 1.0,
      };

      channel = {
        name: channelName,
        currentAssetId: null,
        currentUrl: null,
        howl: null,
        volume: preset.defaultVolume,
        loop: preset.defaultLoop,
        isPlaying: false,
      };
      this.channels.set(channelName, channel);
    }
    return channel;
  }

  /**
   * Phát âm thanh trên một kênh xác định
   */
  public play(channelName: string, assetId: string, url: string, options?: AudioPlayOptions): void {
    const channel = this.getOrCreateChannel(channelName);
    const preset = this.channelPresets.get(channelName) ?? {
      defaultLoop: false,
      defaultVolume: 1.0,
    };

    const targetLoop = options?.loop ?? preset.defaultLoop;
    const targetVolume = Math.max(0, Math.min(1, options?.volume ?? channel.volume));

    // Nếu bài này đang phát chính xác trên kênh này, chỉ cần cập nhật volume / loop nếu cần
    if (channel.isPlaying && channel.currentAssetId === assetId && channel.howl) {
      channel.howl.loop(targetLoop);
      channel.howl.volume(targetVolume);
      channel.volume = targetVolume;
      channel.loop = targetLoop;
      return;
    }

    // Dọn dẹp bài cũ nếu đang có trên kênh này
    if (channel.howl) {
      const oldHowl = channel.howl;
      if (options?.fadeOut && options.fadeOut > 0) {
        oldHowl.fade(oldHowl.volume(), 0, options.fadeOut * 1000);
        setTimeout(() => {
          try {
            oldHowl.stop();
            oldHowl.unload();
          } catch {
            // Howl đã unload trước đó
          }
        }, options.fadeOut * 1000);
      } else {
        try {
          oldHowl.stop();
          oldHowl.unload();
        } catch {
          // Bỏ qua
        }
      }
    }

    // Tạo đối tượng Howl mới
    try {
      const isHtml5 = channelName === 'music'; // Dùng HTML5 Audio cho nhạc nền dung lượng lớn
      const howl = new Howl({
        src: [url],
        html5: isHtml5,
        loop: targetLoop,
        volume: targetVolume,
      });

      channel.currentAssetId = assetId;
      channel.currentUrl = url;
      channel.howl = howl;
      channel.volume = targetVolume;
      channel.loop = targetLoop;
      channel.isPlaying = true;

      if (options?.fadeIn && options.fadeIn > 0) {
        howl.volume(0);
        howl.play();
        howl.fade(0, targetVolume, options.fadeIn * 1000);
      } else {
        howl.play();
      }

      howl.on('end', () => {
        if (!targetLoop) {
          channel.isPlaying = false;
        }
      });

      howl.on('loaderror', (_id: number, err: unknown) => {
        // Warning when audio asset fails to load
        console.warn(`[AudioManager] Failed to load audio asset "${assetId}" from ${url}:`, err);
        channel.isPlaying = false;
      });
    } catch (e) {
      console.warn(`[AudioManager] Error initializing Howl for "${assetId}":`, e);
      channel.isPlaying = false;
    }
  }

  /**
   * Dừng âm thanh trên một kênh
   */
  public stop(channelName: string, options?: AudioStopOptions): void {
    const channel = this.channels.get(channelName);
    if (!channel || !channel.howl) return;

    const howl = channel.howl;
    channel.currentAssetId = null;
    channel.currentUrl = null;
    channel.isPlaying = false;
    channel.howl = null;

    if (options?.fadeOut && options.fadeOut > 0) {
      try {
        howl.fade(howl.volume(), 0, options.fadeOut * 1000);
        setTimeout(() => {
          try {
            howl.stop();
            howl.unload();
          } catch {
            // Bỏ qua
          }
        }, options.fadeOut * 1000);
      } catch {
        howl.stop();
      }
    } else {
      try {
        howl.stop();
        howl.unload();
      } catch {
        // Bỏ qua
      }
    }
  }

  /**
   * Tạm dừng âm thanh trên một kênh
   */
  public pause(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel?.howl && channel.isPlaying) {
      channel.howl.pause();
      channel.isPlaying = false;
    }
  }

  /**
   * Tiếp tục phát âm thanh trên một kênh
   */
  public resume(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel?.howl && !channel.isPlaying) {
      channel.howl.play();
      channel.isPlaying = true;
    }
  }

  /**
   * Điều chỉnh âm lượng cho một kênh
   */
  public setChannelVolume(channelName: string, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    const channel = this.getOrCreateChannel(channelName);
    channel.volume = clamped;
    if (channel.howl) {
      channel.howl.volume(clamped);
    }
  }

  /**
   * Lấy âm lượng hiện tại của một kênh
   */
  public getChannelVolume(channelName: string): number {
    const channel = this.channels.get(channelName);
    return channel ? channel.volume : 1.0;
  }

  /**
   * Điều chỉnh âm lượng tổng (Master Volume)
   */
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    try {
      Howler.volume(this.masterVolume);
    } catch {
      // Bỏ qua
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Tắt toàn bộ tiếng
   */
  public mute(): void {
    this.muted = true;
    try {
      Howler.mute(true);
    } catch {
      // Bỏ qua
    }
  }

  /**
   * Bật lại tiếng
   */
  public unmute(): void {
    this.muted = false;
    try {
      Howler.mute(false);
    } catch {
      // Bỏ qua
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Lấy trạng thái của toàn bộ các kênh hiện có (phục vụ Debug Inspector)
   */
  public getChannelsState(): AudioChannelState[] {
    const states: AudioChannelState[] = [];
    for (const channel of this.channels.values()) {
      states.push({
        name: channel.name,
        currentAssetId: channel.currentAssetId,
        volume: channel.volume,
        loop: channel.loop,
        isPlaying: channel.isPlaying,
      });
    }
    return states;
  }

  /**
   * Đồng bộ hóa trạng thái âm thanh khi Rollback hoặc Load Game (State Catch-up)
   */
  public syncStateCatchUp(
    audioMap: Map<string, PlayInstruction>,
    assetResolver: AssetAudioResolver,
  ): void {
    // 1. Dừng các kênh đang phát mà không còn trong audioMap của điểm khôi phục
    for (const [channelName, channel] of this.channels.entries()) {
      if (!audioMap.has(channelName) && channel.isPlaying) {
        this.stop(channelName, { fadeOut: 0.5 });
      }
    }

    // 2. Đồng bộ các kênh có trong audioMap
    for (const [channelName, playInstr] of audioMap.entries()) {
      const channel = this.channels.get(channelName);
      // Nếu kênh đang phát đúng bài này thì giữ nguyên
      if (channel?.isPlaying && channel.currentAssetId === playInstr.assetId) {
        continue;
      }

      const url = assetResolver(playInstr.assetId);
      if (url) {
        this.play(channelName, playInstr.assetId, url, {
          volume: playInstr.volume,
          loop: playInstr.loop,
          fadeIn: playInstr.fadeIn,
        });
      }
    }
  }

  /**
   * Dừng toàn bộ âm thanh trên tất cả các kênh
   */
  public stopAll(): void {
    for (const channelName of this.channels.keys()) {
      this.stop(channelName);
    }
  }
}
