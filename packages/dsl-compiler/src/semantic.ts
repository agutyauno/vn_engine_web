// ==========================================
// STAGE 4: KIỂM TRA NGỮ NGHĨA (SEMANTIC VALIDATION)
// ==========================================

import {
  SUPPORTED_TRANSITIONS,
  SUPPORTED_EASINGS,
  SUPPORTED_NAMED_POSITIONS,
  type ProgramAST,
  type SceneASTNode,
  type StatementAST,
  type GotoStatement,
  type CallStatement,
  type ChoiceStatement,
  type DialogueStatement,
  type RevealStatement,
  type IfStatement,
  type WhileStatement,
  type VarDefineStatement,
  type VarAssignStatement,
  type InspectStatement,
  type ShowStatement,
  type BackgroundStatement,
  type SourceLocation,
} from '@vn-engine/shared-types';

export interface CompileError {
  message: string;
  loc?: SourceLocation;
}

const VALID_TRANSITION_SET = new Set<string>(SUPPORTED_TRANSITIONS);
const VALID_EASING_SET = new Set<string>(SUPPORTED_EASINGS);
const VALID_POSITION_SET = new Set<string>(SUPPORTED_NAMED_POSITIONS);

const CONTROL_TAG_PATTERN = /^(pause|wait)\s*:|^(speed)\s*:|^(color)\s*:|^\s*\/color\s*$/i;
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
            message: `Variable '${id}' in string interpolation "${m[0]}" has not been defined in scene '${sceneName}'.`,
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

/**
 * Thu thập tất cả các SceneASTNode lồng bên trong danh sách câu lệnh (kể cả trong if, while, inspect)
 */
function collectSubScenes(statements: StatementAST[]): SceneASTNode[] {
  const result: SceneASTNode[] = [];
  for (const stmt of statements) {
    if ((stmt as unknown as { type: string }).type === 'Scene') {
      result.push(stmt as unknown as SceneASTNode);
    } else if (stmt.type === 'IfStatement') {
      const ifStmt = stmt as IfStatement;
      result.push(...collectSubScenes(ifStmt.consequent));
      if (Array.isArray(ifStmt.alternate)) {
        result.push(...collectSubScenes(ifStmt.alternate));
      } else if (ifStmt.alternate) {
        result.push(...collectSubScenes([ifStmt.alternate]));
      }
    } else if (stmt.type === 'WhileStatement') {
      const wh = stmt as WhileStatement;
      result.push(...collectSubScenes(wh.body));
    } else if (stmt.type === 'InspectStatement') {
      const ins = stmt as InspectStatement;
      if (ins.body) {
        result.push(...collectSubScenes(ins.body));
      }
    }
  }
  return result;
}

/**
 * Đệ quy kiểm tra các sub-scene bị lồng sâu hơn 1 cấp bên trong một local scene (ADR-015)
 */
function checkNestedSubScenes(parentSub: SceneASTNode, errors: CompileError[]) {
  const nestedScenes = collectSubScenes(parentSub.body);
  for (const nested of nestedScenes) {
    errors.push({
      message: `Local scene "${nested.name}" cannot be nested inside another local scene "${parentSub.name}". Sub-scenes are strictly limited to 1 level`,
      loc: nested.loc,
    });
    checkNestedSubScenes(nested, errors);
  }
}

/**
 * Kiểm tra tính hợp lệ của cấu trúc phân cấp Scene & Sub-scene (ADR-015: giới hạn tối đa 1 cấp lồng)
 * Áp dụng trên AST thô (raw AST) trước khi Merge Pass phẳng hóa.
 */
export function validateSceneStructure(ast: ProgramAST): CompileError[] {
  const errors: CompileError[] = [];

  for (const scene of ast.scenes) {
    // Không cho phép khai báo local scene bắt đầu bằng dấu '.' ở top-level
    if (scene.name.startsWith('.')) {
      errors.push({
        message: `Local scene "${scene.name}" cannot be declared at top-level. Sub-scenes must be nested inside a global scene.`,
        loc: scene.loc,
      });
    } else if (scene.name.includes('.')) {
      errors.push({
        message: `Global scene "${scene.name}" cannot contain '.' in its name. Dots are reserved for sub-scenes.`,
        loc: scene.loc,
      });
    }

    // Quét các câu lệnh trong scene.body
    for (const stmt of scene.body) {
      if ((stmt as unknown as { type: string }).type === 'Scene') {
        const sub = stmt as unknown as SceneASTNode;
        checkNestedSubScenes(sub, errors);
      } else {
        const blockSubScenes = collectSubScenes([stmt]);
        for (const nestedInBlock of blockSubScenes) {
          errors.push({
            message: `Local scene "${nestedInBlock.name}" cannot be declared inside a block. Sub-scenes must be declared directly in the scene body.`,
            loc: nestedInBlock.loc,
          });
          checkNestedSubScenes(nestedInBlock, errors);
        }
      }
    }
  }

  return errors;
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
            message: `Global variable "${def.variable}" is defined multiple times at top-level.`,
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
        message: `Scene name "${scene.name}" is defined multiple times.`,
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
            message: `Target of goto "${gt.targetScene}" does not exist in script.`,
            loc: gt.loc,
          });
        }
      } else if (stmt.type === 'CallStatement') {
        const cl = stmt as CallStatement;
        if (!definedSceneNames.has(cl.targetScene)) {
          errors.push({
            message: `Target of call "${cl.targetScene}" does not exist in script.`,
            loc: cl.loc,
          });
        }
      } else if (stmt.type === 'ChoiceStatement') {
        const ch = stmt as ChoiceStatement;
        for (const opt of ch.choices) {
          checkInterpolatedVariables(opt.text, globals, sceneLocals, sceneName, opt.loc, errors);
          if (!definedSceneNames.has(opt.targetScene)) {
            errors.push({
              message: `Choice "${opt.text}" points to non-existent scene: "${opt.targetScene}".`,
              loc: opt.loc,
            });
          }
        }
      } else if (stmt.type === 'VarDefineStatement') {
        const def = stmt as VarDefineStatement;
        if (globals.has(def.variable)) {
          errors.push({
            message: `Variable '${def.variable}' is already declared as global (at top-level). Cannot reuse '${def.variable}' as a local variable in scene '${sceneName}'.`,
            loc: def.loc,
          });
        } else if (sceneLocals.has(def.variable)) {
          errors.push({
            message: `Local variable '${def.variable}' is defined multiple times in scene '${sceneName}'.`,
            loc: def.loc,
          });
        } else {
          sceneLocals.add(def.variable);
        }
      } else if (stmt.type === 'VarAssignStatement') {
        const va = stmt as VarAssignStatement;
        if (!globals.has(va.variable) && !sceneLocals.has(va.variable)) {
          errors.push({
            message: `Variable '${va.variable}' must be declared before assignment in scene '${sceneName}'. Please use 'define ${va.variable} = ...' first.`,
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
      } else if (stmt.type === 'InspectStatement') {
        const ins = stmt as InspectStatement;
        if (ins.title) {
          checkInterpolatedVariables(ins.title, globals, sceneLocals, sceneName, ins.loc, errors);
        }
        if (ins.body) {
          checkStatements(sceneName, ins.body, sceneLocals);
        }
      } else if (stmt.type === 'ShowStatement') {
        const showStmt = stmt as ShowStatement;
        if (showStmt.position && (showStmt.x !== undefined || showStmt.y !== undefined)) {
          errors.push({
            message: `In show statement '${showStmt.character}', cannot use both 'position' and 'x'/'y' coordinates simultaneously.`,
            loc: showStmt.loc,
          });
        }
        if (
          typeof showStmt.position === 'string' &&
          !VALID_POSITION_SET.has(showStmt.position.toLowerCase())
        ) {
          errors.push({
            message: `In show statement '${showStmt.character}', unknown position "${showStmt.position}". Supported positions: ${SUPPORTED_NAMED_POSITIONS.join(', ')}.`,
            loc: showStmt.loc,
          });
        }
        if (showStmt.transition && !VALID_TRANSITION_SET.has(showStmt.transition.toLowerCase())) {
          errors.push({
            message: `In show statement '${showStmt.character}', unknown transition "${showStmt.transition}". Supported transitions: ${SUPPORTED_TRANSITIONS.join(', ')}.`,
            loc: showStmt.loc,
          });
        }
        if (showStmt.easing && !VALID_EASING_SET.has(showStmt.easing.toLowerCase())) {
          errors.push({
            message: `In show statement '${showStmt.character}', unknown easing "${showStmt.easing}". Supported easings: ${SUPPORTED_EASINGS.join(', ')}.`,
            loc: showStmt.loc,
          });
        }
      } else if (stmt.type === 'BackgroundStatement') {
        const bgStmt = stmt as BackgroundStatement;
        if (bgStmt.transition && !VALID_TRANSITION_SET.has(bgStmt.transition.toLowerCase())) {
          errors.push({
            message: `In background statement '${bgStmt.assetId}', unknown transition "${bgStmt.transition}". Supported transitions: ${SUPPORTED_TRANSITIONS.join(', ')}.`,
            loc: bgStmt.loc,
          });
        }
        if (bgStmt.easing && !VALID_EASING_SET.has(bgStmt.easing.toLowerCase())) {
          errors.push({
            message: `In background statement '${bgStmt.assetId}', unknown easing "${bgStmt.easing}". Supported easings: ${SUPPORTED_EASINGS.join(', ')}.`,
            loc: bgStmt.loc,
          });
        }
      }
    }
  }

  for (const scene of ast.scenes) {
    const sceneLocals = new Set<string>();
    checkStatements(scene.name, scene.body, sceneLocals);
  }

  return errors;
}
