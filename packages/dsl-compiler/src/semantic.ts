// ==========================================
// STAGE 4: KIỂM TRA NGỮ NGHĨA (SEMANTIC VALIDATION)
// ==========================================

import type {
  ProgramAST,
  StatementAST,
  GotoStatement,
  CallStatement,
  ChoiceStatement,
  DialogueStatement,
  RevealStatement,
  IfStatement,
  WhileStatement,
  VarDefineStatement,
  VarAssignStatement,
  SourceLocation,
} from '@vn-engine/shared-types';

export interface CompileError {
  message: string;
  loc?: SourceLocation;
}

const CONTROL_TAG_PATTERN = /^(pause|wait):|^(speed):|^(color):|^\/color$/i;
const KNOWN_FILTERS = new Set(['comma', 'upper', 'lower', 'capitalize', 'round']);

function checkInterpolatedVariables(
  text: string,
  globals: Set<string>,
  sceneLocals: Set<string>,
  sceneName: string,
  loc: SourceLocation | undefined,
  errors: CompileError[],
) {
  if (!text || (!text.includes('{') && !text.includes('\\{'))) return;

  // Bảo vệ ký hiệu escape \{ và \}
  const workingText = text.replace(/\\\{/g, '').replace(/\\\}/g, '');

  const matches = workingText.matchAll(/\{([^{}]+)\}/g);
  for (const m of matches) {
    const inner = (m[1] ?? '').trim();

    // Bỏ qua các thẻ điều khiển nhịp Typewriter
    if (CONTROL_TAG_PATTERN.test(inner)) {
      continue;
    }

    // Tách fallback ?? nếu có
    let expr = inner;
    const fallbackIdx = expr.indexOf('??');
    if (fallbackIdx !== -1) {
      expr = expr.slice(0, fallbackIdx).trim();
    }

    // Tách filter : nếu có
    const colonIdx = expr.lastIndexOf(':');
    if (colonIdx !== -1) {
      const potFilter = expr
        .slice(colonIdx + 1)
        .trim()
        .toLowerCase();
      if (KNOWN_FILTERS.has(potFilter)) {
        expr = expr.slice(0, colonIdx).trim();
      }
    }

    // Trích xuất các identifier từ biểu thức expr
    const identifiers = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
    if (identifiers) {
      for (const id of identifiers) {
        if (['true', 'false', 'null', 'undefined', 'has_item', 'get_script_result'].includes(id)) {
          continue;
        }
        if (!globals.has(id) && !sceneLocals.has(id)) {
          errors.push({
            message: `Biến '${id}' trong nội suy chuỗi "${m[0]}" chưa được khai báo (define) trong scene '${sceneName}'.`,
            loc,
          });
        }
      }
    }
  }
}

export function buildGlobalVariableSet(ast: ProgramAST): Set<string> {
  const globals = new Set<string>();
  if (ast.topLevelStatements) {
    for (const stmt of ast.topLevelStatements) {
      if (stmt.type === 'VarDefineStatement') {
        globals.add((stmt as VarDefineStatement).variable);
      }
    }
  }
  return globals;
}

export function validateSemantics(ast: ProgramAST): CompileError[] {
  const errors: CompileError[] = [];
  const definedSceneNames = new Set<string>();

  // 1. Kiểm tra biến Global ở top-level
  const globals = new Set<string>();
  if (ast.topLevelStatements) {
    for (const stmt of ast.topLevelStatements) {
      if (stmt.type === 'VarDefineStatement') {
        const def = stmt as VarDefineStatement;
        if (globals.has(def.variable)) {
          errors.push({
            message: `Biến global "${def.variable}" bị định nghĩa trùng lặp ở top-level.`,
            loc: def.loc,
          });
        }
        globals.add(def.variable);
      }
    }
  }

  // 2. Kiểm tra trùng lặp tên Scene
  for (const scene of ast.scenes) {
    if (definedSceneNames.has(scene.name)) {
      errors.push({
        message: `Tên scene "${scene.name}" bị định nghĩa trùng lặp.`,
        loc: scene.loc,
      });
    }
    definedSceneNames.add(scene.name);
  }

  // 3. Hàm đệ quy kiểm tra tham chiếu targetScene và phạm vi biến
  function checkStatements(
    sceneName: string,
    statements: StatementAST[],
    sceneLocals: Set<string>,
  ) {
    for (const stmt of statements) {
      if (stmt.type === 'DialogueStatement') {
        const diag = stmt as DialogueStatement;
        checkInterpolatedVariables(diag.text, globals, sceneLocals, sceneName, diag.loc, errors);
        if (diag.displayNameOverride) {
          checkInterpolatedVariables(
            diag.displayNameOverride,
            globals,
            sceneLocals,
            sceneName,
            diag.loc,
            errors,
          );
        }
      } else if (stmt.type === 'RevealStatement') {
        const rev = stmt as RevealStatement;
        checkInterpolatedVariables(
          rev.displayName,
          globals,
          sceneLocals,
          sceneName,
          rev.loc,
          errors,
        );
      } else if (stmt.type === 'GotoStatement') {
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
          checkInterpolatedVariables(opt.text, globals, sceneLocals, sceneName, opt.loc, errors);
          if (!definedSceneNames.has(opt.targetScene)) {
            errors.push({
              message: `Lựa chọn "${opt.text}" trỏ tới scene không tồn tại: "${opt.targetScene}".`,
              loc: opt.loc,
            });
          }
        }
      } else if (stmt.type === 'VarDefineStatement') {
        const def = stmt as VarDefineStatement;
        if (globals.has(def.variable)) {
          errors.push({
            message: `Biến '${def.variable}' đã được khai báo là global (ở top-level). Không thể dùng cùng tên '${def.variable}' làm biến local trong scene '${sceneName}'.`,
            loc: def.loc,
          });
        } else if (sceneLocals.has(def.variable)) {
          errors.push({
            message: `Biến local '${def.variable}' bị khai báo trùng lặp trong scene '${sceneName}'.`,
            loc: def.loc,
          });
        } else {
          sceneLocals.add(def.variable);
        }
      } else if (stmt.type === 'VarAssignStatement') {
        const va = stmt as VarAssignStatement;
        if (!globals.has(va.variable) && !sceneLocals.has(va.variable)) {
          errors.push({
            message: `Biến '${va.variable}' chưa được khai báo trước khi gán giá trị trong scene '${sceneName}'. Vui lòng dùng 'define ${va.variable} = ...' trước.`,
            loc: va.loc,
          });
        }
      } else if (stmt.type === 'IfStatement') {
        const ifStmt = stmt as IfStatement;
        checkStatements(sceneName, ifStmt.consequent, sceneLocals);
        if (Array.isArray(ifStmt.alternate)) {
          checkStatements(sceneName, ifStmt.alternate, sceneLocals);
        } else if (ifStmt.alternate) {
          checkStatements(sceneName, [ifStmt.alternate], sceneLocals);
        }
      } else if (stmt.type === 'WhileStatement') {
        const wh = stmt as WhileStatement;
        checkStatements(sceneName, wh.body, sceneLocals);
      }
    }
  }

  for (const scene of ast.scenes) {
    const sceneLocals = new Set<string>();
    checkStatements(scene.name, scene.body, sceneLocals);
  }

  return errors;
}
