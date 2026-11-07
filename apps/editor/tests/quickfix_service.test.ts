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
  });
});

