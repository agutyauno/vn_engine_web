// ==========================================
// TẬP LỆNH TRUNG GIAN (INSTRUCTION SET / IR — ADR-021)
// ==========================================

import type { ExpressionAST, TransformProperties, MotionProperties } from './ast';
import type { NamedPosition, CoordinatePosition, SourceLocation } from './common';

export interface BaseInstruction {
  loc?: SourceLocation; // Phục vụ Live Debugger / Highlight con trỏ và Breakpoint trên Monaco Editor
}

export interface DialogueInstruction extends BaseInstruction {
  type: 'DIALOGUE';
  character: string | null;
  text: string;
  displayNameOverride?: string;
  uiScreenId?: string;
}

export interface RevealInstruction extends BaseInstruction {
  type: 'REVEAL';
  characterId: string;
  displayName: string;
}

export interface BackgroundInstruction
  extends BaseInstruction, TransformProperties, MotionProperties {
  type: 'BACKGROUND';
  assetId: string;
}

export interface ShowInstruction extends BaseInstruction, TransformProperties, MotionProperties {
  type: 'SHOW';
  character: string;
  sprite: string;
  position?: NamedPosition | CoordinatePosition;
}

export interface HideInstruction extends BaseInstruction {
  type: 'HIDE';
  character: string;
}

export interface HideDialogueInstruction extends BaseInstruction {
  type: 'HIDE_DIALOGUE';
}

export interface PlayInstruction extends BaseInstruction {
  type: 'PLAY';
  channel: string;
  assetId: string;
  volume?: number;
  fadeIn?: number;
  loop?: boolean;
}

export interface StopInstruction extends BaseInstruction {
  type: 'STOP';
  channel: string;
  fadeOut?: number;
}

export interface ChoiceInstruction extends BaseInstruction {
  type: 'CHOICE';
  choices: Array<{ text: string; targetScene: string; condition?: ExpressionAST }>;
  uiScreenId?: string;
}

export interface GotoInstruction extends BaseInstruction {
  type: 'GOTO';
  targetScene: string;
}

export interface ConditionalGotoInstruction extends BaseInstruction {
  type: 'CONDITIONAL_GOTO';
  condition: ExpressionAST;
  targetScene: string;
}

export interface LoopStartInstruction extends BaseInstruction {
  type: 'LOOP_START';
  condition: ExpressionAST;
  loopEndTargetScene: string;
}

export interface LoopEndInstruction extends BaseInstruction {
  type: 'LOOP_END';
  loopStartTargetScene: string;
}

export interface CallInstruction extends BaseInstruction {
  type: 'CALL';
  targetScene: string;
}

export interface ReturnInstruction extends BaseInstruction {
  type: 'RETURN';
}

export interface HaltInstruction extends BaseInstruction {
  type: 'HALT';
}

export interface SceneEndInstruction extends BaseInstruction {
  type: 'SCENE_END';
  sceneName: string;
}

export interface AssignInstruction extends BaseInstruction {
  type: 'ASSIGN';
  variable: string;
  value: ExpressionAST;
  scope?: 'global' | 'local';
}

export interface LabelInstruction extends BaseInstruction {
  type: 'LABEL';
  name: string;
}

export interface RunScriptInstruction extends BaseInstruction {
  type: 'RUN_SCRIPT';
  screenId: string;
}

export interface SpawnScriptInstruction extends BaseInstruction {
  type: 'SPAWN_SCRIPT';
  screenId: string;
}

export interface SceneInstruction extends BaseInstruction {
  type: 'SCENE';
  name: string;
}

export interface WaitInstruction extends BaseInstruction {
  type: 'WAIT';
  duration: number; // in seconds
}

export type Instruction =
  | DialogueInstruction
  | RevealInstruction
  | BackgroundInstruction
  | ShowInstruction
  | HideInstruction
  | HideDialogueInstruction
  | PlayInstruction
  | StopInstruction
  | ChoiceInstruction
  | GotoInstruction
  | ConditionalGotoInstruction
  | LoopStartInstruction
  | LoopEndInstruction
  | CallInstruction
  | ReturnInstruction
  | WaitInstruction
  | HaltInstruction
  | SceneEndInstruction
  | AssignInstruction
  | LabelInstruction
  | RunScriptInstruction
  | SpawnScriptInstruction
  | SceneInstruction;
