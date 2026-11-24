import type {
  DialogueInstruction,
  ChoiceInstruction,
  WaitInstruction,
  PauseInstruction,
  Instruction,
  PlayInstruction,
} from '@vn-engine/shared-types';
import type { CatchUpVisualState } from '@vn-engine/renderer';

export type PlayerMode = 'TITLE' | 'GAMEPLAY' | 'INSPECT' | 'STANDBY' | 'HALTED';
export type TextPlaybackMode = 'NORMAL' | 'AUTO' | 'SKIP';

export type DialogueFontSize = 'small' | 'medium' | 'large';

export interface PlayerSettingsData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  isMuted: boolean;
  textSpeed: number;
  autoDelayMs: number;
  fontSize: DialogueFontSize;
  boxOpacity: number;
  stageScaleMode: 'auto' | 'native';
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettingsData = {
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

/** Cấu hình title đã được phân giải thành URL/key, kernel không biết gì về AssetRef. */
export interface TitleScreenConfig {
  /** Fallback 'Visual Novel'. */
  title: string;
  version?: string;
  backgroundUrl?: string;
  logoUrl?: string;
  /** Key mà AudioAdapter.playMusic hiểu được. */
  bgmTrack?: string;
}

export type ToastTone = 'success' | 'info' | 'error';

export interface AudioAdapterContract {
  playMusic?(track: string, options?: { loop?: boolean; fadeInMs?: number }): Promise<void>;
  stopMusic?(fadeOutMs?: number): Promise<void>;
  playSound?(effect: string, options?: { volume?: number }): Promise<void>;
  playVoice(voiceFile: string): void | Promise<void>;
  stopVoice(): void;
  stopAll(): void;
  setVolume(channel: 'master' | 'music' | 'sound' | 'voice' | string, volume: number): void;
  applySideEffect(effect: Instruction): void;
  syncStateCatchUp(effects: Map<string, PlayInstruction>): void;
}

export type StepResult =
  | { type: 'SUSPEND_DIALOGUE'; instruction: DialogueInstruction }
  | { type: 'SUSPEND_CHOICE'; instruction: ChoiceInstruction }
  | { type: 'SUSPEND_WAIT'; instruction: WaitInstruction; duration: number }
  | { type: 'SUSPEND_PAUSE'; instruction: PauseInstruction }
  | { type: 'SIDE_EFFECT'; instruction: Instruction }
  | { type: 'HALTED' };

export interface AudioChannelState {
  masterVolume: number;
  channelVolumes: Record<string, number>;
  isMuted: boolean;
  currentTracks: Record<string, string | undefined>;
}

export interface SaveSlotData {
  slotIndex: number;
  timestamp: number;
  thumbnailDataUrl: string;
  currentScene: string;
  previewText: string;
  speakerName?: string;
  dialogueCounter: number;
  serializedState: string;
  scriptHash?: string;
}

export interface BacklogEntry {
  id: string;
  speakerName?: string;
  speakerColorHex?: string;
  text: string;
  voiceAssetId?: string;
  timestamp: number;
}

export interface TypewriterSegment {
  text: string;
  color?: string;
  pauseAfterMs?: number;
  speedMultiplier?: number;
}

export interface BacklogTextSegment {
  text: string;
  color?: string;
}

export interface DesyncModalData {
  slotIndex: number;
  currentHash: string;
  saveHash: string;
  sceneName: string;
}

export interface PlayerViewState {
  mode: PlayerMode;
  playbackMode: TextPlaybackMode;
  isControlsHidden: boolean;
  isCleanArtMode: boolean;
  isAwaitingPauseAdvance: boolean;
  dialogue: {
    isVisible: boolean;
    speakerName?: string;
    speakerColorHex?: string;
    rawText: string;
    isComplete: boolean;
    canAdvance: boolean;
    isSeen: boolean;
  };
  activeChoices: Array<{
    text: string;
    targetScene: string;
    isSatisfied: boolean;
  }> | null;
  activeInspectModal: {
    assetUrl: string;
    title?: string;
  } | null;
  activeModal: 'none' | 'save' | 'load' | 'backlog' | 'settings' | 'inspect' | 'desync';
  settings: {
    textSpeed: number;
    autoDelayMs: number;
    fontSize: DialogueFontSize;
    boxOpacity: number;
  };
  activeToast: {
    message: string;
    id: number;
    tone: ToastTone;
  } | null;
  titleConfig: TitleScreenConfig;
  hasSaveData: boolean;
  pendingConfirm: 'quick_load_overwrite' | null;
  audio: AudioChannelState;
  backlog: BacklogEntry[];
  saveSlots: Array<SaveSlotData | null>;
  quickSaveSlot: SaveSlotData | null;
  desyncData?: DesyncModalData;
}

export interface KernelAdapters {
  renderer?: {
    applySideEffect: (instr: Instruction) => Promise<void>;
    syncStateCatchUp: (catchUp: CatchUpVisualState) => Promise<void>;
    captureThumbnail?: () => Promise<string>;
  };
  audio?: {
    applySideEffect: (instr: Instruction) => void;
    syncStateCatchUp: (activeAudio: Map<string, PlayInstruction>) => void;
    stopVoice: () => void;
    stopAll?: () => void;
    setVolume?: (channel: string, volume: number) => void;
    setMute?: (muted: boolean) => void;
    playVoice?: (assetId: string) => void;
    playMusic?: (track: string, options?: { loop?: boolean; fadeInMs?: number }) => Promise<void>;
    stopMusic?: (fadeOutMs?: number) => Promise<void>;
  };
  storage?: {
    getSeenDialogues: () => Set<string>;
    saveSeenDialogue: (key: string) => void;
    saveSeenDialogues?: (seen: Set<string>) => void;
    getSlots?: () => Array<SaveSlotData | null>;
    getQuickSave?: () => SaveSlotData | null;
    saveSlot?: (data: SaveSlotData) => Promise<void>;
    loadSlot?: (slotIndex: number) => Promise<SaveSlotData | null>;
    getSettings?: () => PlayerSettingsData;
    saveSettings?: (settings: Partial<PlayerSettingsData>) => void;
    deleteSlot?: (slotIndex: number) => Promise<void>;
    getMostRecentSave?: () => SaveSlotData | null;
  };
}

export interface PlayerUIActions {
  startNewGame: () => void;
  returnToTitle: () => void;
  advance: () => void;
  completeDialogue: () => void;
  selectChoice: (index: number) => void;
  rollback: () => void;
  toggleAuto: () => void;
  toggleSkip: () => void;
  toggleHideControls: () => void;
  toggleCleanArt: () => void;
  toggleMute: () => void;
  openModal: (modal: 'save' | 'load' | 'backlog' | 'settings') => void;
  closeModal: () => void;
  closeInspect: () => void;
  setAudioVolume: (channel: string, volume: number) => void;
  setTextSpeed: (charsPerSec: number) => void;
  setAutoDelay: (delayMs: number) => void;
  setFontSize: (size: DialogueFontSize) => void;
  setBoxOpacity: (opacity: number) => void;
  restoreDefaultSettings: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  saveSlot: (slotIndex: number) => Promise<void>;
  loadSlot: (slotIndex: number) => Promise<void>;
  quickSave: () => Promise<void>;
  quickLoad: () => Promise<void>;
  replayVoice: (assetId: string) => void;
  resolveDesync: (choice: 'continue' | 'restart' | 'cancel') => void;
  continueGame: () => Promise<void>;
  deleteSlot: (slotIndex: number) => Promise<void>;
  confirmPending: () => Promise<void>;
  cancelPending: () => void;
  unlockAudio: () => void;
}

export interface PlayerUIContract {
  state: PlayerViewState;
  actions: PlayerUIActions;
}

export interface VNRuntimeKernelOptions {
  initialMode?: PlayerMode;
  projectId?: string;
  titleConfig?: Partial<TitleScreenConfig>;
  entryScene?: string;
}

export interface LoadProgramOptions {
  scene?: string;
  line?: number;
  preserveState?: boolean;
  projectId?: string;
  assets?: unknown[];
  startAtTitle?: boolean;
  /** Đang ở TITLE thì bắt đầu game ngay (người dùng bấm Play ở chế độ Scene). */
  startGameplay?: boolean;
}

// Lỗi dùng chung giữa kernel và StorageAdapter: đặt ở contracts để core
// không phụ thuộc vào một adapter cụ thể.
/** Ném khi localStorage đầy quota; KHÔNG bật memory fallback (TASK-PLY-SAVEFIX). */
export class StorageQuotaError extends Error {
  public readonly key: string;

  constructor(key: string) {
    super(`Storage quota exceeded while writing "${key}"`);
    this.key = key;
    this.name = 'StorageQuotaError';
  }
}
