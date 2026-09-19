// ==========================================
// STAGE 4: KIỂM TRA NGỮ NGHĨA (SEMANTIC VALIDATION)
// ==========================================

import type {
  ProgramAST,
  StatementAST,
  GotoStatement,
  CallStatement,
  ChoiceStatement,
  IfStatement,
  WhileStatement,
  SourceLocation,
} from '@vn-engine/shared-types';

export interface CompileError {
  message: string;
  loc?: SourceLocation;
}

export function validateSemantics(ast: ProgramAST): CompileError[] {
  const errors: CompileError[] = [];
  const definedSceneNames = new Set<string>();

  // 1. Kiểm tra trùng lặp tên Scene
  for (const scene of ast.scenes) {
    if (definedSceneNames.has(scene.name)) {
      errors.push({
        message: `Tên scene "${scene.name}" bị định nghĩa trùng lặp.`,
        loc: scene.loc,
      });
    }
    definedSceneNames.add(scene.name);
  }

  // 2. Hàm đệ quy kiểm tra tham chiếu targetScene
  function checkStatements(statements: StatementAST[]) {
    for (const stmt of statements) {
      if (stmt.type === 'GotoStatement') {
        const gt = stmt as GotoStatement;
        if (!definedSceneNames.has(gt.targetScene)) {
          errors.push({
            message: `Đích đến của goto "${gt.targetScene}" không tồn tại trong kịch bản.`,
            loc: gt.loc,
          });
        }
      } else if (stmt.type === 'CallStatement') {
        const cl = stmt as CallStatement;
        if (!definedSceneNames.has(cl.targetScene)) {
          errors.push({
            message: `Đích đến của call "${cl.targetScene}" không tồn tại trong kịch bản.`,
            loc: cl.loc,
          });
        }
      } else if (stmt.type === 'ChoiceStatement') {
        const ch = stmt as ChoiceStatement;
        for (const opt of ch.choices) {
          if (!definedSceneNames.has(opt.targetScene)) {
            errors.push({
              message: `Lựa chọn "${opt.text}" trỏ tới scene không tồn tại: "${opt.targetScene}".`,
              loc: opt.loc,
            });
          }
        }
      } else if (stmt.type === 'IfStatement') {
        const ifStmt = stmt as IfStatement;
        checkStatements(ifStmt.consequent);
        if (Array.isArray(ifStmt.alternate)) {
          checkStatements(ifStmt.alternate);
        } else if (ifStmt.alternate) {
          checkStatements([ifStmt.alternate]);
        }
      } else if (stmt.type === 'WhileStatement') {
        const wh = stmt as WhileStatement;
        checkStatements(wh.body);
      }
    }
  }

  for (const scene of ast.scenes) {
    checkStatements(scene.body);
  }

  return errors;
}
