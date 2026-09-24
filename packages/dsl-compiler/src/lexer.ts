// ==========================================
// TẦNG PHÂN TÍCH TỪ VỰNG (LEXER - CHEVROTAIN)
// ==========================================

import { createToken, Lexer, type TokenType } from 'chevrotain';

// -----------------------------------------------------------------------------
// 1. Whitespace & Comments (Bỏ qua)
// -----------------------------------------------------------------------------
export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[ \t\r\n]+/,
  group: Lexer.SKIPPED,
});

export const Comment = createToken({
  name: 'Comment',
  pattern: /#[^\n\r]*/,
  group: Lexer.SKIPPED,
});

// -----------------------------------------------------------------------------
// 2. Literals
// -----------------------------------------------------------------------------
export const DurationLiteral = createToken({
  name: 'DurationLiteral',
  pattern: /[0-9]+(\.[0-9]+)?s\b/,
});

export const NumberLiteral = createToken({
  name: 'NumberLiteral',
  pattern: /[0-9]+(\.[0-9]+)?/,
});

export const StringLiteral = createToken({
  name: 'StringLiteral',
  pattern: /"([^"\\]|\\.)*"/,
});

// -----------------------------------------------------------------------------
// 3. Từ khóa (Keywords) - Phải định nghĩa trước Identifier
// -----------------------------------------------------------------------------
export const Scene = createToken({ name: 'Scene', pattern: /\bscene\b/ });
export const As = createToken({ name: 'As', pattern: /\bas\b/ });
export const Reveal = createToken({ name: 'Reveal', pattern: /\breveal\b/ });
export const Background = createToken({ name: 'Background', pattern: /\bbackground\b/ });
export const Show = createToken({ name: 'Show', pattern: /\bshow\b/ });
export const Hide = createToken({ name: 'Hide', pattern: /\bhide\b/ });
export const Play = createToken({ name: 'Play', pattern: /\bplay\b/ });
export const Stop = createToken({ name: 'Stop', pattern: /\bstop\b/ });
export const Choice = createToken({ name: 'Choice', pattern: /\bchoice\b/ });
export const Goto = createToken({ name: 'Goto', pattern: /\bgoto\b/ });
export const Call = createToken({ name: 'Call', pattern: /\bcall\b/ });
export const Return = createToken({ name: 'Return', pattern: /\breturn\b/ });
export const End = createToken({ name: 'End', pattern: /\bend\b/ });
export const If = createToken({ name: 'If', pattern: /\bif\b/ });
export const Else = createToken({ name: 'Else', pattern: /\belse\b/ });
export const While = createToken({ name: 'While', pattern: /\bwhile\b/ });
export const Define = createToken({ name: 'Define', pattern: /\bdefine\b/ });

// Named attributes / options
export const Volume = createToken({ name: 'Volume', pattern: /\bvolume\b/ });
export const FadeIn = createToken({ name: 'FadeIn', pattern: /\b(fade_in|fadeIn)\b/ });
export const FadeOut = createToken({ name: 'FadeOut', pattern: /\b(fade_out|fadeOut)\b/ });
export const Position = createToken({ name: 'Position', pattern: /\bposition\b/ });
export const Transition = createToken({ name: 'Transition', pattern: /\btransition\b/ });
export const Duration = createToken({ name: 'Duration', pattern: /\bduration\b/ });
export const Loop = createToken({ name: 'Loop', pattern: /\bloop\b/ });
export const Ui = createToken({ name: 'Ui', pattern: /\bui\b/ });
export const True = createToken({ name: 'True', pattern: /\btrue\b/ });
export const False = createToken({ name: 'False', pattern: /\bfalse\b/ });

// Image transform & motion attributes
export const Scale = createToken({ name: 'Scale', pattern: /\bscale\b/ });
export const ScaleX = createToken({ name: 'ScaleX', pattern: /\b(scale_x|scaleX)\b/ });
export const ScaleY = createToken({ name: 'ScaleY', pattern: /\b(scale_y|scaleY)\b/ });
export const Rotate = createToken({ name: 'Rotate', pattern: /\b(rotate|rotation)\b/ });
export const FlipX = createToken({ name: 'FlipX', pattern: /\b(flip_x|flipX)\b/ });
export const FlipY = createToken({ name: 'FlipY', pattern: /\b(flip_y|flipY)\b/ });
export const CoordX = createToken({ name: 'CoordX', pattern: /\bx\b/ });
export const CoordY = createToken({ name: 'CoordY', pattern: /\by\b/ });
export const OffsetX = createToken({ name: 'OffsetX', pattern: /\b(offset_x|offsetX)\b/ });
export const OffsetY = createToken({ name: 'OffsetY', pattern: /\b(offset_y|offsetY)\b/ });
export const Alpha = createToken({ name: 'Alpha', pattern: /\b(alpha|opacity)\b/ });
export const Easing = createToken({ name: 'Easing', pattern: /\beasing\b/ });

// -----------------------------------------------------------------------------
// 4. Toán tử đa ký tự (Multi-character Operators)
// -----------------------------------------------------------------------------
export const LessEquals = createToken({ name: 'LessEquals', pattern: /<=/ });
export const GreaterEquals = createToken({ name: 'GreaterEquals', pattern: />=/ });
export const DoubleEquals = createToken({ name: 'DoubleEquals', pattern: /==/ });
export const NotEquals = createToken({ name: 'NotEquals', pattern: /!=/ });
export const And = createToken({ name: 'And', pattern: /&&/ });
export const Or = createToken({ name: 'Or', pattern: /\|\|/ });

// -----------------------------------------------------------------------------
// 5. Toán tử & Dấu phân cách đơn (Single-character Symbols)
// -----------------------------------------------------------------------------
export const Tilde = createToken({ name: 'Tilde', pattern: /~/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Dot = createToken({ name: 'Dot', pattern: /\./ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Equals = createToken({ name: 'Equals', pattern: /=/ });
export const LCurly = createToken({ name: 'LCurly', pattern: /\{/ });
export const RCurly = createToken({ name: 'RCurly', pattern: /\}/ });
export const LParen = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen = createToken({ name: 'RParen', pattern: /\)/ });
export const Plus = createToken({ name: 'Plus', pattern: /\+/ });
export const Minus = createToken({ name: 'Minus', pattern: /-/ });
export const Star = createToken({ name: 'Star', pattern: /\*/ });
export const Slash = createToken({ name: 'Slash', pattern: /\// });
export const Less = createToken({ name: 'Less', pattern: /</ });
export const Greater = createToken({ name: 'Greater', pattern: />/ });
export const Exclamation = createToken({ name: 'Exclamation', pattern: /!/ });

// DotIdentifier (như .ask_question, .flower_result)
export const DotIdentifier = createToken({
  name: 'DotIdentifier',
  pattern: /\.[a-zA-Z_][a-zA-Z0-9_]*/,
});

export const Identifier = createToken({
  name: 'Identifier',
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

// Thứ tự ưu tiên của Tokens
export const allTokens: TokenType[] = [
  WhiteSpace,
  Comment,

  // Literals đặc biệt
  DurationLiteral,
  NumberLiteral,
  StringLiteral,

  // Keywords
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
  Define,
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

  // Multi-character Operators (phải đứng trước single-character)
  LessEquals,
  GreaterEquals,
  DoubleEquals,
  NotEquals,
  And,
  Or,

  // Single-character Symbols
  Tilde,
  Colon,
  LCurly,
  RCurly,
  LParen,
  RParen,
  Comma,
  Equals,
  Plus,
  Minus,
  Star,
  Slash,
  Less,
  Greater,
  Exclamation,

  // Identifiers
  DotIdentifier,
  Dot,
  Identifier,
];

export const VNSLexer = new Lexer(allTokens);
