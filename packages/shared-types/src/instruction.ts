// ==========================================
// TẬP LỆNH TRUNG GIAN (INSTRUCTION SET / IR — ADR-021)
// ==========================================

import type { ExpressionAST } from './ast';
import type { NamedPosition, CoordinatePosition, SourceLocation } from './common';

export interface BaseInstruction {
  loc?: SourceLocation; // Phục vụ Live Debugger / Highlight con trỏ và Breakpoint trên Monaco Editor
}

export type Instruction = BaseInstruction &
  (
    | {
        type: 'DIALOGUE';
        character: string | null;
        text: string;
        displayNameOverride?: string;
        uiScreenId?: string;
      }
    | { type: 'REVEAL'; characterId: string; displayName: string }
    | { type: 'BACKGROUND'; assetId: string; transition?: string }
    | {
        type: 'SHOW';
        character: string;
        sprite: string;
        position?: NamedPosition | CoordinatePosition;
        transition?: string;
        duration?: number;
      }
    | { type: 'HIDE'; character: string }
    | {
        type: 'PLAY';
        channel: string;
        assetId: string;
        volume?: number;
        fadeIn?: number;
        loop?: boolean;
      }
    | { type: 'STOP'; channel: string; fadeOut?: number }
    | {
        type: 'CHOICE';
        choices: Array<{ text: string; targetScene: string; condition?: ExpressionAST }>;
        uiScreenId?: string;
      }
    | { type: 'GOTO'; targetScene: string }
    | { type: 'CONDITIONAL_GOTO'; condition: ExpressionAST; targetScene: string }
    | { type: 'LOOP_START'; condition: ExpressionAST; loopEndTargetScene: string }
    | { type: 'LOOP_END'; loopStartTargetScene: string }
    | { type: 'CALL'; targetScene: string }
    | { type: 'RETURN' }
    | { type: 'ASSIGN'; variable: string; value: ExpressionAST }
    | { type: 'RUN_SCRIPT'; screenId: string }
    | { type: 'SPAWN_SCRIPT'; screenId: string }
    | { type: 'SCENE'; name: string }
  );
