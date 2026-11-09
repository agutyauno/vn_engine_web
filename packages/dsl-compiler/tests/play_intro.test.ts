/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import type { PlayInstruction, PlayStatement } from '@vn-engine/shared-types';
import {
  compileString,
  VNSLexer,
  parserInstance,
  extractScriptReferences,
  formatVns,
} from '../src/index';

describe('DSL Compiler: Play Music with Intro Parameter (TASK-audio-intro-loop)', () => {
  const dslWithIntro = `
    scene audio_intro_test {
      play music "loop.mp3" intro: "intro.mp3" volume: 0.8 loop: true
    }
  `;

  // ---------------------------------------------------------------------------
  // TC-DSL-AUDIO-01 (Lexer & Parser)
  // ---------------------------------------------------------------------------
  it('TC-DSL-AUDIO-01: should lex and parse play statement with intro parameter without syntax errors', () => {
    const lexResult = VNSLexer.tokenize(dslWithIntro);
    expect(lexResult.errors).toHaveLength(0);

    // Verify token sequence contains an Intro keyword token (not generic Identifier)
    const tokenNames = lexResult.tokens.map(t => t.tokenType.name);
    expect(tokenNames).toContain('Intro');

    parserInstance.input = lexResult.tokens;
    const cst = parserInstance.program();
    expect(parserInstance.errors).toHaveLength(0);
    expect(cst).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // TC-DSL-AUDIO-02 (AST & Codegen)
  // ---------------------------------------------------------------------------
  it('TC-DSL-AUDIO-02: compileString should produce AST and PLAY instruction with intro, assetId, volume, and loop', () => {
    const result = compileString(dslWithIntro, 'audio_intro.vns');

    if (!result.success) {
      console.error('Compiler Errors:', result.errors);
    }
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    // 1. Verify AST PlayStatement
    const sceneNode = result.ast?.scenes?.find(s => s.name === 'audio_intro_test');
    expect(sceneNode).toBeDefined();
    const playStmt = sceneNode?.body?.find(stmt => stmt.type === 'PlayStatement') as
      | PlayStatement
      | undefined;
    expect(playStmt).toBeDefined();
    expect(playStmt?.channel).toBe('music');
    expect(playStmt?.assetId).toBe('loop.mp3');
    expect(playStmt?.intro).toBe('intro.mp3');
    expect(playStmt?.volume).toBe(0.8);
    expect(playStmt?.loop).toBe(true);

    // 2. Verify Bytecode PLAY instruction
    const playInstr = result.program?.find(i => i.type === 'PLAY') as PlayInstruction | undefined;
    expect(playInstr).toBeDefined();
    expect(playInstr?.type).toBe('PLAY');
    expect(playInstr?.channel).toBe('music');
    expect(playInstr?.assetId).toBe('loop.mp3');
    expect(playInstr?.intro).toBe('intro.mp3');
    expect(playInstr?.volume).toBe(0.8);
    expect(playInstr?.loop).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // TC-DSL-AUDIO-03 (Asset References)
  // ---------------------------------------------------------------------------
  it('TC-DSL-AUDIO-03: extractScriptReferences should extract both intro and loop audio assets with category and expectedType "audio"', () => {
    const result = compileString(dslWithIntro, 'audio_intro.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs = extractScriptReferences(result.ast!);
    const audioAssets = refs.assets.filter(a => a.category === 'audio' || a.expectedType === 'audio');

    // Must extract exactly 2 audio references: main loop and intro track
    expect(audioAssets).toHaveLength(2);

    const mainTrack = audioAssets.find(a => a.assetKey === 'loop.mp3');
    expect(mainTrack).toBeDefined();
    expect(mainTrack).toMatchObject({
      assetKey: 'loop.mp3',
      category: 'audio',
      expectedType: 'audio',
    });

    const introTrack = audioAssets.find(a => a.assetKey === 'intro.mp3');
    expect(introTrack).toBeDefined();
    expect(introTrack).toMatchObject({
      assetKey: 'intro.mp3',
      category: 'audio',
      expectedType: 'audio',
    });
  });

  // ---------------------------------------------------------------------------
  // TC-DSL-AUDIO-04 (Formatter)
  // ---------------------------------------------------------------------------
  it('TC-DSL-AUDIO-04: formatVns should keep intro parameter intact and properly normalized', () => {
    const raw = `
scene audio_scene {
play music "bgm_battle_loop.mp3" intro: "bgm_battle_intro.mp3" volume: 0.8 loop: true
}
`;
    const formatted = formatVns(raw, { indentSize: 2 });
    expect(formatted).toContain(
      'play music "bgm_battle_loop.mp3" intro: "bgm_battle_intro.mp3" volume: 0.8 loop: true',
    );

    // Also test formatting unnormalized spacing around intro:
    const unnormalized = `
scene audio_scene {
play music "bgm_battle_loop.mp3" intro:"bgm_battle_intro.mp3" volume:0.8 loop:true
}
`;
    const formattedUnnormalized = formatVns(unnormalized, { indentSize: 2 });
    expect(formattedUnnormalized).toContain(
      'play music "bgm_battle_loop.mp3" intro: "bgm_battle_intro.mp3" volume: 0.8 loop: true',
    );
  });

  // ---------------------------------------------------------------------------
  // TC-DSL-AUDIO-05 (Backward Compatibility)
  // ---------------------------------------------------------------------------
  it('TC-DSL-AUDIO-05: play statement without intro should compile normally and intro should be undefined', () => {
    const legacyDsl = `
      scene audio_legacy {
        play music "classic_bgm.mp3" volume: 0.7 loop: true
        play sound "click.mp3"
      }
    `;
    const result = compileString(legacyDsl, 'legacy.vns');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();

    const playInstructions = result.program?.filter(i => i.type === 'PLAY') as PlayInstruction[];
    expect(playInstructions).toHaveLength(2);

    // Music instruction
    expect(playInstructions[0]).toMatchObject({
      type: 'PLAY',
      channel: 'music',
      assetId: 'classic_bgm.mp3',
      volume: 0.7,
      loop: true,
    });
    expect(playInstructions[0]?.intro).toBeUndefined();

    // Sound instruction
    expect(playInstructions[1]).toMatchObject({
      type: 'PLAY',
      channel: 'sound',
      assetId: 'click.mp3',
    });
    expect(playInstructions[1]?.intro).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Additional Edge Case: Fade-in combination
  // ---------------------------------------------------------------------------
  it('should compile play statement with intro and fade_in duration literal', () => {
    const fadeDsl = `
      scene audio_fade {
        play music "loop.ogg" intro: "intro.ogg" fade_in: 1.5s volume: 0.9 loop: true
      }
    `;
    const result = compileString(fadeDsl, 'fade.vns');
    expect(result.success).toBe(true);

    const playInstr = result.program?.find(i => i.type === 'PLAY') as PlayInstruction;
    expect(playInstr).toBeDefined();
    expect(playInstr).toMatchObject({
      type: 'PLAY',
      channel: 'music',
      assetId: 'loop.ogg',
      intro: 'intro.ogg',
      fadeIn: 1.5,
      volume: 0.9,
      loop: true,
    });
  });
});
