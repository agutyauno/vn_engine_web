// ==========================================
// TRẠNG THÁI MÁY ẢO & ROLLBACK (VM STATE & RUNTIME CONTRACTS)
// ==========================================

import type {
  Instruction,
  WaitInstruction,
  BackgroundInstruction,
  ShowInstruction,
  PlayInstruction,
  DialogueInstruction,
} from './instruction';

export interface CallFrame {
  scene: string;
  ip: number;
  targetScene?: string;
  savedLocalVariables?: Record<string, string | number | boolean>;
}

export interface VMState {
  currentScene: string;
  instructionPointer: number;
  callStack: CallFrame[];
  variables: Record<string, string | number | boolean>;
  localVariables: Record<string, string | number | boolean>;
  characterDisplayOverrides: Record<string, string>; // characterId -> revealedName (ADR-020)
  customScriptState: Record<string, string>; // screenId -> validated JSON
  activeInspect?: { assetId: string; title?: string } | null;
  activeBackground?: BackgroundInstruction;
  activeSprites?: Record<string, ShowInstruction>;
  activeAudio?: Record<string, PlayInstruction>;
  currentDialogue?: DialogueInstruction;
}

export type StepResult =
  | { type: 'SUSPEND_DIALOGUE'; instruction: Instruction }
  | { type: 'SUSPEND_CHOICE'; instruction: Instruction }
  | { type: 'SUSPEND_WAIT'; instruction: WaitInstruction; duration: number }
  | { type: 'SIDE_EFFECT'; instruction: Instruction }
  | { type: 'HALTED' };

export interface VMSnapshot {
  timestamp: number;
  dialogueIndex: number; // Chỉ mục câu thoại
  state: VMState; // Clone sâu (JSON pure)
  interactionType?: 'DIALOGUE' | 'CHOICE';
}

export const CURRENT_SAVE_VERSION = 2;

export interface SaveFileData {
  version: number;
  projectId?: string;
  scriptHash?: string;
  sceneOffset?: number;
  backlog?: Array<{ speaker?: string | null; text: string }>;
  dslVersion?: string;
  timestamp: number;
  state: VMState;
  dialogueCounter: number;
}
