/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import type { IToken } from 'chevrotain';
import {
  compileString,
  extractScriptReferences,
  extractLocation,
  type ScriptReferences,
  type AssetReference,
  type ScriptReferenceLocation,
} from '../src';

describe('AST Reference Visitor (extractScriptReferences)', () => {
  it('TC-AST-REC-01: should extract background asset reference with location', () => {
    const dsl = `scene intro {
  background bg_room
}`;
    const result = compileString(dsl, 'intro.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);
    expect(refs.assets).toHaveLength(1);
    expect(refs.assets[0]).toMatchObject<AssetReference>({
      assetKey: 'bg_room',
      category: 'background',
      expectedType: 'image',
      loc: {
        fileId: 'intro.vns',
        line: 2,
      },
    });
  });

  it('TC-AST-REC-02: should extract sprite show and hide asset references with location', () => {
    const dsl = `scene intro {
  show alice.happy
  hide bob
}`;
    const result = compileString(dsl, 'intro.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);
    expect(refs.assets).toHaveLength(2);
    expect(refs.assets[0]).toMatchObject<AssetReference>({
      assetKey: 'alice',
      variant: 'happy',
      category: 'sprite',
      expectedType: 'image',
      loc: {
        fileId: 'intro.vns',
        line: 2,
      },
    });
    expect(refs.assets[1]).toMatchObject<AssetReference>({
      assetKey: 'bob',
      category: 'sprite',
      expectedType: 'image',
      loc: {
        fileId: 'intro.vns',
        line: 3,
      },
    });
  });

  it('TC-AST-REC-03: should extract audio play statements for music, sound, and voice', () => {
    const dsl = `scene intro {
  play music "bgm_theme"
  play sound "sfx_click"
  play voice "voice_greeting"
}`;
    const result = compileString(dsl, 'audio.vns', {
      assets: [
        { id: 'bgm_theme', category: 'audio' },
        { id: 'sfx_click', category: 'audio' },
        { id: 'voice_greeting', category: 'audio' },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);
    expect(refs.assets).toHaveLength(3);

    expect(refs.assets[0]).toMatchObject<AssetReference>({
      assetKey: 'bgm_theme',
      category: 'audio',
      expectedType: 'audio',
      loc: { fileId: 'audio.vns', line: 2 },
    });
    expect(refs.assets[1]).toMatchObject<AssetReference>({
      assetKey: 'sfx_click',
      category: 'audio',
      expectedType: 'audio',
      loc: { fileId: 'audio.vns', line: 3 },
    });
    expect(refs.assets[2]).toMatchObject<AssetReference>({
      assetKey: 'voice_greeting',
      category: 'audio',
      expectedType: 'audio',
      loc: { fileId: 'audio.vns', line: 4 },
    });
  });

  it('TC-AST-REC-04: should extract inspect statement asset and nested statements inside inspect body', () => {
    const dsl = `scene intro {
  inspect item_map {
    play sound "sfx_open"
  }
}`;
    const result = compileString(dsl, 'inspect.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);
    expect(refs.assets).toHaveLength(2);

    expect(refs.assets).toContainEqual(
      expect.objectContaining({
        assetKey: 'item_map',
        category: 'inspect',
        expectedType: 'image',
        loc: expect.objectContaining({ fileId: 'inspect.vns', line: 2 }),
      }),
    );
    expect(refs.assets).toContainEqual(
      expect.objectContaining({
        assetKey: 'sfx_open',
        category: 'audio',
        expectedType: 'audio',
        loc: expect.objectContaining({ fileId: 'inspect.vns', line: 3 }),
      }),
    );
  });

  it('TC-AST-REC-05: should extract references deeply nested inside if, else, and while blocks', () => {
    const dsl = `scene nested_logic {
  define flag = true
  define count = 0
  if flag {
    show alice.smile
    background bg_if
  } else {
    while count < 3 {
      show bob.surprised
      background bg_while
    }
  }
}`;
    const result = compileString(dsl, 'nested.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);

    const assetKeys = refs.assets.map(a => a.assetKey);
    expect(assetKeys).toContain('bg_if');
    expect(assetKeys).toContain('bg_while');
    expect(assetKeys).toContain('alice');
    expect(assetKeys).toContain('bob');
    expect(refs.assets).toHaveLength(4);

    const bgIf = refs.assets.find(a => a.assetKey === 'bg_if');
    expect(bgIf).toMatchObject({
      category: 'background',
      expectedType: 'image',
    });

    const bgWhile = refs.assets.find(a => a.assetKey === 'bg_while');
    expect(bgWhile).toMatchObject({
      category: 'background',
      expectedType: 'image',
    });
  });

  it('TC-AST-REC-06: should NOT produce asset references for dialogue statements or narration', () => {
    const dsl = `scene dialogue_scene {
  alice: "Hello world"
  "???": "Who is speaking?"
  "Narration without speaker"
}`;
    const result = compileString(dsl, 'dialogue.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);
    expect(refs.assets).toEqual([]);
    expect(refs.assets).toHaveLength(0);
  });

  it('TC-AST-REC-07: should aggregate references across multiple scenes in ProgramAST', () => {
    const dsl = `scene scene_one {
  background bg_one
  show alice.normal
}
scene scene_two {
  background bg_two
  show bob.normal
}`;
    const result = compileString(dsl, 'multi_scene.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs = extractScriptReferences(result.ast!);
    expect(refs.assets).toHaveLength(4);
    expect(refs.assets.map(a => a.assetKey)).toEqual(['bg_one', 'alice', 'bg_two', 'bob']);
  });

  it('TC-AST-REC-08: should return empty collections for scenes with no media references', () => {
    const dsl = `define score = 100
scene logic_only {
  define temp = 0
  ~temp = temp + 1
  wait 1.0
  goto next_scene
}
scene next_scene {
  end
}`;
    const result = compileString(dsl, 'logic.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs = extractScriptReferences(result.ast!);
    expect(refs.assets).toEqual([]);
  });

  it('TC-AST-REC-09: should traverse chained else-if branches correctly', () => {
    const dsl = `scene branching {
  define state = 1
  if state == 1 {
    show alice.happy
  } else if state == 2 {
    show bob.sad
  } else {
    show clare.neutral
  }
}`;
    const result = compileString(dsl, 'branching.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs = extractScriptReferences(result.ast!);
    expect(refs.assets.map(a => a.assetKey)).toEqual(['alice', 'bob', 'clare']);
  });

  it('TC-AST-REC-10: should preserve accurate fileId and line numbers in loc', () => {
    const dsl = `scene loc_test {
  background bg_scenery
}`;
    const result = compileString(dsl, 'custom/folder/scene.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs = extractScriptReferences(result.ast!);
    expect(refs.assets[0]?.loc).toMatchObject<ScriptReferenceLocation>({
      fileId: 'custom/folder/scene.vns',
      line: 2,
    });
  });

  // ==========================================
  // PRECISE MARKER SPANS (PHASE 1 - RED)
  // ==========================================

  it('TC-AST-SPAN-01: extractLocation should populate precise endLine and endCol matching token span', () => {
    const mockTokenWithChevrotainEnd: IToken = {
      image: 'bg_room',
      startLine: 3,
      startColumn: 5,
      endLine: 3,
      endColumn: 11, // Chevrotain endColumn is inclusive
      startOffset: 0,
      tokenTypeIdx: 0,
      tokenType: { name: 'Mock' },
    };

    const loc1 = extractLocation(mockTokenWithChevrotainEnd, 'scene1.vns');
    expect(loc1).toBeDefined();
    expect(loc1).toEqual({
      fileId: 'scene1.vns',
      line: 3,
      col: 5,
      endLine: 3,
      endCol: 12, // endColumn + 1
    });

    const mockTokenWithoutEndColumn: IToken = {
      image: 'alice',
      startLine: 1,
      startColumn: 10,
      startOffset: 0,
      tokenTypeIdx: 0,
      tokenType: { name: 'Mock' },
    };

    const loc2 = extractLocation(mockTokenWithoutEndColumn, 'scene1.vns');
    expect(loc2).toBeDefined();
    expect(loc2).toEqual({
      fileId: 'scene1.vns',
      line: 1,
      col: 10,
      endLine: 1,
      endCol: 15, // col + image.length (10 + 5)
    });
  });

  it('TC-AST-SPAN-02: extractScriptReferences should extract loc with endCol for background and sprite statements', () => {
    const dsl = `scene intro {
  background bg_room
  show alice.happy
}`;
    const result = compileString(dsl, 'intro.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs: ScriptReferences = extractScriptReferences(result.ast!);

    expect(refs.assets).toHaveLength(2);
    expect(refs.assets[0]?.loc).toBeDefined();
    expect(refs.assets[0]?.loc?.col).toBe(14);
    expect(refs.assets[0]?.loc?.endLine).toBe(2);
    expect(refs.assets[0]?.loc?.endCol).toBeDefined();
    expect(refs.assets[0]?.loc?.endCol).toBeGreaterThan(refs.assets[0]!.loc!.col!);

    expect(refs.assets[1]?.loc).toBeDefined();
    expect(refs.assets[1]?.loc?.col).toBe(8);
    expect(refs.assets[1]?.loc?.endLine).toBe(3);
    expect(refs.assets[1]?.loc?.endCol).toBeDefined();
    expect(refs.assets[1]?.loc?.endCol).toBeGreaterThan(refs.assets[1]!.loc!.col!);
  });

  it('TC-SPRITE-COMP-05: should extract sprite AssetReferences with tag, variant, category "sprite"', () => {
    const dsl = `scene sprite_demo {
  show alice.happy
  show sword
  hide alice
}`;
    const result = compileString(dsl, 'sprite_demo.vns');
    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();

    const refs = extractScriptReferences(result.ast!);
    expect(refs.assets).toHaveLength(3);

    // show alice.happy
    expect(refs.assets[0]).toMatchObject({
      assetKey: 'alice',
      variant: 'happy',
      category: 'sprite',
      expectedType: 'image',
      loc: { fileId: 'sprite_demo.vns', line: 2 },
    });

    // show sword (without variant)
    expect(refs.assets[1]).toMatchObject({
      assetKey: 'sword',
      category: 'sprite',
      expectedType: 'image',
      loc: { fileId: 'sprite_demo.vns', line: 3 },
    });

    // hide alice (no variant)
    expect(refs.assets[2]).toMatchObject({
      assetKey: 'alice',
      category: 'sprite',
      expectedType: 'image',
      loc: { fileId: 'sprite_demo.vns', line: 4 },
    });
  });
});
