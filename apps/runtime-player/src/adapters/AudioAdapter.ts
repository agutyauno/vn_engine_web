// ============================================================================
// AUDIO ADAPTER (ADR-017)
// Điều khiển AudioManager đa kênh mở, voice auto-cut, replay voice và catch-up
// ============================================================================

import type { AudioManager } from '@vn-engine/audio';
import type { Instruction, PlayInstruction, StopInstruction } from '@vn-engine/shared-types';

export interface AudioAdapterOptions {
  assetResolver?: (key: string) => string | undefined;
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
      this.audioManager.setChannelVolume(channel, volume);
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
      const url = this.options.assetResolver ? this.options.assetResolver(playInstr.assetId) : playInstr.assetId;
      if (url) {
        this.audioManager.play(playInstr.channel, playInstr.assetId, url, {
          volume: playInstr.volume,
          loop: playInstr.loop,
          fadeIn: playInstr.fadeIn,
        });
      }
    } else if (instr.type === 'STOP') {
      const stopInstr = instr as StopInstruction;
      this.audioManager.stop(stopInstr.channel, {
        fadeOut: stopInstr.fadeOut,
      });
    }
  }

  public syncStateCatchUp(activeAudio: Map<string, PlayInstruction>): void {
    const resolver = this.options.assetResolver ?? ((key: string) => key);
    this.audioManager.syncStateCatchUp(activeAudio, resolver);
  }
}
