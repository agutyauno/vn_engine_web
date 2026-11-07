import { describe, it, expect } from 'vitest';
import type { EditorDiagnostic } from '../src/core/services/reconciliation';
import {
  calculateVariableInsertion,
  resolveQuickFixActions,
  type QuickFixContext,
  type VariableInsertionResult,
} from '../src/core/services/quickFixService';

describe('Unit Tests: QuickFix Service (Variable Insertion & Action Resolution)', () => {
  // ========================================================================
  // 1. calculateVariableInsertion Tests
  // ========================================================================
  describe('calculateVariableInsertion (DSL 1.1.0 Scoping Rules)', () => {
    const singleSceneScript = [
      '// Line 1: Header comment',
      'scene intro {',
      '    show alice.happy',
      '    score = score + 10',
      '    "Alice" "Welcome to our visual novel!"',
      '}',
    ].join('\n');

    const multiSceneScript = [
      'scene prologue {',
      '    "Narrator" "A long time ago..."',
      '}',
      '',
      'scene chapter1 {',
      '    gold = gold + 50',
      '    "Hero" "Found treasure!"',
      '}',
    ].join('\n');

    it('TC-QF-VAR-01: should insert global define statement right before enclosing scene block at col 1', () => {
      // Target line 4: '    score = score + 10' inside 'scene intro {' which is at line 2
      const result: VariableInsertionResult = calculateVariableInsertion(
        singleSceneScript,
        'score',
        'global',
        4,
      );

      expect(result.insertLine).toBe(2);
      expect(result.insertCol).toBe(1);
      expect(result.text).toBe('define score = 0\n');
      expect(result.newCursorLine).toBe(5); // Shifted down by 1 line
    });

    it('TC-QF-VAR-01 (Multi-scene): should locate the correct enclosing scene when multiple scenes exist', () => {
      // Target line 6: '    gold = gold + 50' inside 'scene chapter1 {' (line 5)
      const result: VariableInsertionResult = calculateVariableInsertion(
        multiSceneScript,
        'gold',
        'global',
        6,
      );

      expect(result.insertLine).toBe(5);
      expect(result.insertCol).toBe(1);
      expect(result.text).toBe('define gold = 0\n');
      expect(result.newCursorLine).toBe(7);
    });

    it('TC-QF-VAR-02: should insert local scene define statement right after scene declaration with 4-space indent', () => {
      // Target line 4 inside 'scene intro {' (line 2)
      const result: VariableInsertionResult = calculateVariableInsertion(
        singleSceneScript,
        'temp_score',
        'scene',
        4,
      );

      expect(result.insertLine).toBe(3); // Line right after 'scene intro {'
      expect(result.insertCol).toBe(1);
      expect(result.text).toBe('    define temp_score = 0\n');
      expect(result.newCursorLine).toBe(5);
    });

    it('TC-QF-VAR-03: should insert top-level define at line 1 when no scene block encloses the target line', () => {
      const topLevelScript = [
        '# Script configuration',
        'score = 100',
        '"Narrator" "Setting up variables"',
      ].join('\n');

      const result: VariableInsertionResult = calculateVariableInsertion(
        topLevelScript,
        'score',
        'global',
        2,
      );

      expect(result.insertLine).toBe(1);
      expect(result.insertCol).toBe(1);
      expect(result.text).toBe('define score = 0\n');
      expect(result.newCursorLine).toBe(3);
    });

    it('TC-QF-VAR-03 (Empty file): should safely insert define statement into completely empty file', () => {
      const result = calculateVariableInsertion('', 'uninit_var', 'global', 1);

      expect(result.insertLine).toBe(1);
      expect(result.insertCol).toBe(1);
      expect(result.text).toBe('define uninit_var = 0\n');
    });

    it('should correctly handle relative sub-scenes (ADR-015: scene .subscene {)', () => {
      const scriptWithSubscene = [
        'scene main {',
        '    scene .branch1 {',
        '        sub_val = 1',
        '    }',
        '}',
      ].join('\n');

      // Local scene variable inside .branch1 (line 2)
      const localResult = calculateVariableInsertion(
        scriptWithSubscene,
        'sub_val',
        'scene',
        3,
      );
      expect(localResult.insertLine).toBe(3);
      expect(localResult.text).toBe('        define sub_val = 0\n');

      // Global variable insertion should go before outer scene main (line 1)
      const globalResult = calculateVariableInsertion(
        scriptWithSubscene,
        'sub_val',
        'global',
        3,
      );
      expect(globalResult.insertLine).toBe(1);
      expect(globalResult.insertCol).toBe(1);
      expect(globalResult.text).toBe('define sub_val = 0\n');
    });
  });

  // ========================================================================
  // 2. resolveQuickFixActions Tests
  // ========================================================================
  describe('resolveQuickFixActions (Multi-Action Generation & Typo Correction)', () => {
    const sampleContext: QuickFixContext = {
      fileId: 'file-main',
      fileContent: [
        'scene intro {',
        '    background bg_schol',
        '    show alic.happy',
        '    scrore = scrore + 1',
        '}',
      ].join('\n'),
      cursorLine: 2,
      cursorCol: 16,
      diagnostics: [],
      projectCharacters: ['alice', 'bob'],
      projectAssets: [
        { id: 'ast-school', name: 'bg_school.png', category: 'background' },
        { id: 'ast-theme', name: 'bgm_theme.mp3', category: 'bgm' },
      ],
      projectVariables: ['score', 'playerName'],
    };

    it('TC-QF-ACTION-01: should generate create asset command and typo correction action when similar asset exists', () => {
      const assetDiagnostic: EditorDiagnostic = {
        id: 'diag-ast-1',
        category: 'asset',
        severity: 'warning',
        message: "Uncreated asset 'bg_schol' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 16,
        quickFix: {
          type: 'create_asset',
          targetId: 'bg_schol',
          prefillData: { name: 'bg_schol', category: 'background' },
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 2,
        diagnostics: [assetDiagnostic],
      };

      const actions = resolveQuickFixActions(context);

      // 1. Should have action to create asset modal
      const createAction = actions.find(a => a.command?.id === 'vn.editor.createAsset');
      expect(createAction).toBeDefined();
      expect(createAction?.title).toContain('bg_schol');
      expect(createAction?.kind).toBe('quickfix');
      expect(createAction?.command?.arguments).toEqual(['bg_schol', 'background']);

      // 2. Should have typo correction action suggesting 'bg_school.png' (dist <= 2)
      const typoAction = actions.find(a => a.isPreferred === true);
      expect(typoAction).toBeDefined();
      expect(typoAction?.title).toMatch(/bg_school/i);
      expect(typoAction?.edit).toBeDefined();
      expect(typoAction?.edit?.newText).toMatch(/bg_school/i);
    });

    it('TC-QF-ACTION-02: should generate create character command and typo correction when similar character exists', () => {
      const charDiagnostic: EditorDiagnostic = {
        id: 'diag-char-1',
        category: 'character',
        severity: 'warning',
        message: "Uncreated character 'alic' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 3,
        col: 10,
        quickFix: {
          type: 'create_character',
          targetId: 'alic',
          prefillData: { id: 'alic', name: 'alic' },
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 3,
        diagnostics: [charDiagnostic],
      };

      const actions = resolveQuickFixActions(context);

      // 1. Action to create character
      const createAction = actions.find(a => a.command?.id === 'vn.editor.createCharacter');
      expect(createAction).toBeDefined();
      expect(createAction?.title).toContain('alic');
      expect(createAction?.command?.arguments).toEqual(['alic']);

      // 2. Typo correction action suggesting 'alice' (dist 1)
      const typoAction = actions.find(a => a.isPreferred === true);
      expect(typoAction).toBeDefined();
      expect(typoAction?.title).toContain('alice');
      expect(typoAction?.edit?.newText).toBe('alice');
    });

    it('TC-QF-ACTION-03: should generate both global and scene local declare variable actions plus typo suggestion', () => {
      const varDiagnostic: EditorDiagnostic = {
        id: 'diag-var-1',
        category: 'compiler',
        severity: 'error',
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'scrore' is used before being defined",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 4,
        col: 5,
        quickFix: {
          type: 'define_variable',
          targetId: 'scrore',
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 4,
        diagnostics: [varDiagnostic],
      };

      const actions = resolveQuickFixActions(context);

      // 1. Declare global variable action
      const globalAction = actions.find(a => a.id.includes('global') || a.title.toLowerCase().includes('global'));
      expect(globalAction).toBeDefined();
      expect(globalAction?.edit?.newText).toContain('define scrore = 0');
      expect(globalAction?.edit?.range.startLine).toBe(1);

      // 2. Declare scene local variable action
      const sceneAction = actions.find(a => a.id.includes('scene') || a.title.toLowerCase().includes('scene'));
      expect(sceneAction).toBeDefined();
      expect(sceneAction?.edit?.newText).toContain('define scrore = 0');
      expect(sceneAction?.edit?.range.startLine).toBe(2);

      // 3. Typo correction action suggesting 'score' (dist 1)
      const typoAction = actions.find(a => a.isPreferred === true);
      expect(typoAction).toBeDefined();
      expect(typoAction?.title).toContain('score');
      expect(typoAction?.edit?.newText).toBe('score');
    });

    it('TC-QF-ACTION-04: should prioritize declare-scene-var as first action with isPreferred=true when error is inside a scene, and only generate global action when outside scene', () => {
      // 1. Error inside a scene block
      const insideSceneContent = [
        'scene intro {',
        '    score = 1',
        '}',
      ].join('\n');

      const varDiagInside: EditorDiagnostic = {
        id: 'diag-var-inside',
        category: 'compiler',
        severity: 'error',
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'score' is used before being defined",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 5,
        quickFix: {
          type: 'define_variable',
          targetId: 'score',
        },
      };

      const contextInside: QuickFixContext = {
        ...sampleContext,
        fileContent: insideSceneContent,
        cursorLine: 2,
        diagnostics: [varDiagInside],
        projectVariables: [],
      };

      const actionsInside = resolveQuickFixActions(contextInside);

      expect(actionsInside.length).toBe(2);

      // First action MUST be declare-scene-var with isPreferred: true
      const firstAction = actionsInside[0]!;
      expect(firstAction.id).toBe('declare-scene-var-score');
      expect(firstAction.isPreferred).toBe(true);
      expect(firstAction.title).toContain("Declare scene variable 'score'");
      expect(firstAction.edit?.newText).toBe('    define score = 0\n');
      expect(firstAction.edit?.range.startLine).toBe(2);

      // Second action MUST be declare-global-var with isPreferred falsy
      const secondAction = actionsInside[1]!;
      expect(secondAction.id).toBe('declare-global-var-score');
      expect(secondAction.isPreferred).toBeFalsy();
      expect(secondAction.title).toContain("Declare global variable 'score'");
      expect(secondAction.edit?.newText).toBe('define score = 0\n');
      expect(secondAction.edit?.range.startLine).toBe(1);

      // 2. Error outside any scene block (top-level)
      const outsideSceneContent = [
        'score = 1',
        'scene intro {',
        '    "Alice" "Hello"',
        '}',
      ].join('\n');

      const varDiagOutside: EditorDiagnostic = {
        id: 'diag-var-outside',
        category: 'compiler',
        severity: 'error',
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'score' is used before being defined",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 1,
        col: 1,
        quickFix: {
          type: 'define_variable',
          targetId: 'score',
        },
      };

      const contextOutside: QuickFixContext = {
        ...sampleContext,
        fileContent: outsideSceneContent,
        cursorLine: 1,
        diagnostics: [varDiagOutside],
        projectVariables: [],
      };

      const actionsOutside = resolveQuickFixActions(contextOutside);

      // Must only generate 1 action: declare-global-var (no duplicate scene var)
      expect(actionsOutside.length).toBe(1);
      expect(actionsOutside[0]!.id).toBe('declare-global-var-score');
      expect(actionsOutside[0]!.edit?.range.startLine).toBe(1);
      expect(actionsOutside[0]!.edit?.newText).toBe('define score = 0\n');
    });

    it('should ignore diagnostics on different lines than cursorLine', () => {
      const varDiagnostic: EditorDiagnostic = {
        id: 'diag-var-1',
        category: 'compiler',
        severity: 'error',
        message: 'Variable not found',
        line: 10,
        col: 1,
        quickFix: { type: 'define_variable', targetId: 'other_var' },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 2, // Cursor on line 2, diagnostic on line 10
        diagnostics: [varDiagnostic],
      };

      const actions = resolveQuickFixActions(context);
      expect(actions).toEqual([]);
    });

    it('should return empty actions array when no diagnostics exist', () => {
      const context: QuickFixContext = {
        ...sampleContext,
        diagnostics: [],
      };

      const actions = resolveQuickFixActions(context);
      expect(actions).toEqual([]);
    });

    // TC-QF-ACTION-05: Action Deduplication for Undeclared Assets
    it('TC-QF-ACTION-05: should deduplicate create_asset actions when multiple diagnostics exist for the same asset on the same line', () => {
      const diag1: EditorDiagnostic = {
        id: 'diag-ast-dup-1',
        category: 'asset',
        severity: 'warning',
        message: "Uncreated asset 'bg_forest.png' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 10,
        quickFix: {
          type: 'create_asset',
          targetId: 'bg_forest.png',
          prefillData: { name: 'bg_forest.png', category: 'background' },
        },
      };

      const diag2: EditorDiagnostic = {
        id: 'diag-ast-dup-2',
        category: 'compiler',
        severity: 'error',
        message: "Asset 'bg_forest.png' was not declared in project manifest",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 10,
        quickFix: {
          type: 'create_asset',
          targetId: 'bg_forest.png',
          prefillData: { name: 'bg_forest.png', category: 'background' },
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 2,
        diagnostics: [diag1, diag2],
      };

      const actions = resolveQuickFixActions(context);

      const createActions = actions.filter(
        a => a.id === 'create-asset-bg_forest.png' || a.title === "Create asset 'bg_forest.png'",
      );
      expect(createActions).toHaveLength(1);
      expect(createActions[0]!.id).toBe('create-asset-bg_forest.png');
      expect(createActions[0]!.command?.id).toBe('vn.editor.createAsset');
      expect(createActions[0]!.command?.arguments).toEqual(['bg_forest.png', 'background']);
    });

    // TC-QF-ACTION-05 (Generic Deduplication for Command and Edit Actions)
    it('TC-QF-ACTION-05 (Generic Deduplication): should deduplicate identical command and edit actions when multiple diagnostics trigger same quickfix mutations on the same line', () => {
      const varDiag1: EditorDiagnostic = {
        id: 'diag-var-dup-1',
        category: 'compiler',
        severity: 'error',
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'scrore' is used before being defined",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 4,
        col: 5,
        quickFix: {
          type: 'define_variable',
          targetId: 'scrore',
        },
      };

      const varDiag2: EditorDiagnostic = {
        id: 'diag-var-dup-2',
        category: 'compiler',
        severity: 'error',
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'scrore' is used before being defined",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 4,
        col: 14,
        quickFix: {
          type: 'define_variable',
          targetId: 'scrore',
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 4,
        diagnostics: [varDiag1, varDiag2],
      };

      const actions = resolveQuickFixActions(context);

      // 1. Kiểm tra không bị duplicate Scene Variable Action
      const sceneVarActions = actions.filter(a => a.id === 'declare-scene-var-scrore');
      expect(sceneVarActions).toHaveLength(1);

      // 2. Kiểm tra không bị duplicate Global Variable Action
      const globalVarActions = actions.filter(a => a.id === 'declare-global-var-scrore');
      expect(globalVarActions).toHaveLength(1);

      // 3. Kiểm tra không bị duplicate Typo Correction Action
      const typoActions = actions.filter(a => a.id.startsWith('fix-typo-var-scrore'));
      expect(typoActions).toHaveLength(1);

      // 4. Đảm bảo toàn bộ ID của các action sinh ra không có bất kỳ phần tử nào trùng nhau
      const actionIds = actions.map(a => a.id);
      const uniqueActionIds = new Set(actionIds);
      expect(actionIds.length).toBe(uniqueActionIds.size);
    });

    // TC-QF-EDGE-01: Multiple DISTINCT undeclared entities on the same line
    it('TC-QF-EDGE-01: should preserve distinct actions when multiple different entities are undeclared on the same line', () => {
      const assetDiag: EditorDiagnostic = {
        id: 'diag-ast-1',
        category: 'asset',
        severity: 'warning',
        message: "Uncreated asset 'bg_night' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 5,
        quickFix: {
          type: 'create_asset',
          targetId: 'bg_night',
          prefillData: { name: 'bg_night', category: 'background' },
        },
      };

      const varDiag: EditorDiagnostic = {
        id: 'diag-var-1',
        category: 'compiler',
        severity: 'error',
        code: 'ERR_SEMANTIC_UNDEFINED_VAR',
        message: "Variable 'player_name' is used before being defined",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 20,
        quickFix: {
          type: 'define_variable',
          targetId: 'player_name',
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 2,
        diagnostics: [assetDiag, varDiag],
      };

      const actions = resolveQuickFixActions(context);

      // Cả 2 action tạo asset và tạo biến đều phải xuất hiện đầy đủ
      const hasCreateAsset = actions.some(a => a.id === 'create-asset-bg_night');
      const hasSceneVar = actions.some(a => a.id === 'declare-scene-var-player_name');
      const hasGlobalVar = actions.some(a => a.id === 'declare-global-var-player_name');

      expect(hasCreateAsset).toBe(true);
      expect(hasSceneVar).toBe(true);
      expect(hasGlobalVar).toBe(true);
    });

    // TC-QF-EDGE-02: Audio category normalization for sfx and voice
    it('TC-QF-EDGE-02: should correctly preserve sfx and voice audio categories in createAsset command', () => {
      const sfxDiag: EditorDiagnostic = {
        id: 'diag-sfx-1',
        category: 'asset',
        severity: 'warning',
        message: "Uncreated sfx 'sfx_explosion' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 5,
        quickFix: {
          type: 'create_asset',
          targetId: 'sfx_explosion',
          prefillData: { name: 'sfx_explosion', category: 'sfx' },
        },
      };

      const voiceDiag: EditorDiagnostic = {
        id: 'diag-voice-1',
        category: 'asset',
        severity: 'warning',
        message: "Uncreated voice 'voice_alice_01' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 3,
        col: 5,
        quickFix: {
          type: 'create_asset',
          targetId: 'voice_alice_01',
          prefillData: { name: 'voice_alice_01', category: 'voice' },
        },
      };

      const sfxContext: QuickFixContext = {
        ...sampleContext,
        cursorLine: 2,
        diagnostics: [sfxDiag],
      };
      const sfxActions = resolveQuickFixActions(sfxContext);
      expect(sfxActions[0]?.command?.arguments).toEqual(['sfx_explosion', 'sfx']);

      const voiceContext: QuickFixContext = {
        ...sampleContext,
        cursorLine: 3,
        diagnostics: [voiceDiag],
      };
      const voiceActions = resolveQuickFixActions(voiceContext);
      expect(voiceActions[0]?.command?.arguments).toEqual(['voice_alice_01', 'voice']);
    });

    // TC-QF-EDGE-03: Hyphenated asset identifiers and fallback range finding
    it('TC-QF-EDGE-03: should accurately find target range for hyphenated asset names and extensions', () => {
      const customScript = [
        'scene intro {',
        '    background bg-forest-01.png',
        '}',
      ].join('\n');

      const hyphenDiag: EditorDiagnostic = {
        id: 'diag-hyphen-1',
        category: 'asset',
        severity: 'warning',
        message: "Uncreated asset 'bg-forest-01.png' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 2,
        col: 16,
        quickFix: {
          type: 'create_asset',
          targetId: 'bg-forest-01.png',
          prefillData: { name: 'bg-forest-01.png', category: 'background' },
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        fileContent: customScript,
        cursorLine: 2,
        diagnostics: [hyphenDiag],
        projectAssets: [{ id: 'bg-forest-02.png', name: 'bg-forest-02.png' }], // typo candidate dist 1
      };

      const actions = resolveQuickFixActions(context);

      const typoAction = actions.find(a => a.isPreferred === true);
      expect(typoAction).toBeDefined();
      expect(typoAction?.edit?.range.startLine).toBe(2);
      expect(typoAction?.edit?.range.startCol).toBe(16);
      expect(typoAction?.edit?.range.endCol).toBe(16 + 'bg-forest-01.png'.length);
      expect(typoAction?.edit?.newText).toBe('bg-forest-02.png');
    });

    // TC-QF-EDGE-04: Deduplicate character actions when duplicate character diagnostics exist
    it('TC-QF-EDGE-04: should deduplicate create_character actions when duplicate diagnostics exist on the same line', () => {
      const charDiag1: EditorDiagnostic = {
        id: 'diag-char-dup-1',
        category: 'character',
        severity: 'warning',
        message: "Uncreated character 'bob' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 3,
        col: 10,
        quickFix: {
          type: 'create_character',
          targetId: 'bob',
        },
      };

      const charDiag2: EditorDiagnostic = {
        id: 'diag-char-dup-2',
        category: 'character',
        severity: 'warning',
        message: "Uncreated character 'bob' referenced in script",
        fileName: 'main.vns',
        fileId: 'file-main',
        line: 3,
        col: 10,
        quickFix: {
          type: 'create_character',
          targetId: 'bob',
        },
      };

      const context: QuickFixContext = {
        ...sampleContext,
        cursorLine: 3,
        diagnostics: [charDiag1, charDiag2],
      };

      const actions = resolveQuickFixActions(context);

      const charActions = actions.filter(a => a.id === 'create-character-bob');
      expect(charActions).toHaveLength(1);
    });
  });
});

