/* eslint-disable @typescript-eslint/no-explicit-any */
// ==========================================
// BỘ CHUYỂN ĐỔI CST SANG AST (AST BUILDER - CHEVROTAIN VISITOR)
// ==========================================

import type { IToken } from 'chevrotain';
import type {
  ProgramAST,
  SceneASTNode,
  StatementAST,
  DialogueStatement,
  RevealStatement,
  BackgroundStatement,
  ShowStatement,
  HideStatement,
  PlayStatement,
  StopStatement,
  ChoiceStatement,
  ChoiceOption,
  GotoStatement,
  CallStatement,
  ReturnStatement,
  WhileStatement,
  IfStatement,
  VarAssignStatement,
  SourceLocation,
  NamedPosition,
} from '@vn-engine/shared-types';
import { parserInstance } from './parser';
import { parseExpression } from './expression';

const BaseVNSVisitor = parserInstance.getBaseCstVisitorConstructor();

export function cleanString(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  return raw;
}

export function parseDurationSeconds(val: string): number {
  if (val.endsWith('s')) {
    return parseFloat(val.slice(0, -1));
  }
  return parseFloat(val);
}

export function extractLocation(
  token?: IToken,
  fileId: string = 'main.vns',
): SourceLocation | undefined {
  if (!token) return undefined;
  return {
    fileId,
    line: token.startLine ?? 1,
    col: token.startColumn ?? 1,
  };
}

export function tokensToString(tokens: IToken[]): string {
  return tokens.map(t => t.image).join(' ');
}

export class VNSAstBuilder extends BaseVNSVisitor {
  private currentFileId: string;

  constructor(fileId: string = 'main.vns') {
    super();
    this.currentFileId = fileId;
    this.validateVisitor();
  }

  public setFileId(fileId: string) {
    this.currentFileId = fileId;
  }

  program(ctx: any): ProgramAST {
    const scenes: SceneASTNode[] = [];
    if (ctx.sceneDeclaration) {
      for (const sceneCst of ctx.sceneDeclaration) {
        scenes.push(this.visit(sceneCst));
      }
    }
    return {
      type: 'Program',
      scenes,
    };
  }

  sceneDeclaration(ctx: any): SceneASTNode {
    const nameToken = ctx.Identifier ? ctx.Identifier[0] : ctx.DotIdentifier[0];
    const uiScreenId = ctx.StringLiteral ? cleanString(ctx.StringLiteral[0].image) : undefined;
    const body: StatementAST[] = [];

    if (ctx.statement) {
      for (const stmtCst of ctx.statement) {
        const stmt = this.visit(stmtCst);
        if (stmt) {
          body.push(stmt);
        }
      }
    }

    return {
      type: 'Scene',
      name: nameToken.image,
      uiScreenId,
      body,
      loc: extractLocation(nameToken, this.currentFileId),
    };
  }

  subSceneStatement(ctx: any): SceneASTNode {
    const nameToken = ctx.DotIdentifier[0];
    const uiScreenId = ctx.StringLiteral ? cleanString(ctx.StringLiteral[0].image) : undefined;
    const body: StatementAST[] = [];

    if (ctx.statement) {
      for (const stmtCst of ctx.statement) {
        const stmt = this.visit(stmtCst);
        if (stmt) {
          body.push(stmt);
        }
      }
    }

    return {
      type: 'Scene',
      name: nameToken.image,
      uiScreenId,
      body,
      loc: extractLocation(nameToken, this.currentFileId),
    };
  }

  statement(ctx: any): StatementAST | SceneASTNode {
    if (ctx.subSceneStatement) return this.visit(ctx.subSceneStatement[0]);
    if (ctx.dialogueStatement) return this.visit(ctx.dialogueStatement[0]);
    if (ctx.revealStatement) return this.visit(ctx.revealStatement[0]);
    if (ctx.backgroundStatement) return this.visit(ctx.backgroundStatement[0]);
    if (ctx.showStatement) return this.visit(ctx.showStatement[0]);
    if (ctx.hideStatement) return this.visit(ctx.hideStatement[0]);
    if (ctx.playStatement) return this.visit(ctx.playStatement[0]);
    if (ctx.stopStatement) return this.visit(ctx.stopStatement[0]);
    if (ctx.choiceStatement) return this.visit(ctx.choiceStatement[0]);
    if (ctx.gotoStatement) return this.visit(ctx.gotoStatement[0]);
    if (ctx.callStatement) return this.visit(ctx.callStatement[0]);
    if (ctx.returnStatement) return this.visit(ctx.returnStatement[0]);
    if (ctx.whileStatement) return this.visit(ctx.whileStatement[0]);
    if (ctx.ifStatement) return this.visit(ctx.ifStatement[0]);
    if (ctx.varAssignStatement) return this.visit(ctx.varAssignStatement[0]);

    throw new Error('Loại statement không xác định');
  }

  dialogueStatement(ctx: any): DialogueStatement {
    if (ctx.Identifier) {
      const charToken = ctx.Identifier[0];
      let character: string | null = charToken.image;
      if (character === 'narrator') {
        character = null;
      }

      let displayNameOverride: string | undefined;
      let textToken: IToken;

      if (ctx.As && ctx.StringLiteral) {
        displayNameOverride = cleanString(ctx.StringLiteral[0].image);
        textToken = ctx.StringLiteral[1];
      } else {
        textToken = ctx.StringLiteral[0];
      }

      return {
        type: 'DialogueStatement',
        character,
        text: cleanString(textToken.image),
        displayNameOverride,
        loc: extractLocation(charToken, this.currentFileId),
      };
    } else {
      // Anonymous dialogue
      const textToken = ctx.StringLiteral[0];
      return {
        type: 'DialogueStatement',
        character: null,
        text: cleanString(textToken.image),
        loc: extractLocation(textToken, this.currentFileId),
      };
    }
  }

  revealStatement(ctx: any): RevealStatement {
    const charToken = ctx.Identifier[0];
    const nameToken = ctx.StringLiteral[0];
    return {
      type: 'RevealStatement',
      characterId: charToken.image,
      displayName: cleanString(nameToken.image),
      loc: extractLocation(charToken, this.currentFileId),
    };
  }

  backgroundStatement(ctx: any): BackgroundStatement {
    const assetToken = ctx.Identifier[0];
    const transition = ctx.StringLiteral ? cleanString(ctx.StringLiteral[0].image) : undefined;
    return {
      type: 'BackgroundStatement',
      assetId: assetToken.image,
      transition,
      loc: extractLocation(assetToken, this.currentFileId),
    };
  }

  showStatement(ctx: any): ShowStatement {
    const charToken = ctx.Identifier[0];
    let sprite = '';
    if (ctx.DotIdentifier) {
      sprite = ctx.DotIdentifier[0].image.slice(1);
    } else if (ctx.Identifier && ctx.Identifier[1]) {
      sprite = ctx.Identifier[1].image;
    }
    let position: NamedPosition | undefined;
    let transition: string | undefined;
    let duration: number | undefined;

    if (ctx.showArgument) {
      for (const argCst of ctx.showArgument) {
        const argRes = this.visit(argCst);
        if (argRes.position) position = argRes.position;
        if (argRes.transition) transition = argRes.transition;
        if (argRes.duration !== undefined) duration = argRes.duration;
      }
    }

    return {
      type: 'ShowStatement',
      character: charToken.image,
      sprite,
      position,
      transition,
      duration,
      loc: extractLocation(charToken, this.currentFileId),
    };
  }

  showArgument(ctx: any): any {
    if (ctx.Position) {
      return { position: cleanString(ctx.StringLiteral[0].image) as NamedPosition };
    }
    if (ctx.Transition) {
      return { transition: cleanString(ctx.StringLiteral[0].image) };
    }
    if (ctx.Duration) {
      const durToken = ctx.DurationLiteral ? ctx.DurationLiteral[0] : ctx.NumberLiteral[0];
      return { duration: parseDurationSeconds(durToken.image) };
    }
    return {};
  }

  hideStatement(ctx: any): HideStatement {
    const charToken = ctx.Identifier[0];
    return {
      type: 'HideStatement',
      character: charToken.image,
      loc: extractLocation(charToken, this.currentFileId),
    };
  }

  playStatement(ctx: any): PlayStatement {
    const channelToken = ctx.Identifier[0];
    const assetToken = ctx.StringLiteral[0];
    let volume: number | undefined;
    let loop: boolean | undefined;
    let fadeIn: number | undefined;

    if (ctx.playArgument) {
      for (const argCst of ctx.playArgument) {
        const argRes = this.visit(argCst);
        if (argRes.volume !== undefined) volume = argRes.volume;
        if (argRes.loop !== undefined) loop = argRes.loop;
        if (argRes.fadeIn !== undefined) fadeIn = argRes.fadeIn;
      }
    }

    return {
      type: 'PlayStatement',
      channel: channelToken.image,
      assetId: cleanString(assetToken.image),
      volume,
      loop,
      fadeIn,
      loc: extractLocation(channelToken, this.currentFileId),
    };
  }

  playArgument(ctx: any): any {
    if (ctx.Volume) {
      return { volume: parseFloat(ctx.NumberLiteral[0].image) };
    }
    if (ctx.Loop) {
      return { loop: !!ctx.True };
    }
    if (ctx.FadeIn) {
      const token = ctx.DurationLiteral ? ctx.DurationLiteral[0] : ctx.NumberLiteral[0];
      return { fadeIn: parseDurationSeconds(token.image) };
    }
    return {};
  }

  stopStatement(ctx: any): StopStatement {
    const channelToken = ctx.Identifier[0];
    let fadeOut: number | undefined;

    if (ctx.FadeOut) {
      const token = ctx.DurationLiteral ? ctx.DurationLiteral[0] : ctx.NumberLiteral[0];
      fadeOut = parseDurationSeconds(token.image);
    }

    return {
      type: 'StopStatement',
      channel: channelToken.image,
      fadeOut,
      loc: extractLocation(channelToken, this.currentFileId),
    };
  }

  gotoStatement(ctx: any): GotoStatement {
    const targetToken = ctx.DotIdentifier ? ctx.DotIdentifier[0] : ctx.Identifier[0];
    return {
      type: 'GotoStatement',
      targetScene: targetToken.image,
      loc: extractLocation(targetToken, this.currentFileId),
    };
  }

  callStatement(ctx: any): CallStatement {
    const targetToken = ctx.DotIdentifier ? ctx.DotIdentifier[0] : ctx.Identifier[0];
    return {
      type: 'CallStatement',
      targetScene: targetToken.image,
      loc: extractLocation(targetToken, this.currentFileId),
    };
  }

  returnStatement(ctx: any): ReturnStatement {
    return {
      type: 'ReturnStatement',
      loc: extractLocation(ctx.Return[0], this.currentFileId),
    };
  }

  choiceStatement(ctx: any): ChoiceStatement {
    const choices: ChoiceOption[] = [];
    const uiScreenId = ctx.StringLiteral ? cleanString(ctx.StringLiteral[0].image) : undefined;

    if (ctx.choiceOption) {
      for (const optCst of ctx.choiceOption) {
        choices.push(this.visit(optCst));
      }
    }

    return {
      type: 'ChoiceStatement',
      choices,
      uiScreenId,
      loc: extractLocation(ctx.Choice[0], this.currentFileId),
    };
  }

  choiceOption(ctx: any): ChoiceOption {
    let condition: any = undefined;
    if (ctx.If && ctx.condition) {
      const exprStr = this.visit(ctx.condition[0]);
      const loc = extractLocation(ctx.If[0], this.currentFileId);
      condition = parseExpression(exprStr, loc);
    }

    const direct = this.visit(ctx.choiceDirectOption[0]);
    return {
      text: direct.text,
      targetScene: direct.targetScene,
      condition,
      loc: direct.loc,
    };
  }

  choiceDirectOption(ctx: any): { text: string; targetScene: string; loc?: SourceLocation } {
    const textToken = ctx.StringLiteral[0];
    const targetToken = ctx.DotIdentifier ? ctx.DotIdentifier[0] : ctx.Identifier[0];
    return {
      text: cleanString(textToken.image),
      targetScene: targetToken.image,
      loc: extractLocation(textToken, this.currentFileId),
    };
  }

  whileStatement(ctx: any): WhileStatement {
    const exprStr = this.visit(ctx.condition[0]);
    const whileToken = ctx.While[0];
    const loc = extractLocation(whileToken, this.currentFileId);
    const condition = parseExpression(exprStr, loc);

    const body: StatementAST[] = [];
    if (ctx.statement) {
      for (const stmtCst of ctx.statement) {
        const stmt = this.visit(stmtCst);
        if (stmt) body.push(stmt);
      }
    }

    return {
      type: 'WhileStatement',
      condition,
      body,
      loc,
    };
  }

  ifStatement(ctx: any): IfStatement {
    const exprStr = this.visit(ctx.condition[0]);
    const ifToken = ctx.If[0];
    const loc = extractLocation(ifToken, this.currentFileId);
    const condition = parseExpression(exprStr, loc);

    const consequent: StatementAST[] = [];
    if (ctx.consequent) {
      for (const stmtCst of ctx.consequent) {
        const stmt = this.visit(stmtCst);
        if (stmt) consequent.push(stmt);
      }
    }

    let alternate: StatementAST[] | IfStatement | undefined;
    if (ctx.elseIf) {
      alternate = this.visit(ctx.elseIf[0]);
    } else if (ctx.alternate) {
      alternate = [];
      for (const stmtCst of ctx.alternate) {
        const stmt = this.visit(stmtCst);
        if (stmt) alternate.push(stmt);
      }
    }

    return {
      type: 'IfStatement',
      condition,
      consequent,
      alternate,
      loc,
    };
  }

  varAssignStatement(ctx: any): VarAssignStatement {
    const varToken = ctx.Identifier[0];
    const exprStr = this.visit(ctx.value[0]);
    const loc = extractLocation(ctx.Tilde[0], this.currentFileId);
    const value = parseExpression(exprStr, loc);

    return {
      type: 'VarAssignStatement',
      variable: varToken.image,
      value,
      loc,
    };
  }

  expressionSequence(ctx: any): string {
    const tokens: IToken[] = [];
    if (ctx.expressionToken) {
      for (const tokCst of ctx.expressionToken) {
        const tok = this.visit(tokCst);
        if (tok) tokens.push(tok);
      }
    }
    return tokensToString(tokens);
  }

  expressionToken(ctx: any): IToken {
    // Trả về token đầu tiên trong children của expressionToken
    const firstKey = Object.keys(ctx)[0];
    return ctx[firstKey!][0];
  }
}
