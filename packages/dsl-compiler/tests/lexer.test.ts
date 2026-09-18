import { describe, it, expect } from 'vitest';
import { VNSLexer } from '../src/lexer';

describe('VNSLexer (Chevrotain Tokenizer)', () => {
  it('should tokenize scene, keywords, and dialogue', () => {
    const input = `
      # Comment kịch bản
      scene intro ui: "default" {
        alice as "???": "Chào bạn!"
        ~ affection = 0
      }
    `;

    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toContain('Scene');
    expect(tokenNames).toContain('Identifier');
    expect(tokenNames).toContain('Ui');
    expect(tokenNames).toContain('Colon');
    expect(tokenNames).toContain('StringLiteral');
    expect(tokenNames).toContain('LCurly');
    expect(tokenNames).toContain('As');
    expect(tokenNames).toContain('Tilde');
    expect(tokenNames).toContain('Equals');
    expect(tokenNames).toContain('NumberLiteral');
    expect(tokenNames).toContain('RCurly');
  });

  it('should tokenize dot identifiers for local sub-scenes', () => {
    const input = 'goto .ask_question';
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    expect(result.tokens[0]?.tokenType.name).toBe('Goto');
    expect(result.tokens[1]?.tokenType.name).toBe('DotIdentifier');
    expect(result.tokens[1]?.image).toBe('.ask_question');
  });

  it('should tokenize comparison and arithmetic operators', () => {
    const input = 'while affection < 100 && gold >= 50';
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toContain('While');
    expect(tokenNames).toContain('Less');
    expect(tokenNames).toContain('And');
    expect(tokenNames).toContain('GreaterEquals');
  });
});
