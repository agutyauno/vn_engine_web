// ==========================================
// TẦNG PHÂN TÍCH CÚ PHÁP (STATEMENT PARSER - CHEVROTAIN)
// ==========================================

import { CstParser } from 'chevrotain';
import {
  allTokens,
  Scene,
  As,
  Reveal,
  Background,
  Show,
  Hide,
  Play,
  Stop,
  Choice,
  Goto,
  Call,
  Return,
  End,
  If,
  Else,
  While,
  Wait,
  Define,
  Dialogue,
  Inspect,
  Title,
  Volume,
  FadeIn,
  FadeOut,
  Position,
  Transition,
  Duration,
  Loop,
  Ui,
  True,
  False,
  Scale,
  ScaleX,
  ScaleY,
  Rotate,
  FlipX,
  FlipY,
  CoordX,
  CoordY,
  OffsetX,
  OffsetY,
  Alpha,
  Easing,
  Tilde,
  Colon,
  Dot,
  Comma,
  Equals,
  LCurly,
  RCurly,
  LParen,
  RParen,
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  Less,
  Greater,
  LessEquals,
  GreaterEquals,
  DoubleEquals,
  NotEquals,
  And,
  Or,
  Exclamation,
  DotIdentifier,
  AlphanumericIdentifier,
  Identifier,
  DurationLiteral,
  NumberLiteral,
  StringLiteral,
} from './lexer';

export class VNSParser extends CstParser {
  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      nodeLocationTracking: 'full',
    });
    this.performSelfAnalysis();
  }

  // ---------------------------------------------------------------------------
  // Helper Identifiers & Targets
  // ---------------------------------------------------------------------------
  public variableIdentifier = this.RULE('variableIdentifier', () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(CoordX) },
      { ALT: () => this.CONSUME(CoordY) },
      { ALT: () => this.CONSUME(Scale) },
      { ALT: () => this.CONSUME(ScaleX) },
      { ALT: () => this.CONSUME(ScaleY) },
      { ALT: () => this.CONSUME(Rotate) },
      { ALT: () => this.CONSUME(Alpha) },
      { ALT: () => this.CONSUME(Title) },
      { ALT: () => this.CONSUME(Volume) },
      { ALT: () => this.CONSUME(Duration) },
      { ALT: () => this.CONSUME(Loop) },
      { ALT: () => this.CONSUME(Position) },
      { ALT: () => this.CONSUME(Transition) },
      { ALT: () => this.CONSUME(Ui) },
      { ALT: () => this.CONSUME(End) },
    ]);
  });

  public sceneTarget = this.RULE('sceneTarget', () => {
    this.OR([
      { ALT: () => this.CONSUME(DotIdentifier) },
      {
        ALT: () => {
          this.OR1([
            { ALT: () => this.CONSUME(Identifier) },
            { ALT: () => this.CONSUME(NumberLiteral) },
            { ALT: () => this.CONSUME(AlphanumericIdentifier) },
          ]);
          this.OPTION(() => {
            this.CONSUME2(DotIdentifier);
          });
        },
      },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Top-level Program & Scene
  // ---------------------------------------------------------------------------
  public program = this.RULE('program', () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.varDefineStatement) },
        { ALT: () => this.SUBRULE(this.sceneDeclaration) },
      ]);
    });
  });

  public sceneDeclaration = this.RULE('sceneDeclaration', () => {
    this.CONSUME(Scene);
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(DotIdentifier) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(AlphanumericIdentifier) },
    ]);
    this.OPTION(() => {
      this.CONSUME(Ui);
      this.CONSUME(Colon);
      this.CONSUME(StringLiteral);
    });
    this.CONSUME(LCurly);
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
    this.CONSUME(RCurly);
  });

  // ---------------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------------
  public statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.subSceneStatement) },
      {
        GATE: () => {
          if (this.LA(1).tokenType === End) {
            return this.LA(2).tokenType === Colon || this.LA(2).tokenType === As;
          }
          return true;
        },
        ALT: () => this.SUBRULE(this.dialogueStatement),
      },
      { ALT: () => this.SUBRULE(this.revealStatement) },
      { ALT: () => this.SUBRULE(this.backgroundStatement) },
      { ALT: () => this.SUBRULE(this.showStatement) },
      { ALT: () => this.SUBRULE(this.hideStatement) },
      { ALT: () => this.SUBRULE(this.inspectStatement) },
      { ALT: () => this.SUBRULE(this.playStatement) },
      { ALT: () => this.SUBRULE(this.stopStatement) },
      { ALT: () => this.SUBRULE(this.choiceStatement) },
      { ALT: () => this.SUBRULE(this.gotoStatement) },
      { ALT: () => this.SUBRULE(this.callStatement) },
      { ALT: () => this.SUBRULE(this.returnStatement) },
      {
        GATE: () => this.LA(2).tokenType !== Colon && this.LA(2).tokenType !== As,
        ALT: () => this.SUBRULE(this.endStatement),
      },
      { ALT: () => this.SUBRULE(this.waitStatement) },
      { ALT: () => this.SUBRULE(this.whileStatement) },
      { ALT: () => this.SUBRULE(this.ifStatement) },
      { ALT: () => this.SUBRULE(this.varDefineStatement) },
      { ALT: () => this.SUBRULE(this.varAssignStatement) },
    ]);
  });

  public subSceneStatement = this.RULE('subSceneStatement', () => {
    this.CONSUME(Scene);
    this.CONSUME(DotIdentifier);
    this.OPTION(() => {
      this.CONSUME(Ui);
      this.CONSUME(Colon);
      this.CONSUME(StringLiteral);
    });
    this.CONSUME(LCurly);
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
    this.CONSUME(RCurly);
  });

  public dialogueStatement = this.RULE('dialogueStatement', () => {
    this.OR([
      {
        ALT: () => {
          this.SUBRULE(this.variableIdentifier, { LABEL: 'character' });
          this.OPTION(() => {
            this.CONSUME(As);
            this.CONSUME(StringLiteral);
          });
          this.CONSUME(Colon);
          this.CONSUME2(StringLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME3(StringLiteral);
        },
      },
    ]);
  });

  public revealStatement = this.RULE('revealStatement', () => {
    this.CONSUME(Reveal);
    this.CONSUME(Identifier);
    this.CONSUME(As);
    this.CONSUME(StringLiteral);
  });

  public signedNumber = this.RULE('signedNumber', () => {
    this.OPTION(() => this.CONSUME(Minus));
    this.CONSUME(NumberLiteral);
  });

  public booleanLiteral = this.RULE('booleanLiteral', () => {
    this.OR([{ ALT: () => this.CONSUME(True) }, { ALT: () => this.CONSUME(False) }]);
  });

  public backgroundStatement = this.RULE('backgroundStatement', () => {
    this.CONSUME(Background);
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(LParen);
            this.MANY_SEP({
              SEP: Comma,
              DEF: () => this.SUBRULE(this.showArgument),
            });
            this.CONSUME(RParen);
          },
        },
        {
          ALT: () => {
            this.CONSUME(Transition);
            this.CONSUME(Colon);
            this.CONSUME(StringLiteral);
          },
        },
      ]);
    });
  });

  public showStatement = this.RULE('showStatement', () => {
    this.CONSUME(Show);
    this.SUBRULE(this.variableIdentifier, { LABEL: 'character' });
    this.OPTION1(() => {
      this.OR([
        { ALT: () => this.CONSUME(DotIdentifier) },
        {
          ALT: () => {
            this.CONSUME(Dot);
            this.SUBRULE2(this.variableIdentifier, { LABEL: 'sprite' });
          },
        },
      ]);
    });
    this.OPTION2(() => {
      this.CONSUME(LParen);
      this.MANY_SEP({
        SEP: Comma,
        DEF: () => this.SUBRULE(this.showArgument),
      });
      this.CONSUME(RParen);
    });
  });

  public showArgument = this.RULE('showArgument', () => {
    this.OR([
      {
        ALT: () => {
          this.OR1([
            { ALT: () => this.CONSUME(Position) },
            { ALT: () => this.CONSUME(Transition) },
            { ALT: () => this.CONSUME(Easing) },
          ]);
          this.CONSUME1(Colon);
          this.CONSUME(StringLiteral);
        },
      },
      {
        ALT: () => {
          this.OR2([
            { ALT: () => this.CONSUME(CoordX) },
            { ALT: () => this.CONSUME(CoordY) },
            { ALT: () => this.CONSUME(OffsetX) },
            { ALT: () => this.CONSUME(OffsetY) },
            { ALT: () => this.CONSUME(Scale) },
            { ALT: () => this.CONSUME(ScaleX) },
            { ALT: () => this.CONSUME(ScaleY) },
            { ALT: () => this.CONSUME(Rotate) },
            { ALT: () => this.CONSUME(Alpha) },
          ]);
          this.CONSUME2(Colon);
          this.SUBRULE1(this.signedNumber);
        },
      },
      {
        ALT: () => {
          this.OR3([{ ALT: () => this.CONSUME(FlipX) }, { ALT: () => this.CONSUME(FlipY) }]);
          this.CONSUME3(Colon);
          this.SUBRULE(this.booleanLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Duration);
          this.CONSUME4(Colon);
          this.OR4([
            { ALT: () => this.CONSUME(DurationLiteral) },
            { ALT: () => this.SUBRULE2(this.signedNumber) },
          ]);
        },
      },
    ]);
  });

  public hideStatement = this.RULE('hideStatement', () => {
    this.CONSUME(Hide);
    this.OR([{ ALT: () => this.CONSUME(Dialogue) }, { ALT: () => this.CONSUME(Identifier) }]);
  });

  public inspectStatement = this.RULE('inspectStatement', () => {
    this.CONSUME(Inspect);
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.CONSUME(Title);
      this.CONSUME(Colon);
      this.CONSUME(StringLiteral);
    });
    this.CONSUME(LCurly);
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
    this.CONSUME(RCurly);
  });

  public playStatement = this.RULE('playStatement', () => {
    this.CONSUME(Play);
    this.CONSUME(Identifier); // channel: music, sound, ...
    this.CONSUME(StringLiteral); // assetId
    this.MANY(() => {
      this.SUBRULE(this.playArgument);
    });
  });

  public playArgument = this.RULE('playArgument', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Volume);
          this.CONSUME(Colon);
          this.CONSUME(NumberLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Loop);
          this.CONSUME2(Colon);
          this.OR2([{ ALT: () => this.CONSUME(True) }, { ALT: () => this.CONSUME(False) }]);
        },
      },
      {
        ALT: () => {
          this.CONSUME(FadeIn);
          this.CONSUME3(Colon);
          this.OR3([
            { ALT: () => this.CONSUME(DurationLiteral) },
            { ALT: () => this.CONSUME2(NumberLiteral) },
          ]);
        },
      },
    ]);
  });

  public stopStatement = this.RULE('stopStatement', () => {
    this.CONSUME(Stop);
    this.CONSUME(Identifier); // channel
    this.OPTION(() => {
      this.CONSUME(FadeOut);
      this.CONSUME(Colon);
      this.OR([
        { ALT: () => this.CONSUME(DurationLiteral) },
        { ALT: () => this.CONSUME(NumberLiteral) },
      ]);
    });
  });

  public gotoStatement = this.RULE('gotoStatement', () => {
    this.CONSUME(Goto);
    this.SUBRULE(this.sceneTarget);
  });

  public callStatement = this.RULE('callStatement', () => {
    this.CONSUME(Call);
    this.SUBRULE(this.sceneTarget);
  });

  public returnStatement = this.RULE('returnStatement', () => {
    this.CONSUME(Return);
  });

  public endStatement = this.RULE('endStatement', () => {
    this.CONSUME(End);
  });

  public waitStatement = this.RULE('waitStatement', () => {
    this.CONSUME(Wait);
    this.OR([
      { ALT: () => this.CONSUME(DurationLiteral) },
      { ALT: () => this.CONSUME(NumberLiteral) },
    ]);
  });

  public choiceStatement = this.RULE('choiceStatement', () => {
    this.CONSUME(Choice);
    this.OPTION(() => {
      this.CONSUME(Ui);
      this.CONSUME(Colon);
      this.CONSUME(StringLiteral);
    });
    this.CONSUME(LCurly);
    this.MANY(() => {
      this.SUBRULE(this.choiceOption);
    });
    this.CONSUME(RCurly);
  });

  public choiceOption = this.RULE('choiceOption', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(If);
          this.SUBRULE(this.expressionSequence, { LABEL: 'condition' });
          this.CONSUME(LCurly);
          this.AT_LEAST_ONE(() => {
            this.SUBRULE(this.choiceDirectOption);
          });
          this.CONSUME(RCurly);
        },
      },
      {
        ALT: () => {
          this.SUBRULE2(this.choiceDirectOption);
        },
      },
    ]);
  });

  public choiceDirectOption = this.RULE('choiceDirectOption', () => {
    this.CONSUME(StringLiteral);
    this.CONSUME(Colon);
    this.OR([
      { ALT: () => this.CONSUME(Goto) },
      { ALT: () => this.CONSUME(Call) },
    ]);
    this.SUBRULE(this.sceneTarget);
  });

  public whileStatement = this.RULE('whileStatement', () => {
    this.CONSUME(While);
    this.SUBRULE(this.expressionSequence, { LABEL: 'condition' });
    this.CONSUME(LCurly);
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
    this.CONSUME(RCurly);
  });

  public ifStatement = this.RULE('ifStatement', () => {
    this.CONSUME(If);
    this.SUBRULE(this.expressionSequence, { LABEL: 'condition' });
    this.CONSUME(LCurly);
    this.MANY(() => {
      this.SUBRULE(this.statement, { LABEL: 'consequent' });
    });
    this.CONSUME(RCurly);
    this.OPTION(() => {
      this.CONSUME(Else);
      this.OR([
        {
          ALT: () => {
            this.SUBRULE(this.ifStatement, { LABEL: 'elseIf' });
          },
        },
        {
          ALT: () => {
            this.CONSUME2(LCurly);
            this.MANY2(() => {
              this.SUBRULE2(this.statement, { LABEL: 'alternate' });
            });
            this.CONSUME2(RCurly);
          },
        },
      ]);
    });
  });

  public varDefineStatement = this.RULE('varDefineStatement', () => {
    this.CONSUME(Define);
    this.SUBRULE(this.variableIdentifier);
    this.CONSUME(Equals);
    this.SUBRULE(this.expressionSequence, { LABEL: 'value' });
  });

  public varAssignStatement = this.RULE('varAssignStatement', () => {
    this.CONSUME(Tilde);
    this.SUBRULE(this.variableIdentifier);
    this.CONSUME(Equals);
    this.SUBRULE(this.expressionSequence, { LABEL: 'value' });
  });

  private canContinueExpression(): boolean {
    const nextTok = this.LA(1);
    const prevTok = this.LA(0);

    // 1. Dialogue statement với tên nhân vật (kể cả contextual keywords như x:, end:): `character:` hoặc `character as "...":`
    const nextNextTok = this.LA(2);
    if (nextNextTok && (nextNextTok.tokenType === Colon || nextNextTok.tokenType === As)) {
      return false;
    }

    // 2. Từ khóa bắt đầu statement mới hoặc đóng/mở block
    const nextType = nextTok.tokenType;
    if (
      nextType === Scene ||
      nextType === Reveal ||
      nextType === Background ||
      nextType === Show ||
      nextType === Hide ||
      nextType === Play ||
      nextType === Stop ||
      nextType === Choice ||
      nextType === Goto ||
      nextType === Call ||
      nextType === Return ||
      nextType === While ||
      nextType === If ||
      nextType === Define ||
      nextType === Inspect ||
      nextType === Tilde ||
      nextType === RCurly ||
      nextType === LCurly
    ) {
      return false;
    }

    // 3. Ranh giới toán hạng (operand boundary) và câu thoại ẩn danh:
    // Trong cú pháp biểu thức hợp lệ, một toán hạng không thể đi liền ngay sau một toán hạng khác mà không có toán tử.
    if (prevTok) {
      const isPrevOperand =
        prevTok.tokenType === Identifier ||
        prevTok.tokenType === DotIdentifier ||
        prevTok.tokenType === NumberLiteral ||
        prevTok.tokenType === StringLiteral ||
        prevTok.tokenType === DurationLiteral ||
        prevTok.tokenType === True ||
        prevTok.tokenType === False ||
        prevTok.tokenType === RParen;

      if (isPrevOperand) {
        // StringLiteral đứng sau một toán hạng là câu thoại ẩn danh (hoặc cú pháp không hợp lệ)
        if (nextType === StringLiteral) {
          return false;
        }

        // Identifier đứng sau một toán hạng trên một dòng mới (không phải gọi hàm func(...))
        if (nextType === Identifier && this.LA(2).tokenType !== LParen) {
          if (
            nextTok.startLine !== undefined &&
            prevTok.startLine !== undefined &&
            nextTok.startLine > prevTok.startLine
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }

  // Gom các token của biểu thức để đưa sang jsep xử lý (Stage 3)
  public expressionSequence = this.RULE('expressionSequence', () => {
    this.AT_LEAST_ONE({
      GATE: () => this.canContinueExpression(),
      DEF: () => {
        this.SUBRULE(this.expressionToken);
      },
    });
  });

  public expressionToken = this.RULE('expressionToken', () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(DotIdentifier) },
      { ALT: () => this.CONSUME(AlphanumericIdentifier) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(DurationLiteral) },
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
      { ALT: () => this.CONSUME(Scale) },
      { ALT: () => this.CONSUME(ScaleX) },
      { ALT: () => this.CONSUME(ScaleY) },
      { ALT: () => this.CONSUME(Rotate) },
      { ALT: () => this.CONSUME(FlipX) },
      { ALT: () => this.CONSUME(FlipY) },
      { ALT: () => this.CONSUME(CoordX) },
      { ALT: () => this.CONSUME(CoordY) },
      { ALT: () => this.CONSUME(OffsetX) },
      { ALT: () => this.CONSUME(OffsetY) },
      { ALT: () => this.CONSUME(Alpha) },
      { ALT: () => this.CONSUME(Easing) },
      { ALT: () => this.CONSUME(Title) },
      { ALT: () => this.CONSUME(Volume) },
      { ALT: () => this.CONSUME(Duration) },
      { ALT: () => this.CONSUME(Loop) },
      { ALT: () => this.CONSUME(End) },
      { ALT: () => this.CONSUME(Position) },
      { ALT: () => this.CONSUME(Transition) },
      { ALT: () => this.CONSUME(Ui) },
      { ALT: () => this.CONSUME(LParen) },
      { ALT: () => this.CONSUME(RParen) },
      { ALT: () => this.CONSUME(Comma) },
      { ALT: () => this.CONSUME(Dot) },
      { ALT: () => this.CONSUME(Plus) },
      { ALT: () => this.CONSUME(Minus) },
      { ALT: () => this.CONSUME(Star) },
      { ALT: () => this.CONSUME(Slash) },
      { ALT: () => this.CONSUME(Percent) },
      { ALT: () => this.CONSUME(Less) },
      { ALT: () => this.CONSUME(Greater) },
      { ALT: () => this.CONSUME(LessEquals) },
      { ALT: () => this.CONSUME(GreaterEquals) },
      { ALT: () => this.CONSUME(DoubleEquals) },
      { ALT: () => this.CONSUME(NotEquals) },
      { ALT: () => this.CONSUME(And) },
      { ALT: () => this.CONSUME(Or) },
      { ALT: () => this.CONSUME(Exclamation) },
    ]);
  });
}

export const parserInstance = new VNSParser();
