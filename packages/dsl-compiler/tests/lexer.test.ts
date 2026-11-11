import { describe, it, expect } from 'vitest';
import { VNSLexer } from '../src/lexer';

describe('VNSLexer (Chevrotain Tokenizer)', () => {
  it('should tokenize scene, keywords, and dialogue', () => {
    const input = `
      # Comment kịch bản
      scene intro ui: "default" {
        alice: "Chào bạn!"
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
    const input = 'while affection < 100 && gold >= 50 || score != 0';
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toContain('While');
    expect(tokenNames).toContain('Less');
    expect(tokenNames).toContain('And');
    expect(tokenNames).toContain('GreaterEquals');
    expect(tokenNames).toContain('Or');
    expect(tokenNames).toContain('NotEquals');
  });

  it('should handle comment edge cases (consecutive, empty, trailing without newline)', () => {
    const input = `
      # Comment 1
      #
      # Comment 2
      scene start {
        # Inline comment
        alice: "Hello" # Trailing comment
      }
      # Final comment without trailing newline`;

    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);
    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toContain('Scene');
    expect(tokenNames).toContain('StringLiteral');
  });

  it('should tokenize Unicode and Vietnamese diacritics in strings', () => {
    const input = `alice: "Chào bạn! Đây là tiếng Việt có đầy đủ dấu: á, ế, ơ, ư, đ..."`;
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const strToken = result.tokens.find(t => t.tokenType.name === 'StringLiteral');
    expect(strToken).toBeDefined();
    expect(strToken?.image).toBe(`"Chào bạn! Đây là tiếng Việt có đầy đủ dấu: á, ế, ơ, ư, đ..."`);
  });

  it('should tokenize string literals with escaped characters', () => {
    const input = `alice: "Cô ấy nói: \\"Đi thôi nào!\\", rồi cười."`;
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const strToken = result.tokens.find(t => t.tokenType.name === 'StringLiteral');
    expect(strToken).toBeDefined();
    expect(strToken?.image).toBe(`"Cô ấy nói: \\"Đi thôi nào!\\", rồi cười."`);
  });

  it('should correctly distinguish between NumberLiteral and DurationLiteral', () => {
    const input = `show alice with dissolve 0.5s at 100 duration 2.5s`;
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const durationTokens = result.tokens.filter(t => t.tokenType.name === 'DurationLiteral');
    const numberTokens = result.tokens.filter(t => t.tokenType.name === 'NumberLiteral');

    expect(durationTokens).toHaveLength(2);
    expect(durationTokens[0]?.image).toBe('0.5s');
    expect(durationTokens[1]?.image).toBe('2.5s');

    expect(numberTokens).toHaveLength(1);
    expect(numberTokens[0]?.image).toBe('100');
  });

  it('should record lexer errors when unrecognized characters are encountered', () => {
    const input = `scene test { @invalid_symbol $another }`;
    const result = VNSLexer.tokenize(input);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors[0]?.message).toContain('@');
  });

  it('should tokenize anchorX and anchorY attributes (both snake_case and camelCase)', () => {
    const input = `show alice.happy(anchorX: 0.5, anchorY: 1.0, anchor_x: -0.2, anchor_y: 0.8)`;
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const tokenNames = result.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toContain('AnchorX');
    expect(tokenNames).toContain('AnchorY');
    const anchorXTokens = result.tokens.filter(t => t.tokenType.name === 'AnchorX');
    const anchorYTokens = result.tokens.filter(t => t.tokenType.name === 'AnchorY');
    expect(anchorXTokens).toHaveLength(2);
    expect(anchorYTokens).toHaveLength(2);
    expect(anchorXTokens[0]?.image).toBe('anchorX');
    expect(anchorXTokens[1]?.image).toBe('anchor_x');
    expect(anchorYTokens[0]?.image).toBe('anchorY');
    expect(anchorYTokens[1]?.image).toBe('anchor_y');
  });

  it('should tokenize string speaker literals followed by colon and dialogue', () => {
    const input = `"Alice Carroll": "Chào bạn!"\n"???": "Tôi là ai?"`;
    const result = VNSLexer.tokenize(input);
    expect(result.errors).toHaveLength(0);

    const stringTokens = result.tokens.filter(t => t.tokenType.name === 'StringLiteral');
    expect(stringTokens).toHaveLength(4);
    expect(stringTokens[0]?.image).toBe('"Alice Carroll"');
    expect(stringTokens[1]?.image).toBe('"Chào bạn!"');
    expect(stringTokens[2]?.image).toBe('"???"');
    expect(stringTokens[3]?.image).toBe('"Tôi là ai?"');
  });
});
