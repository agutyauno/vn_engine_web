import { describe, it, expect } from 'vitest';
import type {
  Project,
  Instruction,
  VMState,
  VMSnapshot,
  SaveFileData,
  ExpressionAST,
  LiteralExpression,
  IdentifierExpression,
  BinaryExpression,
  UnaryExpression,
  CallExpression,
} from '../src';
import { CURRENT_SAVE_VERSION } from '../src';

describe('Shared Types & Data Contracts', () => {
  it('should instantiate a valid Project schema and serialize to JSON pure', () => {
    const project: Project = {
      id: '11111111-2222-3333-4444-555555555555',
      title: 'Học Viện Mùa Hạ - Tiếng Việt Có Dấu & Ký Tự Đặc Biệt (!@#$%)',
      version: 1,
      ownerId: 'user-uuid-123',
      defaultLanguage: 'vi',
      publishedGameId: 'game-slug-456',
      files: [
        {
          id: 'file-1',
          name: 'chapter1.vns',
          content: 'scene start { alice: "Chào bạn!" }',
          order: 0,
          version: 1,
        },
      ],
      characters: [
        {
          id: 'alice',
          name: 'Alice Carroll',
          colorHex: '#e91e63',
          sprites: { happy: 'asset-img-1', sad: 'asset-img-2' },
        },
      ],
      variables: [
        {
          name: 'affection',
          type: 'number',
          defaultValue: 0,
        },
      ],
      assets: [
        {
          id: 'asset-img-1',
          name: 'alice_happy.png',
          type: 'image',
          storageUrl: 'https://assets.example.com/alice_happy.png',
          sizeBytes: 102400,
        },
      ],
      uiScreens: [],
      customScripts: [],
    };

    // Serialize to JSON and parse back
    const jsonString = JSON.stringify(project);
    const parsed = JSON.parse(jsonString) as Project;

    expect(parsed.id).toBe(project.id);
    expect(parsed.title).toBe('Học Viện Mùa Hạ - Tiếng Việt Có Dấu & Ký Tự Đặc Biệt (!@#$%)');
    expect(parsed.publishedGameId).toBe('game-slug-456');
    expect(parsed.characters[0]?.name).toBe('Alice Carroll');
    expect(parsed.files[0]?.content).toContain('scene start');
  });

  it('should validate all ExpressionAST variants (literals, identifiers, binary, unary, call)', () => {
    const stringLit: LiteralExpression = { type: 'Literal', value: 'Xin chào', raw: '"Xin chào"' };
    const numLit: LiteralExpression = { type: 'Literal', value: 42.5, raw: '42.5' };
    const boolLit: LiteralExpression = { type: 'Literal', value: false, raw: 'false' };
    const nullLit: LiteralExpression = { type: 'Literal', value: null, raw: 'null' };

    const ident: IdentifierExpression = { type: 'Identifier', name: 'playerScore' };

    const unaryMinus: UnaryExpression = {
      type: 'UnaryExpression',
      operator: '-',
      prefix: true,
      argument: numLit,
    };
    const unaryNot: UnaryExpression = {
      type: 'UnaryExpression',
      operator: '!',
      prefix: true,
      argument: boolLit,
    };

    const binaryAdd: BinaryExpression = {
      type: 'BinaryExpression',
      operator: '+',
      left: ident,
      right: numLit,
    };

    const nestedBinary: BinaryExpression = {
      type: 'BinaryExpression',
      operator: '&&',
      left: {
        type: 'BinaryExpression',
        operator: '>=',
        left: ident,
        right: { type: 'Literal', value: 10 },
      },
      right: unaryNot,
    };

    const callExpr: CallExpression = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'has_item' },
      arguments: [stringLit, { type: 'Literal', value: 3 }],
    };

    const allExprs: ExpressionAST[] = [
      stringLit,
      numLit,
      boolLit,
      nullLit,
      ident,
      unaryMinus,
      unaryNot,
      binaryAdd,
      nestedBinary,
      callExpr,
    ];

    allExprs.forEach(expr => {
      const json = JSON.stringify(expr);
      const parsed = JSON.parse(json) as ExpressionAST;
      expect(parsed.type).toBe(expr.type);
    });
  });

  it('should cover all 15 standardized Instruction types with full properties and source locations', () => {
    const instructions: Instruction[] = [
      {
        type: 'SCENE',
        name: 'chapter1_intro',
        loc: { fileId: 'file-1', line: 1, col: 1 },
      },
      {
        type: 'BACKGROUND',
        assetId: 'bg_classroom',
        transition: 'fade',
        loc: { fileId: 'file-1', line: 2, col: 3 },
      },
      {
        type: 'SHOW',
        character: 'alice',
        sprite: 'happy',
        position: 'center',
        transition: 'dissolve',
        duration: 0.5,
        loc: { fileId: 'file-1', line: 3, col: 3 },
      },
      {
        type: 'HIDE',
        character: 'alice',
        loc: { fileId: 'file-1', line: 4, col: 3 },
      },
      {
        type: 'PLAY',
        channel: 'music',
        assetId: 'bgm_peaceful',
        volume: 0.8,
        loop: true,
        loc: { fileId: 'file-1', line: 5, col: 3 },
      },
      {
        type: 'STOP',
        channel: 'music',
        fadeOut: 1.5,
        loc: { fileId: 'file-1', line: 6, col: 3 },
      },
      {
        type: 'DIALOGUE',
        character: 'alice',
        displayNameOverride: '???',
        text: 'Cậu là ai vậy?',
        uiScreenId: 'custom_dialogue_ui',
        loc: { fileId: 'file-1', line: 7, col: 3 },
      },
      {
        type: 'REVEAL',
        characterId: 'alice',
        displayName: 'Alice Carroll',
        loc: { fileId: 'file-1', line: 8, col: 3 },
      },
      {
        type: 'ASSIGN',
        variable: 'affection',
        value: {
          type: 'BinaryExpression',
          operator: '+',
          left: { type: 'Identifier', name: 'affection' },
          right: { type: 'Literal', value: 10 },
        },
        loc: { fileId: 'file-1', line: 9, col: 3 },
      },
      {
        type: 'CHOICE',
        choices: [
          {
            text: 'Tặng hoa',
            targetScene: 'alice_flower',
            condition: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'has_item' },
              arguments: [{ type: 'Literal', value: 'flower' }],
            },
          },
          { text: 'Chào hỏi', targetScene: 'alice_greet' },
          { text: 'Im lặng', targetScene: 'stay_silent' },
        ],
        loc: { fileId: 'file-1', line: 10, col: 3 },
      },
      {
        type: 'GOTO',
        targetScene: 'chapter1_end',
        loc: { fileId: 'file-1', line: 11, col: 3 },
      },
      {
        type: 'CALL',
        targetScene: 'mini_game_subroutine',
        loc: { fileId: 'file-1', line: 12, col: 3 },
      },
      {
        type: 'RETURN',
        loc: { fileId: 'file-1', line: 13, col: 3 },
      },
      {
        type: 'LOOP_START',
        condition: {
          type: 'BinaryExpression',
          operator: '<',
          left: { type: 'Identifier', name: 'counter' },
          right: { type: 'Literal', value: 5 },
        },
        loopEndTargetScene: 'loop_exit',
        loc: { fileId: 'file-1', line: 14, col: 3 },
      },
      {
        type: 'LOOP_END',
        loopStartTargetScene: 'loop_header',
        loc: { fileId: 'file-1', line: 15, col: 3 },
      },
      {
        type: 'CONDITIONAL_GOTO',
        condition: { type: 'Identifier', name: 'isQuestCompleted' },
        targetScene: 'quest_reward',
        loc: { fileId: 'file-1', line: 16, col: 3 },
      },
    ];

    expect(instructions).toHaveLength(16);
    const types = new Set(instructions.map(i => i.type));
    expect(types.size).toBe(16);

    instructions.forEach(instr => {
      expect(instr.loc).toBeDefined();
      expect(instr.loc?.fileId).toBe('file-1');
      const cloned = JSON.parse(JSON.stringify(instr)) as Instruction;
      expect(cloned.type).toBe(instr.type);
    });
  });

  it('should handle edge cases in Project schema (empty files, assets, and unicode)', () => {
    const emptyProject: Project = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Empty Project',
      version: 1,
      ownerId: 'owner-1',
      defaultLanguage: 'en',
      files: [],
      characters: [],
      variables: [],
      assets: [],
      uiScreens: [],
      customScripts: [],
    };

    expect(emptyProject.files).toHaveLength(0);
    expect(emptyProject.publishedGameId).toBeUndefined();

    const parsedEmpty = JSON.parse(JSON.stringify(emptyProject)) as Project;
    expect(parsedEmpty.files).toEqual([]);
    expect(parsedEmpty.characters).toEqual([]);
  });

  it('should serialize and restore VMState and VMSnapshot properly', () => {
    const state: VMState = {
      currentScene: 'chapter1_scene1',
      instructionPointer: 5,
      callStack: [
        { scene: 'main', ip: 2 },
        { scene: 'sub_dialogue', ip: 12 },
      ],
      variables: {
        affection: 20,
        isMet: true,
        playerName: 'Khang',
        ratio: 3.14159,
        inventory: 'flower,key',
      },
      characterDisplayOverrides: { alice: 'Alice', bob: 'Bóng Đen' },
      customScriptState: { minigameScore: '999' },
    };

    const snapshot: VMSnapshot = {
      timestamp: 1710000000000,
      dialogueIndex: 3,
      state,
    };

    const serialized = JSON.stringify(snapshot);
    const restored = JSON.parse(serialized) as VMSnapshot;

    expect(restored.dialogueIndex).toBe(3);
    expect(restored.state.variables['affection']).toBe(20);
    expect(restored.state.variables['playerName']).toBe('Khang');
    expect(restored.state.variables['ratio']).toBe(3.14159);
    expect(restored.state.callStack).toHaveLength(2);
    expect(restored.state.characterDisplayOverrides['bob']).toBe('Bóng Đen');
    expect(restored.state.customScriptState['minigameScore']).toBe('999');
  });

  it('should serialize and restore SaveFileData schema properly', () => {
    const saveData: SaveFileData = {
      version: CURRENT_SAVE_VERSION,
      dslVersion: '1.0.0',
      timestamp: 1710000000000,
      dialogueCounter: 5,
      state: {
        currentScene: 'chapter1_scene1',
        instructionPointer: 10,
        callStack: [],
        variables: { score: 100 },
        characterDisplayOverrides: {},
        customScriptState: {},
      },
    };

    const serialized = JSON.stringify(saveData);
    const restored = JSON.parse(serialized) as SaveFileData;

    expect(restored.version).toBe(CURRENT_SAVE_VERSION);
    expect(restored.dslVersion).toBe('1.0.0');
    expect(restored.dialogueCounter).toBe(5);
    expect(restored.state.currentScene).toBe('chapter1_scene1');
    expect(restored.state.variables['score']).toBe(100);
  });
});
