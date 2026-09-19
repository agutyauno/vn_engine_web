// ==========================================
// TRẠNG THÁI MÁY ẢO & ROLLBACK (VM STATE & RUNTIME CONTRACTS)
// ==========================================

import type { Instruction } from './instruction';

export interface CallFrame {
  scene: string;
  ip: number;
}

export interface VMState {
  currentScene: string;
  instructionPointer: number;
  callStack: CallFrame[];
  variables: Record<string, string | number | boolean>;
  characterDisplayOverrides: Record<string, string>; // characterId -> revealedName (ADR-020)
  customScriptState: Record<string, string>; // screenId -> validated JSON
}

export type StepResult =
  | { type: 'SUSPEND_DIALOGUE'; instruction: Instruction }
  | { type: 'SUSPEND_CHOICE'; instruction: Instruction }
  | { type: 'SIDE_EFFECT'; instruction: Instruction }
  | { type: 'HALTED' };

export interface VMSnapshot {
  timestamp: number;
  dialogueIndex: number; // Chỉ mục câu thoại (chỉ chụp snapshot khi gặp SUSPEND_DIALOGUE)
  state: VMState; // Clone sâu (JSON pure)
}

export const CURRENT_SAVE_VERSION = 1;

export interface SaveFileData {
  version: number;
  dslVersion?: string;
  timestamp: number;
  state: VMState;
  dialogueCounter: number;
}

