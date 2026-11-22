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

export type ChannelPhase = 'idle' | 'intro' | 'loop';

/**
 * Phân giải định dạng âm thanh (format) truyền cho Howler.js (TASK-audio-format-resolution)
 * - Ưu tiên explicitFormat nếu được chỉ định
 * - Trích xuất extension từ assetId nếu có (VD: "sfx_laser.wav" -> ['wav'])
 * - Tự động áp dụng danh sách format fallback nếu là URL blob: hoặc không có extension: ['mp3', 'wav', 'ogg', 'webm', 'aac']
 * - Trả về undefined nếu là URL HTTP thông thường có đuôi file rõ ràng để Howler tự trích xuất
 */
export function resolveAudioFormat(
  url: string,
  assetId?: string,
  explicitFormat?: string | string[],
): string[] | undefined {
  // 1. Ưu tiên format tường minh từ options
  if (explicitFormat) {
    return Array.isArray(explicitFormat) ? explicitFormat : [explicitFormat];
  }

  // 2. Trích xuất từ assetId nếu assetId có extension (ví dụ: "sound.mp3")
  if (assetId) {
    const match = /\.([a-zA-Z0-9]+)$/.exec(assetId.trim());
    if (match && match[1]) {
      return [match[1].toLowerCase()];
    }
  }

  // 3. Nếu URL là blob: hoặc không có extension trong pathname
  const isBlobUrl = url.startsWith('blob:');
  const hasExtensionInUrl = /\.([a-zA-Z0-9]+)(?:[\?#].*)?$/.test(url);
  if (isBlobUrl || !hasExtensionInUrl) {
    return ['mp3', 'wav', 'ogg', 'webm', 'aac'];
  }

  return undefined; // Để Howler tự trích xuất từ URL thông thường
}

interface InternalChannel {
  name: string;
  currentAssetId: string | null;
  currentUrl: string | null;
  howl: Howl | null;
  introHowl: Howl | null;
  phase: ChannelPhase;
  volume: number; // Volume người dùng chỉnh (0..1)
  scriptVolume: number; // Hệ số âm lượng do script chỉ định (mặc định: 1.0)
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
        introHowl: null,
        phase: 'idle',
        volume: preset.defaultVolume,
        scriptVolume: 1.0,
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
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return;
    }

    const channel = this.getOrCreateChannel(channelName);
    const preset = this.channelPresets.get(channelName) ?? {
      defaultLoop: false,
      defaultVolume: 1.0,
    };

    const targetLoop = options?.loop ?? preset.defaultLoop;
    const scriptVolume =
      options?.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
    channel.scriptVolume = scriptVolume;
    const targetVolume = Math.max(0, Math.min(1, channel.volume * channel.scriptVolume));

    // Nếu bài này đang phát chính xác trên kênh này (không có intro mới), chỉ cần cập nhật volume / loop nếu cần
    if (
      !options?.introUrl &&
      channel.isPlaying &&
      channel.currentAssetId === assetId &&
      channel.howl
    ) {
      channel.howl.loop(targetLoop);
      channel.howl.volume(targetVolume);
      channel.loop = targetLoop;
      return;
    }

    // Dọn dẹp Howl cũ nếu đang có trên kênh này
    if (channel.introHowl) {
      const oldIntroHowl = channel.introHowl;
      channel.introHowl = null;
      if (options?.fadeOut && options.fadeOut > 0) {
        try {
          oldIntroHowl.fade(oldIntroHowl.volume(), 0, options.fadeOut * 1000);
          setTimeout(() => {
            try {
              oldIntroHowl.stop();
              oldIntroHowl.unload();
            } catch {
              // Bỏ qua
            }
          }, options.fadeOut * 1000);
        } catch {
          oldIntroHowl.stop();
          oldIntroHowl.unload();
        }
      } else {
        try {
          oldIntroHowl.stop();
          oldIntroHowl.unload();
        } catch {
          // Bỏ qua
        }
      }
    }

    if (channel.howl) {
      const oldHowl = channel.howl;
      channel.howl = null;
      if (options?.fadeOut && options.fadeOut > 0) {
        try {
          oldHowl.fade(oldHowl.volume(), 0, options.fadeOut * 1000);
          setTimeout(() => {
            try {
              oldHowl.stop();
              oldHowl.unload();
            } catch {
              // Howl đã unload trước đó
            }
          }, options.fadeOut * 1000);
        } catch {
          oldHowl.stop();
          oldHowl.unload();
        }
      } else {
        try {
          oldHowl.stop();
          oldHowl.unload();
        } catch {
          // Bỏ qua
        }
      }
    }

    const isHtml5 = channelName === 'music'; // Dùng HTML5 Audio cho nhạc nền dung lượng lớn

    if (
      options?.introUrl &&
      typeof options.introUrl === 'string' &&
      options.introUrl.trim().length > 0
    ) {
      // LUỒNG PHÁT INTRO + LOOP (CHAINING)
      try {
        const introExplicitFormat =
          options?.introFormat ??
          (options?.introAssetId && /\.([a-zA-Z0-9]+)$/.test(options.introAssetId.trim())
            ? undefined
            : options?.format);
        const introFormat = resolveAudioFormat(
          options.introUrl,
          options.introAssetId,
          introExplicitFormat,
        );

        const introHowl = new Howl({
          src: [options.introUrl],
          html5: isHtml5,
          loop: false,
          volume: targetVolume,
          ...(introFormat ? { format: introFormat } : {}),
        });

        const loopFormat = resolveAudioFormat(url, assetId, options?.format);

        const loopHowl = new Howl({
          src: [url],
          html5: isHtml5,
          loop: targetLoop,
          volume: targetVolume,
          ...(loopFormat ? { format: loopFormat } : {}),
        });

        channel.currentAssetId = assetId;
        channel.currentUrl = url;
        channel.introHowl = introHowl;
        channel.howl = loopHowl;
        channel.phase = 'intro';
        channel.loop = targetLoop;
        channel.isPlaying = true;

        if (options.fadeIn && options.fadeIn > 0) {
          introHowl.volume(0);
          introHowl.play();
          introHowl.fade(0, targetVolume, options.fadeIn * 1000);
        } else {
          introHowl.play();
        }

        introHowl.once('end', () => {
          if (channel.phase === 'intro' && channel.introHowl === introHowl) {
            channel.phase = 'loop';
            try {
              introHowl.unload();
            } catch {
              // Bỏ qua
            }
            channel.introHowl = null;
            loopHowl.play();
          }
        });

        introHowl.on('loaderror', (_id: number, err: unknown) => {
          console.warn(
            `[AudioManager] Failed to load intro audio asset "${options.introAssetId ?? ''}" from ${options.introUrl}:`,
            err,
          );
        });

        loopHowl.on('end', () => {
          if (!targetLoop) {
            channel.isPlaying = false;
          }
        });

        loopHowl.on('loaderror', (_id: number, err: unknown) => {
          console.warn(`[AudioManager] Failed to load audio asset "${assetId}" from ${url}:`, err);
          channel.isPlaying = false;
        });
      } catch (e) {
        console.warn(`[AudioManager] Error initializing Howl with intro for "${assetId}":`, e);
        channel.isPlaying = false;
        channel.phase = 'idle';
      }
    } else {
      // LUỒNG PHÁT THƯỜNG (LOOP / SINGLE TRACK)
      try {
        const loopFormat = resolveAudioFormat(url, assetId, options?.format);

        const howl = new Howl({
          src: [url],
          html5: isHtml5,
          loop: targetLoop,
          volume: targetVolume,
          ...(loopFormat ? { format: loopFormat } : {}),
        });

        channel.currentAssetId = assetId;
        channel.currentUrl = url;
        channel.introHowl = null;
        channel.howl = howl;
        channel.phase = 'loop';
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
          console.warn(`[AudioManager] Failed to load audio asset "${assetId}" from ${url}:`, err);
          channel.isPlaying = false;
        });
      } catch (e) {
        console.warn(`[AudioManager] Error initializing Howl for "${assetId}":`, e);
        channel.isPlaying = false;
        channel.phase = 'idle';
      }
    }
  }

  /**
   * Dừng âm thanh trên một kênh
   */
  public stop(channelName: string, options?: AudioStopOptions): void {
    const channel = this.channels.get(channelName);
    if (!channel || (!channel.howl && !channel.introHowl)) return;

    const howl = channel.howl;
    const introHowl = channel.introHowl;
    channel.currentAssetId = null;
    channel.currentUrl = null;
    channel.isPlaying = false;
    channel.phase = 'idle';
    channel.howl = null;
    channel.introHowl = null;

    if (options?.fadeOut && options.fadeOut > 0) {
      const activeHowl = introHowl ?? howl;
      if (activeHowl) {
        try {
          activeHowl.fade(activeHowl.volume(), 0, options.fadeOut * 1000);
        } catch {
          // Bỏ qua
        }
      }
      setTimeout(() => {
        try {
          introHowl?.stop();
          introHowl?.unload();
        } catch {
          // Bỏ qua
        }
        try {
          howl?.stop();
          howl?.unload();
        } catch {
          // Bỏ qua
        }
      }, options.fadeOut * 1000);
    } else {
      try {
        introHowl?.stop();
        introHowl?.unload();
      } catch {
        // Bỏ qua
      }
      try {
        howl?.stop();
        howl?.unload();
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
    if (!channel || !channel.isPlaying) return;

    if (channel.phase === 'intro' && channel.introHowl) {
      channel.introHowl.pause();
      channel.isPlaying = false;
    } else if (channel.phase === 'loop' && channel.howl) {
      channel.howl.pause();
      channel.isPlaying = false;
    }
  }

  /**
   * Tiếp tục phát âm thanh trên một kênh
   */
  public resume(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (!channel || channel.isPlaying) return;

    if (channel.phase === 'intro' && channel.introHowl) {
      channel.introHowl.play();
      channel.isPlaying = true;
    } else if (channel.phase === 'loop' && channel.howl) {
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
    const effectiveVolume = clamped * channel.scriptVolume;
    if (channel.introHowl) {
      channel.introHowl.volume(effectiveVolume);
    }
    if (channel.howl) {
      channel.howl.volume(effectiveVolume);
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
   * Lưu ý: State Catch-up bỏ qua introUrl, phát thẳng đoạn loop bài chính
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

    // 2. Đồng bộ các kênh có trong audioMap (phát thẳng main loop, không resolve hay truyền intro)
    for (const [channelName, playInstr] of audioMap.entries()) {
      const isPersistent =
        playInstr.loop === true || channelName === 'music' || channelName === 'ambience';
      if (!isPersistent) {
        continue;
      }

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
