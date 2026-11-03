// ============================================================================
// AUDIO ADAPTER (ADR-017)
// Điều khiển AudioManager đa kênh mở, voice auto-cut, replay voice và catch-up
// ============================================================================

import type { AudioManager } from '@vn-engine/audio';
import type { Instruction, PlayInstruction, StopInstruction } from '@vn-engine/shared-types';

export interface AudioAdapterOptions {
  assetResolver?: (key: string) => string | undefined;
}

const CANONICAL_CHANNELS: Record<string, string> = {
  bgm: 'music',
  music: 'music',
  sfx: 'sound',
  sound: 'sound',
  voice: 'voice',
  ambience: 'ambience',
};

function canonicalizeChannel(channel: string): string {
  return CANONICAL_CHANNELS[channel] ?? channel;
}

export class AudioAdapter {
  private audioManager: AudioManager;
  private options: AudioAdapterOptions;

  constructor(audioManager: AudioManager, options?: AudioAdapterOptions) {
    this.audioManager = audioManager;
    this.options = options ?? {};
  }

  public setVolume(channel: string, volume: number): void {
    if (channel === 'master') {
      this.audioManager.setMasterVolume(volume);
    } else {
      this.audioManager.setChannelVolume(canonicalizeChannel(channel), volume);
    }
  }

  public setMute(muted: boolean): void {
    if (muted) {
      this.audioManager.mute();
    } else {
      this.audioManager.unmute();
    }
  }

  /**
   * Deterministic Voice Auto-Cut: Dừng kênh voice ngay lập tức
   */
  public stopVoice(): void {
    this.audioManager.stop('voice');
  }

  /**
   * Replay voice câu thoại hiện tại hoặc trong backlog
   */
  public playVoice(assetId: string): void {
    const url = this.options.assetResolver ? this.options.assetResolver(assetId) : assetId;
    if (url) {
      this.audioManager.play('voice', assetId, url, {
        loop: false,
        volume: 1.0,
      });
    }
  }

  public applySideEffect(instr: Instruction): void {
    if (instr.type === 'PLAY') {
      const playInstr = instr as PlayInstruction;
      const targetChannel = canonicalizeChannel(playInstr.channel);
      const url = this.options.assetResolver
        ? this.options.assetResolver(playInstr.assetId)
        : playInstr.assetId;
      if (url) {
        this.audioManager.play(targetChannel, playInstr.assetId, url, {
          volume: playInstr.volume,
          loop: playInstr.loop,
          fadeIn: playInstr.fadeIn,
        });
      }
    } else if (instr.type === 'STOP') {
      const stopInstr = instr as StopInstruction;
      const targetChannel = canonicalizeChannel(stopInstr.channel);
      this.audioManager.stop(targetChannel, {
        fadeOut: stopInstr.fadeOut,
      });
    }
  }

  public syncStateCatchUp(activeAudio: Map<string, PlayInstruction>): void {
    const resolver = this.options.assetResolver ?? ((key: string) => key);
    const canonicalMap = new Map<string, PlayInstruction>();
    for (const [ch, instr] of activeAudio.entries()) {
      const canonicalCh = canonicalizeChannel(ch);
      canonicalMap.set(canonicalCh, {
        ...instr,
        channel: canonicalCh,
      });
    }
    this.audioManager.syncStateCatchUp(canonicalMap, resolver);
  }

  /**
   * Dừng toàn bộ các kênh âm thanh và hủy các quá trình fade
   */
  public stopAll(): void {
    this.audioManager.stopAll();
  }
}
