// ==========================================
// KIỂU DỮ LIỆU TẦNG ÂM THANH (AUDIO TYPES - ADR-017)
// ==========================================

import type { PlayInstruction } from '@vn-engine/shared-types';

export interface AudioPlayOptions {
  volume?: number;
  loop?: boolean;
  fadeIn?: number; // thời gian tính bằng giây
  fadeOut?: number; // thời gian fade out bài cũ trước khi vào bài mới
}

export interface AudioStopOptions {
  fadeOut?: number; // thời gian tính bằng giây
}

export interface ChannelPreset {
  defaultLoop: boolean;
  defaultVolume: number;
}

export interface AudioChannelState {
  name: string;
  currentAssetId: string | null;
  volume: number;
  loop: boolean;
  isPlaying: boolean;
}

export type AssetAudioResolver = (assetId: string) => string | undefined;

export interface AudioCatchUpMap {
  audio: Map<string, PlayInstruction>;
}
