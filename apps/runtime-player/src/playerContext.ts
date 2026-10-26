// ================================================================
// VN RUNTIME PLAYER - CONTEXT INTERFACE & DATA CONTRACTS
// ================================================================

import type { VisualNovelVM } from '@vn-engine/core-vm';
import type { GameRenderer } from '@vn-engine/renderer';
import type { AudioManager } from '@vn-engine/audio';
import type { Character, AssetRef, Instruction } from '@vn-engine/shared-types';
import type { DiagnosticBus } from './services/diagnosticBus';

export interface BacklogEntry {
  speaker: string | null;
  text: string;
}

export interface ProjectData {
  id?: string;
  characters?: Character[];
  assets?: AssetRef[];
}

export interface PlayerContext {
  getVM(): VisualNovelVM;
  getRenderer(): GameRenderer;
  getAudio(): AudioManager;
  getDiagnosticBus(): DiagnosticBus;
  getProjectData(): ProjectData;
  getBacklog(): BacklogEntry[];
  addToBacklog(entry: BacklogEntry): void;
  clearBacklog(): void;

  advance(): Promise<void>;
  rollback(): boolean;
  showToast(message: string): void;
  updateControlsState(): void;
  closeAllModals(): void;
  isAnyModalOpen(): boolean;
  applySideEffect(instr: Instruction): Promise<void>;

  getAssetGraphicResolver(): (assetKey: string) => string | undefined;
  getAssetAudioResolver(): (assetKey: string) => string | undefined;
  checkIsProp(characterId: string): boolean;
}

