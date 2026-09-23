// ==========================================
// STAGE 0: MERGE PASS & RESOLVE LOCAL SCENES
// ==========================================

import type {
  ProgramAST,
  SceneASTNode,
  StatementAST,
  ChoiceStatement,
  GotoStatement,
  CallStatement,
  DialogueStatement,
  IfStatement,
  WhileStatement,
} from '@vn-engine/shared-types';

export function resolveLocalSceneName(parentScene: string, localName: string): string {
  if (localName.startsWith('.')) {
    return `${parentScene}${localName}`;
  }
  return localName;
}

/**
 * Đệ quy resolve targetScene trong các câu lệnh bên trong một scene
 */
function resolveStatements(
  parentSceneName: string,
  parentUiScreenId: string | undefined,
  statements: StatementAST[],
): StatementAST[] {
  const resolved: StatementAST[] = [];

  for (const stmt of statements) {
    if (stmt.type === 'DialogueStatement') {
      const diag = stmt as DialogueStatement;
      resolved.push({
        ...diag,
        uiScreenId: diag.uiScreenId ?? parentUiScreenId,
      });
    } else if (stmt.type === 'GotoStatement') {
      const gt = stmt as GotoStatement;
      resolved.push({
        ...gt,
        targetScene: resolveLocalSceneName(parentSceneName, gt.targetScene),
      });
    } else if (stmt.type === 'CallStatement') {
      const cl = stmt as CallStatement;
      resolved.push({
        ...cl,
        targetScene: resolveLocalSceneName(parentSceneName, cl.targetScene),
      });
    } else if (stmt.type === 'ChoiceStatement') {
      const ch = stmt as ChoiceStatement;
      resolved.push({
        ...ch,
        uiScreenId: ch.uiScreenId ?? parentUiScreenId,
        choices: ch.choices.map(c => ({
          ...c,
          targetScene: resolveLocalSceneName(parentSceneName, c.targetScene),
        })),
      });
    } else if (stmt.type === 'IfStatement') {
      const ifStmt = stmt as IfStatement;
      let alternate: StatementAST[] | IfStatement | undefined;
      if (Array.isArray(ifStmt.alternate)) {
        alternate = resolveStatements(parentSceneName, parentUiScreenId, ifStmt.alternate);
      } else if (ifStmt.alternate) {
        alternate = resolveStatements(parentSceneName, parentUiScreenId, [
          ifStmt.alternate,
        ])[0] as IfStatement;
      }
      resolved.push({
        ...ifStmt,
        consequent: resolveStatements(parentSceneName, parentUiScreenId, ifStmt.consequent),
        alternate,
      });
    } else if (stmt.type === 'WhileStatement') {
      const wh = stmt as WhileStatement;
      resolved.push({
        ...wh,
        body: resolveStatements(parentSceneName, parentUiScreenId, wh.body),
      });
    } else {
      resolved.push(stmt);
    }
  }

  return resolved;
}

/**
 * Phẳng hóa các Scene cục bộ (sub-scenes) và kế thừa UI (ADR-015, ADR-016)
 */
export function runMergePass(ast: ProgramAST): ProgramAST {
  const flattenedScenes: SceneASTNode[] = [];

  for (const scene of ast.scenes) {
    // Nếu là sub-scene lồng trong scene khác (được tách ra)
    const normalBody: StatementAST[] = [];
    const embeddedSubScenes: SceneASTNode[] = [];

    for (const item of scene.body) {
      if ((item as unknown as { type: string }).type === 'Scene') {
        embeddedSubScenes.push(item as unknown as SceneASTNode);
      } else {
        normalBody.push(item);
      }
    }

    // 1. Resolve statements của scene cha
    const resolvedParentBody = resolveStatements(scene.name, scene.uiScreenId, normalBody);
    flattenedScenes.push({
      ...scene,
      body: resolvedParentBody,
    });

    // 2. Phẳng hóa các sub-scenes lồng bên trong thành các top-level Scene độc lập có tên canonical: parent.sub
    for (const sub of embeddedSubScenes) {
      const canonicalName = resolveLocalSceneName(scene.name, sub.name);
      const subUiScreenId = sub.uiScreenId ?? scene.uiScreenId;
      const resolvedSubBody = resolveStatements(scene.name, subUiScreenId, sub.body);

      flattenedScenes.push({
        type: 'Scene',
        name: canonicalName,
        uiScreenId: subUiScreenId,
        body: resolvedSubBody,
        loc: sub.loc,
      });
    }
  }

  return {
    type: 'Program',
    topLevelStatements: ast.topLevelStatements,
    scenes: flattenedScenes,
  };
}
