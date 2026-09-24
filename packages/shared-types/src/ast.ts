// ==========================================
// ĐẶC TẢ CÂY CÚ PHÁP TRỪU TƯỢNG (AST - ABSTRACT SYNTAX TREE)
// ==========================================

import type { NamedPosition, CoordinatePosition, SourceLocation } from './common';

// -----------------------------------------------------------------------------
// 1. Biểu thức (Expression AST - dựa trên cấu trúc chuẩn của jsep)
// -----------------------------------------------------------------------------

export type ExpressionAST =
  LiteralExpression | IdentifierExpression | BinaryExpression | UnaryExpression | CallExpression;

export interface LiteralExpression {
  type: 'Literal';
  value: string | number | boolean | null;
  raw?: string;
}

export interface IdentifierExpression {
  type: 'Identifier';
  name: string;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: string; // "+", "-", "*", "/", "==", "!=", "<", "<=", ">", ">=", "&&", "||"
  left: ExpressionAST;
  right: ExpressionAST;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: string; // "!", "-"
  argument: ExpressionAST;
  prefix: boolean;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: IdentifierExpression;
  arguments: ExpressionAST[];
}

// -----------------------------------------------------------------------------
// 2. Các nút câu lệnh (Statement AST Nodes)
// -----------------------------------------------------------------------------

export interface BaseASTNode {
  loc?: SourceLocation;
}

export type StatementAST =
  | DialogueStatement
  | RevealStatement
  | BackgroundStatement
  | ShowStatement
  | HideStatement
  | HideDialogueStatement
  | PlayStatement
  | StopStatement
  | ChoiceStatement
  | GotoStatement
  | CallStatement
  | ReturnStatement
  | EndStatement
  | WaitStatement
  | IfStatement
  | WhileStatement
  | VarDefineStatement
  | VarAssignStatement
  | RunScriptStatement
  | SpawnScriptStatement;

export interface WaitStatement extends BaseASTNode {
  type: 'WaitStatement';
  duration: number; // in seconds
}

export interface DialogueStatement extends BaseASTNode {
  type: 'DialogueStatement';
  character: string | null;
  text: string;
  displayNameOverride?: string;
  uiScreenId?: string;
}

export interface RevealStatement extends BaseASTNode {
  type: 'RevealStatement';
  characterId: string;
  displayName: string;
}

export interface TransformProperties {
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number; // degrees
  flipX?: boolean;
  flipY?: boolean;
  x?: number;
  y?: number;
  offsetX?: number;
  offsetY?: number;
  alpha?: number;
}

export interface MotionProperties {
  transition?: string;
  easing?: string;
  duration?: number;
}

export interface BackgroundStatement extends BaseASTNode, TransformProperties, MotionProperties {
  type: 'BackgroundStatement';
  assetId: string;
}

export interface ShowStatement extends BaseASTNode, TransformProperties, MotionProperties {
  type: 'ShowStatement';
  character: string;
  sprite: string;
  position?: NamedPosition | CoordinatePosition;
}

export interface HideStatement extends BaseASTNode {
  type: 'HideStatement';
  character: string;
}

export interface HideDialogueStatement extends BaseASTNode {
  type: 'HideDialogueStatement';
}

export interface PlayStatement extends BaseASTNode {
  type: 'PlayStatement';
  channel: string; // "music", "sound", "voice", ...
  assetId: string;
  volume?: number;
  fadeIn?: number;
  loop?: boolean;
}

export interface StopStatement extends BaseASTNode {
  type: 'StopStatement';
  channel: string;
  fadeOut?: number;
}

export interface ChoiceOption {
  text: string;
  targetScene: string;
  condition?: ExpressionAST;
  loc?: SourceLocation;
}

export interface ChoiceStatement extends BaseASTNode {
  type: 'ChoiceStatement';
  choices: ChoiceOption[];
  uiScreenId?: string;
}

export interface GotoStatement extends BaseASTNode {
  type: 'GotoStatement';
  targetScene: string;
}

export interface CallStatement extends BaseASTNode {
  type: 'CallStatement';
  targetScene: string;
}

export interface ReturnStatement extends BaseASTNode {
  type: 'ReturnStatement';
}

export interface EndStatement extends BaseASTNode {
  type: 'EndStatement';
}

export interface IfStatement extends BaseASTNode {
  type: 'IfStatement';
  condition: ExpressionAST;
  consequent: StatementAST[];
  alternate?: StatementAST[] | IfStatement; // else if chaining
}

export interface WhileStatement extends BaseASTNode {
  type: 'WhileStatement';
  condition: ExpressionAST;
  body: StatementAST[];
}

export interface VarDefineStatement extends BaseASTNode {
  type: 'VarDefineStatement';
  variable: string;
  value: ExpressionAST;
}

export interface VarAssignStatement extends BaseASTNode {
  type: 'VarAssignStatement';
  variable: string;
  value: ExpressionAST;
}

export interface RunScriptStatement extends BaseASTNode {
  type: 'RunScriptStatement';
  screenId: string;
}

export interface SpawnScriptStatement extends BaseASTNode {
  type: 'SpawnScriptStatement';
  screenId: string;
}

export interface SceneASTNode extends BaseASTNode {
  type: 'Scene';
  name: string; // e.g., "chapter1_alice_route" or ".ask_question"
  uiScreenId?: string;
  body: StatementAST[];
}

export interface ProgramAST {
  type: 'Program';
  topLevelStatements?: StatementAST[];
  scenes: SceneASTNode[];
}
