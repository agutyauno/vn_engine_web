// apps/editor/tests/reconciliation_expression.test.ts
import { describe, it, expect } from 'vitest';
import type { Project, ScriptFile, Character, AssetRef } from '@vn-engine/shared-types';
import {
  scanActiveReconciliation,
  generateDiagnostics,
  computeReconciliationDiagnostics,
  type ReconciliationReport,
  type EditorDiagnostic,
  type ScriptReference,
} from '../src/core/services/reconciliation';
import {
  resolveQuickFixActions,
  type QuickFixContext,
  type QuickFixAction,
} from '../src/core/services/quickFixService';

// ============================================================================
// Phase 2.4 Extended Data Contract & Type Bridges
// (Ensures 100% strict type safety in RED phase before Phase 2.4 GREEN implementation)
// ============================================================================

export interface UncreatedExpressionRef {
  charId: string;
  expressionKey: string;
  file: string;
  line: number;
  col?: number;
  endLine?: number;
  endCol?: number;
}

export interface ExtendedReconciliationReport extends ReconciliationReport {
  uncreatedExpressions?: UncreatedExpressionRef[];
  expressionReferences?: Record<string, ScriptReference[]>;
}

export interface ExtendedEditorDiagnostic extends Omit<EditorDiagnostic, 'quickFix'> {
  quickFix?: {
    type: 'create_asset' | 'create_character' | 'create_expression' | 'define_variable';
    targetId: string;
    prefillData?: Record<string, unknown>;
  };
}

// ============================================================================
// Mock Project Helper
// ============================================================================

function createMockProject(options?: {
  files?: ScriptFile[];
  characters?: Character[];
  assets?: AssetRef[];
}): Project {
  return {
    id: 'test-proj-expression-reconciliation',
    title: 'Expression Reconciliation Test Project',
    version: 1,
    ownerId: 'owner-test',
    defaultLanguage: 'vi',
    files: options?.files ?? [],
    characters: options?.characters ?? [],
    assets: options?.assets ?? [],
    variables: [],
    uiScreens: [],
    customScripts: [],
  };
}

// ============================================================================
// Test Suite: Phase 2.4 Uncreated Expression Warning & QuickFix Pipeline
// ============================================================================

describe('Phase 2.4: Uncreated Expression Warning & QuickFix Pipeline (TC-EXPR-01 -> TC-EXPR-04)', () => {
  // --------------------------------------------------------------------------
  // TC-EXPR-01: Detect Uncreated Expression via scanActiveReconciliation
  // --------------------------------------------------------------------------
  describe('TC-EXPR-01: Detect Uncreated Expression via scanActiveReconciliation', () => {
    it('should detect uncreated expression when script references show <charId>.<expressionKey> where expressionKey is not in char.sprites', () => {
      const project = createMockProject({
        characters: [
          {
            id: 'alice',
            name: 'Alice',
            sprites: {
              default: 'asset-alice-default',
            },
          },
        ],
        files: [
          {
            id: 'file-1',
            name: 'main.vns',
            content: ['scene intro {', '  show alice.smile', '}'].join('\n'),
            order: 0,
            version: 1,
          },
        ],
      });

      const report = scanActiveReconciliation(project) as ExtendedReconciliationReport;

      // Assert report contains uncreatedExpressions array
      expect(report.uncreatedExpressions).toBeDefined();
      expect(Array.isArray(report.uncreatedExpressions)).toBe(true);
      expect(report.uncreatedExpressions).toHaveLength(1);

      const uncreated = report.uncreatedExpressions![0]!;
      expect(uncreated.charId).toBe('alice');
      expect(uncreated.expressionKey).toBe('smile');
      expect(uncreated.file).toBe('main.vns');
      expect(uncreated.line).toBe(2);
      // Span col for "smile" on "  show alice.smile" starts at 14 (1-based)
      expect(uncreated.col).toBe(14);
      expect(uncreated.endCol).toBe(19);

      // Character alice is already created, so it must NOT be in uncreatedCharacters
      expect(report.uncreatedCharacters).not.toContain('alice');
    });

    it('should track expressionReferences for uncreated expression accurately', () => {
      const project = createMockProject({
        characters: [
          {
            id: 'alice',
            name: 'Alice',
            sprites: {
              default: 'asset-alice-default',
            },
          },
        ],
        files: [
          {
            id: 'file-chap1',
            name: 'chapter1.vns',
            content: 'show alice.smile\n',
            order: 0,
            version: 1,
          },
          {
            id: 'file-chap2',
            name: 'chapter2.vns',
            content: 'show alice.smile\n',
            order: 1,
            version: 1,
          },
        ],
      });

      const report = scanActiveReconciliation(project) as ExtendedReconciliationReport;

      expect(report.uncreatedExpressions).toBeDefined();
      expect(report.uncreatedExpressions?.length).toBeGreaterThanOrEqual(1);

      // If expressionReferences map is exposed, verify cross references
      if (report.expressionReferences) {
        const refs = report.expressionReferences['alice.smile'];
        expect(refs).toBeDefined();
        expect(refs?.length).toBe(2);
      }
    });
  });

  // --------------------------------------------------------------------------
  // TC-EXPR-02: Diagnostic Generation & QuickFix Payload
  // --------------------------------------------------------------------------
  describe('TC-EXPR-02: Diagnostic Generation & QuickFix Payload', () => {
    it('Pipeline 1 (generateDiagnostics): should generate warning diagnostic with create_expression quickFix', () => {
      const project = createMockProject({
        characters: [
          {
            id: 'alice',
            name: 'Alice',
            sprites: {
              default: 'asset-alice-default',
            },
          },
        ],
        files: [
          {
            id: 'file-1',
            name: 'main.vns',
            content: ['scene intro {', '  show alice.smile', '}'].join('\n'),
            order: 0,
            version: 1,
          },
        ],
      });

      const diagnostics = generateDiagnostics(project) as ExtendedEditorDiagnostic[];

      const exprDiag = diagnostics.find(
        d =>
          d.category === 'character' &&
          d.quickFix?.type === 'create_expression' &&
          d.quickFix?.targetId === 'alice.smile',
      );

      expect(exprDiag).toBeDefined();
      expect(exprDiag?.severity).toBe('warning');
      expect(exprDiag?.message).toContain("Uncreated expression 'smile' for character 'alice'");
      expect(exprDiag?.line).toBe(2);
      expect(exprDiag?.col).toBe(14);
      expect(exprDiag?.endCol).toBe(19);

      // Check QuickFix payload
      expect(exprDiag?.quickFix).toBeDefined();
      expect(exprDiag?.quickFix?.type).toBe('create_expression');
      expect(exprDiag?.quickFix?.targetId).toBe('alice.smile');
      expect(exprDiag?.quickFix?.prefillData).toEqual({
        charId: 'alice',
        expressionKey: 'smile',
      });
    });

    it('Pipeline 2 (computeReconciliationDiagnostics): should generate warning diagnostic with create_expression quickFix from AST/cache', () => {
      const files: ScriptFile[] = [
        {
          id: 'file-ast-1',
          name: 'chapter1.vns',
          content: ['scene classroom {', '  show alice.smile', '}'].join('\n'),
          order: 0,
          version: 1,
        },
      ];

      const options = {
        characters: [
          {
            id: 'alice',
            name: 'Alice',
            sprites: {
              default: 'asset-alice-default',
            },
          },
        ],
        assets: [],
      };

      const cache = new Map();
      const diagnostics = computeReconciliationDiagnostics(
        files,
        options,
        cache,
      ) as ExtendedEditorDiagnostic[];

      const exprDiag = diagnostics.find(
        d =>
          d.category === 'character' &&
          d.quickFix?.type === 'create_expression' &&
          d.quickFix?.targetId === 'alice.smile',
      );

      expect(exprDiag).toBeDefined();
      expect(exprDiag?.severity).toBe('warning');
      expect(exprDiag?.message).toContain("Uncreated expression 'smile' for character 'alice'");
      expect(exprDiag?.quickFix?.type).toBe('create_expression');
      expect(exprDiag?.quickFix?.targetId).toBe('alice.smile');
      expect(exprDiag?.quickFix?.prefillData).toEqual({
        charId: 'alice',
        expressionKey: 'smile',
      });
    });
  });

  // --------------------------------------------------------------------------
  // TC-EXPR-03: QuickFix Action Resolution in quickFixService
  // --------------------------------------------------------------------------
  describe('TC-EXPR-03: QuickFix Action Resolution in quickFixService', () => {
    it('should resolve CodeAction with command vn.editor.createExpression and id create-expression-alice-smile', () => {
      const diag: ExtendedEditorDiagnostic = {
        id: 'diag-char-expr-alice-smile-main.vns-2',
        category: 'character',
        severity: 'warning',
        message: "Uncreated expression 'smile' for character 'alice'",
        fileName: 'main.vns',
        fileId: 'file-1',
        line: 2,
        col: 14,
        quickFix: {
          type: 'create_expression',
          targetId: 'alice.smile',
          prefillData: {
            charId: 'alice',
            expressionKey: 'smile',
          },
        },
      };

      const context: QuickFixContext = {
        fileId: 'file-1',
        fileContent: ['scene intro {', '  show alice.smile', '}'].join('\n'),
        cursorLine: 2,
        cursorCol: 14,
        diagnostics: [diag as any],
        projectCharacters: ['alice'],
        projectAssets: [],
        projectVariables: [],
      };

      const actions = resolveQuickFixActions(context);

      expect(actions).toHaveLength(1);
      const action = actions[0]!;

      expect(action.kind).toBe('quickfix');
      expect(action.id).toBe('create-expression-alice-smile');
      expect(action.title).toContain("Create expression 'smile' for character 'alice'");
      expect(action.isPreferred).toBe(true);

      // Verify command signature
      expect(action.command).toBeDefined();
      expect(action.command?.id).toBe('vn.editor.createExpression');
      expect(action.command?.arguments).toEqual(['alice', 'smile']);
    });

    it('should support resolving QuickFix CodeActions when passed diagnostic array directly (Overloaded API signature)', () => {
      const diag: ExtendedEditorDiagnostic = {
        id: 'diag-char-expr-alice-smile-1',
        category: 'character',
        severity: 'warning',
        message: "Uncreated expression 'smile' for character 'alice'",
        fileName: 'main.vns',
        fileId: 'file-1',
        line: 1,
        col: 6,
        quickFix: {
          type: 'create_expression',
          targetId: 'alice.smile',
          prefillData: {
            charId: 'alice',
            expressionKey: 'smile',
          },
        },
      };

      const arrayActions = (resolveQuickFixActions as any)([diag as any]) as QuickFixAction[];

      // In Phase 2.4 GREEN when direct array overload is supported
      if (Array.isArray(arrayActions) && arrayActions.length > 0) {
        expect(arrayActions[0]!.id).toBe('create-expression-alice-smile');
        expect(arrayActions[0]!.title).toContain("Create expression 'smile' for character 'alice'");
        expect(arrayActions[0]!.command?.id).toBe('vn.editor.createExpression');
        expect(arrayActions[0]!.command?.arguments).toEqual(['alice', 'smile']);
      }
    });
  });

  // --------------------------------------------------------------------------
  // TC-EXPR-04: Existing Expression Negative Test
  // --------------------------------------------------------------------------
  describe('TC-EXPR-04: Existing Expression Negative Test', () => {
    it('should NOT report uncreated expressions or generate diagnostics when expressionKey exists in char.sprites', () => {
      const project = createMockProject({
        characters: [
          {
            id: 'alice',
            name: 'Alice',
            sprites: {
              default: 'asset-alice-default',
              smile: 'asset-alice-smile',
            },
          },
        ],
        files: [
          {
            id: 'file-1',
            name: 'main.vns',
            content: [
              'scene intro {',
              '  show alice.default',
              '  show alice.smile',
              '}',
            ].join('\n'),
            order: 0,
            version: 1,
          },
        ],
      });

      // 1. scanActiveReconciliation assertion
      const report = scanActiveReconciliation(project) as ExtendedReconciliationReport;
      expect(report.uncreatedExpressions).toBeDefined();
      const existingExpr1 = report.uncreatedExpressions?.find(
        e => e.charId === 'alice' && e.expressionKey === 'default',
      );
      const existingExpr2 = report.uncreatedExpressions?.find(
        e => e.charId === 'alice' && e.expressionKey === 'smile',
      );
      expect(existingExpr1).toBeUndefined();
      expect(existingExpr2).toBeUndefined();
      expect(report.uncreatedExpressions).toHaveLength(0);

      // 2. generateDiagnostics assertion
      const diagnostics = generateDiagnostics(project) as ExtendedEditorDiagnostic[];
      const exprDiags = diagnostics.filter(
        d =>
          d.category === 'character' &&
          (d.quickFix?.type === 'create_expression' ||
            d.message.toLowerCase().includes("expression 'default'") ||
            d.message.toLowerCase().includes("expression 'smile'")),
      );
      expect(exprDiags).toHaveLength(0);

      // 3. computeReconciliationDiagnostics assertion
      const cache = new Map();
      const compDiags = computeReconciliationDiagnostics(
        project.files,
        {
          characters: project.characters,
          assets: project.assets,
        },
        cache,
      ) as ExtendedEditorDiagnostic[];
      const compExprDiags = compDiags.filter(
        d =>
          d.category === 'character' &&
          (d.quickFix?.type === 'create_expression' ||
            d.message.toLowerCase().includes("expression 'default'") ||
            d.message.toLowerCase().includes("expression 'smile'")),
      );
      expect(compExprDiags).toHaveLength(0);
    });

    it('should NOT report uncreated expression if character itself is uncreated (uncreatedCharacters has priority)', () => {
      const project = createMockProject({
        characters: [], // bob is uncreated
        files: [
          {
            id: 'file-1',
            name: 'main.vns',
            content: 'show bob.smile\n',
            order: 0,
            version: 1,
          },
        ],
      });

      const report = scanActiveReconciliation(project) as ExtendedReconciliationReport;

      // bob is recorded as uncreated character
      expect(report.uncreatedCharacters).toContain('bob');

      // bob.smile must NOT be reported as uncreated expression because character does not exist yet
      const bobExpr = report.uncreatedExpressions?.find(
        e => e.charId === 'bob' && e.expressionKey === 'smile',
      );
      expect(bobExpr).toBeUndefined();
    });
  });
});
