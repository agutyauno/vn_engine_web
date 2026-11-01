import type {
  DialogueInstruction,
  ChoiceInstruction,
  WaitInstruction,
  Instruction,
  PlayInstruction,
} from '@vn-engine/shared-types';
import type { CatchUpVisualState } from '@vn-engine/renderer';

export type PlayerMode = 'TITLE' | 'GAMEPLAY' | 'INSPECT' | 'STANDBY' | 'HALTED';
export type TextPlaybackMode = 'NORMAL' | 'AUTO' | 'SKIP';

export type StepResult =
  | { type: 'SUSPEND_DIALOGUE'; instruction: DialogueInstruction }
  | { type: 'SUSPEND_CHOICE'; instruction: ChoiceInstruction }
  | { type: 'SUSPEND_WAIT'; instruction: WaitInstruction; duration: number }
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
  };
  activeToast: {
    message: string;
    id: number;
  } | null;
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
    setVolume?: (channel: string, volume: number) => void;
    setMute?: (muted: boolean) => void;
    playVoice?: (assetId: string) => void;
  };
  storage?: {
    getSeenDialogues: () => Set<string>;
    saveSeenDialogue: (key: string) => void;
    saveSeenDialogues?: (seen: Set<string>) => void;
    getSlots?: () => Array<SaveSlotData | null>;
    getQuickSave?: () => SaveSlotData | null;
    saveSlot?: (data: SaveSlotData) => Promise<void>;
    loadSlot?: (slotIndex: number) => Promise<SaveSlotData | null>;
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
  showToast: (message: string) => void;
  saveSlot: (slotIndex: number) => Promise<void>;
  loadSlot: (slotIndex: number) => Promise<void>;
  quickSave: () => Promise<void>;
  quickLoad: () => Promise<void>;
  replayVoice: (assetId: string) => void;
  resolveDesync: (choice: 'continue' | 'restart' | 'cancel') => void;
}

export interface PlayerUIContract {
  state: PlayerViewState;
  actions: PlayerUIActions;
}
