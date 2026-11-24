import { describe, it, expect } from 'vitest';
import type {
  Project,
  Instruction,
  PauseInstruction,
  StatementAST,
  PauseStatement,
  StepResult,
  VMState,
  VMSnapshot,
  RollbackResult,
  SaveFileData,
  ExpressionAST,
  LiteralExpression,
  IdentifierExpression,
  BinaryExpression,
  UnaryExpression,
  CallExpression,
  AssetRef,
  ShowInstruction,
  HideInstruction,
  DialogueInstruction,
  ShowStatement,
  HideStatement,
  DialogueStatement,
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

  it('should cover all 16 standardized Instruction types with full properties and source locations', () => {
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
        targetId: 'alice',
        variant: 'happy',
        position: 'center',
        transition: 'dissolve',
        duration: 0.5,
        loc: { fileId: 'file-1', line: 3, col: 3 },
      },
      {
        type: 'HIDE',
        targetId: 'alice',
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
        speaker: '???',
        text: 'Cậu là ai vậy?',
        uiScreenId: 'custom_dialogue_ui',
        loc: { fileId: 'file-1', line: 7, col: 3 },
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
      {
        type: 'PAUSE',
        loc: { fileId: 'file-1', line: 17, col: 3 },
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

  it('should support PauseStatement as part of StatementAST contract', () => {
    const pauseStmt: PauseStatement = {
      type: 'PauseStatement',
      loc: { fileId: 'file-1', line: 10, col: 1 },
    };

    const stmt: StatementAST = pauseStmt;
    expect(stmt.type).toBe('PauseStatement');
    expect(stmt.loc?.fileId).toBe('file-1');

    const serialized = JSON.stringify(stmt);
    const parsed = JSON.parse(serialized) as StatementAST;
    expect(parsed.type).toBe('PauseStatement');
  });

  it('should support SUSPEND_PAUSE in StepResult contract', () => {
    const pauseInstr: PauseInstruction = {
      type: 'PAUSE',
      loc: { fileId: 'file-1', line: 10, col: 5 },
    };

    const stepResult: StepResult = {
      type: 'SUSPEND_PAUSE',
      instruction: pauseInstr,
    };

    expect(stepResult.type).toBe('SUSPEND_PAUSE');
    expect(stepResult.instruction.type).toBe('PAUSE');
    expect(stepResult.instruction.loc?.line).toBe(10);
  });

  it('should support interactionType PAUSE in VMSnapshot and preserve in serialization', () => {
    const state: VMState = {
      currentScene: 'cg_gallery',
      instructionPointer: 3,
      callStack: [],
      variables: {},
      localVariables: {},
      activeSprites: {},
      customScriptState: {},
    };

    const pauseSnapshot: VMSnapshot = {
      timestamp: 1710000005000,
      dialogueIndex: 2,
      interactionType: 'PAUSE',
      state,
    };

    const serialized = JSON.stringify(pauseSnapshot);
    const restored = JSON.parse(serialized) as VMSnapshot;

    expect(restored.interactionType).toBe('PAUSE');
    expect(restored.dialogueIndex).toBe(2);
  });

  it('should validate RollbackResult schema with interaction types', () => {
    const successResult: RollbackResult = {
      success: true,
      poppedInteractionType: 'PAUSE',
      restoredInteractionType: 'DIALOGUE',
    };

    const failedResult: RollbackResult = {
      success: false,
    };

    const choiceToPauseResult: RollbackResult = {
      success: true,
      poppedInteractionType: 'CHOICE',
      restoredInteractionType: 'PAUSE',
    };

    expect(successResult.success).toBe(true);
    expect(successResult.poppedInteractionType).toBe('PAUSE');
    expect(successResult.restoredInteractionType).toBe('DIALOGUE');

    expect(failedResult.success).toBe(false);
    expect(failedResult.poppedInteractionType).toBeUndefined();

    expect(choiceToPauseResult.poppedInteractionType).toBe('CHOICE');
    expect(choiceToPauseResult.restoredInteractionType).toBe('PAUSE');
  });

  it('should handle edge cases in Project schema (empty files, assets, and unicode)', () => {
    const emptyProject: Project = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Empty Project',
      version: 1,
      ownerId: 'owner-1',
      defaultLanguage: 'en',
      files: [],
      variables: [],
      assets: [],
      uiScreens: [],
      customScripts: [],
    };

    expect(emptyProject.files).toHaveLength(0);
    expect(emptyProject.publishedGameId).toBeUndefined();

    const parsedEmpty = JSON.parse(JSON.stringify(emptyProject)) as Project;
    expect(parsedEmpty.files).toEqual([]);
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
      activeSprites: {},
      customScriptState: { minigameScore: '999' },
      localVariables: {},
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
        activeSprites: {},
        customScriptState: {},
        localVariables: {},
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

  describe('Unified Sprite Layer & Literal Speaker Contracts (ADR-028)', () => {
    // TC-SPRITE-TYPES-01: AssetRef tag & variant metadata
    it('TC-SPRITE-TYPES-01: should support tag and variant in AssetRef for sprite category', () => {
      const spriteAsset: AssetRef = {
        id: '22222222-3333-4444-5555-666666666666',
        name: 'alice_happy.png',
        type: 'image',
        category: 'sprite',
        tag: 'alice',
        variant: 'happy',
        storageUrl: 'https://assets.example.com/alice_happy.png',
        sizeBytes: 204800,
        version: 1,
      };

      const propAsset: AssetRef = {
        id: '33333333-4444-5555-6666-777777777777',
        name: 'key_gold.png',
        type: 'image',
        category: 'sprite',
        tag: 'key_gold',
        variant: 'default',
        storageUrl: 'https://assets.example.com/key_gold.png',
        sizeBytes: 51200,
      };

      const nonSpriteAsset: AssetRef = {
        id: '44444444-5555-6666-7777-888888888888',
        name: 'bg_classroom.png',
        type: 'image',
        category: 'background',
        storageUrl: 'https://assets.example.com/bg_classroom.png',
        sizeBytes: 1048576,
      };

      expect(spriteAsset.tag).toBe('alice');
      expect(spriteAsset.variant).toBe('happy');
      expect(propAsset.tag).toBe('key_gold');
      expect(propAsset.variant).toBe('default');
      expect(nonSpriteAsset.tag).toBeUndefined();

      // Serialization & deserialization check
      const serialized = JSON.stringify([spriteAsset, propAsset, nonSpriteAsset]);
      const parsed = JSON.parse(serialized) as AssetRef[];

      expect(parsed[0]?.tag).toBe('alice');
      expect(parsed[0]?.variant).toBe('happy');
      expect(parsed[1]?.tag).toBe('key_gold');
      expect(parsed[1]?.variant).toBe('default');
      expect(parsed[2]?.tag).toBeUndefined();
    });

    // TC-SPRITE-TYPES-02: ShowInstruction, HideInstruction, ShowStatement, HideStatement
    it('TC-SPRITE-TYPES-02: should support targetId, variant, anchorX, anchorY in Show/Hide Instructions and Statements', () => {
      const showInstr: ShowInstruction = {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'smile',
        anchorX: 0.5,
        anchorY: 1.0,
        x: 960,
        y: 1080,
        transition: 'dissolve',
        duration: 0.3,
        loc: { fileId: 'chapter1.vns', line: 15, col: 1 },
      };

      const hideInstr: HideInstruction = {
        type: 'HIDE',
        targetId: 'alice',
        loc: { fileId: 'chapter1.vns', line: 20, col: 1 },
      };

      const showStmt: ShowStatement = {
        type: 'ShowStatement',
        targetId: 'sword',
        variant: 'legendary',
        anchorX: 0.5,
        anchorY: 0.5,
        x: 0.5,
        y: 0.5,
        loc: { fileId: 'chapter1.vns', line: 25, col: 1 },
      };

      const hideStmt: HideStatement = {
        type: 'HideStatement',
        targetId: 'sword',
        loc: { fileId: 'chapter1.vns', line: 30, col: 1 },
      };

      expect(showInstr.targetId).toBe('alice');
      expect(showInstr.variant).toBe('smile');
      expect(showInstr.anchorX).toBe(0.5);
      expect(showInstr.anchorY).toBe(1.0);

      expect(hideInstr.targetId).toBe('alice');

      expect(showStmt.targetId).toBe('sword');
      expect(showStmt.variant).toBe('legendary');
      expect(showStmt.anchorX).toBe(0.5);
      expect(showStmt.anchorY).toBe(0.5);

      expect(hideStmt.targetId).toBe('sword');

      // Polymorphic StatementAST handling
      const statements: StatementAST[] = [showStmt, hideStmt];
      expect(statements).toHaveLength(2);

      // Serialization preserves all unified sprite properties
      const parsedShowInstr = JSON.parse(JSON.stringify(showInstr)) as ShowInstruction;
      expect(parsedShowInstr.targetId).toBe('alice');
      expect(parsedShowInstr.variant).toBe('smile');
      expect(parsedShowInstr.anchorX).toBe(0.5);
      expect(parsedShowInstr.anchorY).toBe(1.0);

      const parsedHideInstr = JSON.parse(JSON.stringify(hideInstr)) as HideInstruction;
      expect(parsedHideInstr.targetId).toBe('alice');
    });

    // TC-SPRITE-TYPES-03: DialogueInstruction and DialogueStatement literal speaker
    it('TC-SPRITE-TYPES-03: should support speaker: string | null in DialogueInstruction and DialogueStatement', () => {
      // Literal speaker from string literal: "Alice Carroll"
      const namedDialogueInstr: DialogueInstruction = {
        type: 'DIALOGUE',
        speaker: 'Alice Carroll',
        character: 'Alice Carroll',
        text: 'Xin chào bạn, tôi là Alice Carroll!',
        uiScreenId: 'default_dialogue_ui',
        loc: { fileId: 'file-1', line: 10, col: 1 },
      };

      // Mysterious speaker: "???"
      const unknownDialogueStmt: DialogueStatement = {
        type: 'DialogueStatement',
        speaker: '???',
        character: '???',
        text: 'Ai đó đang tiến lại gần...',
        loc: { fileId: 'file-1', line: 11, col: 1 },
      };

      // Narration without speaker (speaker: null)
      const narrationInstr: DialogueInstruction = {
        type: 'DIALOGUE',
        speaker: null,
        character: '',
        text: 'Trời bắt đầu đổ cơn mưa rào mùa hạ.',
        loc: { fileId: 'file-1', line: 12, col: 1 },
      };

      const narrationStmt: DialogueStatement = {
        type: 'DialogueStatement',
        speaker: null,
        character: null,
        text: 'Tiếng sấm vang rền chân trời xa.',
        loc: { fileId: 'file-1', line: 13, col: 1 },
      };

      expect(namedDialogueInstr.speaker).toBe('Alice Carroll');
      expect(unknownDialogueStmt.speaker).toBe('???');
      expect(narrationInstr.speaker).toBeNull();
      expect(narrationStmt.speaker).toBeNull();

      // Serialization and round-trip preservation
      const restoredNamed = JSON.parse(JSON.stringify(namedDialogueInstr)) as DialogueInstruction;
      expect(restoredNamed.speaker).toBe('Alice Carroll');

      const restoredUnknown = JSON.parse(JSON.stringify(unknownDialogueStmt)) as DialogueStatement;
      expect(restoredUnknown.speaker).toBe('???');

      const restoredNarration = JSON.parse(JSON.stringify(narrationInstr)) as DialogueInstruction;
      expect(restoredNarration.speaker).toBeNull();
    });

    // TC-SPRITE-TYPES-04: Project schema without characters property
    it('TC-SPRITE-TYPES-04: should allow Project without characters array', () => {
      const unifiedProject: Project = {
        id: '99999999-8888-7777-6666-555555555555',
        title: 'Project Unified Sprites - No Characters Table',
        version: 2,
        ownerId: 'user-designer-001',
        defaultLanguage: 'vi',
        files: [
          {
            id: 'file-intro',
            name: 'intro.vns',
            content: 'scene start {\n  show alice.happy\n  "Alice Carroll": "Chào bạn!"\n}',
            order: 0,
            version: 1,
          },
        ],
        variables: [],
        assets: [
          {
            id: 'asset-alice-happy',
            name: 'alice_happy.png',
            type: 'image',
            category: 'sprite',
            tag: 'alice',
            variant: 'happy',
            storageUrl: 'https://assets.example.com/alice_happy.png',
            sizeBytes: 153600,
          },
        ],
        uiScreens: [],
        customScripts: [],
      };

      expect('characters' in unifiedProject).toBe(false);

      const serialized = JSON.stringify(unifiedProject);
      const parsed = JSON.parse(serialized) as Project;

      expect(parsed.id).toBe(unifiedProject.id);
      expect(Object.prototype.hasOwnProperty.call(parsed, 'characters')).toBe(false);
      expect(parsed.assets).toHaveLength(1);
      expect(parsed.assets[0]?.tag).toBe('alice');
      expect(parsed.assets[0]?.variant).toBe('happy');
    });

    // TC-SPRITE-TYPES-05: VMState activeSprites targetId mapping
    it('TC-SPRITE-TYPES-05: should store activeSprites keyed by targetId in VMState', () => {
      const aliceSprite: ShowInstruction = {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'happy',
        anchorX: 0.5,
        anchorY: 1.0,
        position: 'center',
        loc: { fileId: 'file-1', line: 5, col: 1 },
      };

      const swordProp: ShowInstruction = {
        type: 'SHOW',
        targetId: 'sword',
        variant: 'default',
        anchorX: 0.5,
        anchorY: 0.5,
        x: 400,
        y: 600,
        loc: { fileId: 'file-1', line: 6, col: 1 },
      };

      const vmState: VMState = {
        currentScene: 'chapter1',
        instructionPointer: 7,
        callStack: [],
        variables: { counter: 1 },
        localVariables: {},
        customScriptState: {},
        activeSprites: {
          alice: aliceSprite,
          sword: swordProp,
        },
      };

      expect(vmState.activeSprites).toBeDefined();
      expect(vmState.activeSprites!['alice']?.targetId).toBe('alice');
      expect(vmState.activeSprites!['alice']?.variant).toBe('happy');
      expect(vmState.activeSprites!['sword']?.targetId).toBe('sword');
      expect(vmState.activeSprites!['sword']?.anchorY).toBe(0.5);

      const serialized = JSON.stringify(vmState);
      const restored = JSON.parse(serialized) as VMState;

      expect(restored.activeSprites!['alice']?.targetId).toBe('alice');
      expect(restored.activeSprites!['sword']?.variant).toBe('default');
    });
  });
});
