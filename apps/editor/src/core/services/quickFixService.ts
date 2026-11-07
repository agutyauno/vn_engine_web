import type { AssetCategory } from '@vn-engine/shared-types';
import type { EditorDiagnostic } from './reconciliation';
import { findClosestMatches } from '../utils/fuzzyMatcher';

export interface QuickFixContext {
  fileId: string;
  fileContent: string;
  cursorLine: number;
  cursorCol: number;
  diagnostics: EditorDiagnostic[];
  projectCharacters: string[];
  projectAssets: Array<{ id: string; name?: string; category?: AssetCategory }>;
  projectVariables: string[];
}

export interface QuickFixAction {
  id: string;
  title: string;
  kind: 'quickfix';
  isPreferred?: boolean;
  edit?: {
    fileId: string;
    range: { startLine: number; startCol: number; endLine: number; endCol: number };
    newText: string;
  };
  command?: {
    id: string;
    arguments?: unknown[];
  };
}

export interface VariableInsertionResult {
  insertLine: number;
  insertCol: number;
  text: string;
  newCursorLine: number;
}

interface SceneInfo {
  name: string;
  startLine: number;
  endLine: number;
  indent: string;
  isSubScene: boolean;
}

/**
 * Phân tích cấu trúc các block scene trong tệp kịch bản VNS để phục vụ định vị chèn biến.
 */
function parseScenes(lines: string[]): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  const stack: Array<{
    name: string;
    startLine: number;
    indent: string;
    isSubScene: boolean;
    openBraceCount: number;
  }> = [];

  let currentBraces = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i]!;

    const sceneMatch = line.match(/^(\s*)scene\s+([a-zA-Z0-9_.]+)/);
    if (sceneMatch) {
      const indent = sceneMatch[1] || '';
      const name = sceneMatch[2] || '';
      const isSubScene = name.startsWith('.') || indent.length > 0;

      stack.push({
        name,
        startLine: lineNum,
        indent,
        isSubScene,
        openBraceCount: currentBraces,
      });
    }

    for (let c = 0; c < line.length; c++) {
      if (line[c] === '{') {
        currentBraces++;
      } else if (line[c] === '}') {
        currentBraces--;
        if (stack.length > 0 && currentBraces <= stack[stack.length - 1]!.openBraceCount) {
          const finished = stack.pop()!;
          scenes.push({
            name: finished.name,
            startLine: finished.startLine,
            endLine: lineNum,
            indent: finished.indent,
            isSubScene: finished.isSubScene,
          });
        }
      }
    }
  }

  while (stack.length > 0) {
    const finished = stack.pop()!;
    scenes.push({
      name: finished.name,
      startLine: finished.startLine,
      endLine: lines.length,
      indent: finished.indent,
      isSubScene: finished.isSubScene,
    });
  }

  return scenes;
}

/**
 * Tính toán vị trí và nội dung chèn câu lệnh khai báo biến (DSL 1.1.0 Scoping Rules):
 * - Toàn cục (Global):
 *   - Nếu trong một scene bao bọc: Chèn trước dòng bắt đầu của global scene cha tại col 1.
 *   - Nếu không nằm trong scene (top-level): Chèn tại dòng 1 của tệp tại col 1.
 * - Cục bộ (Scene Local):
 *   - Chèn ngay sau dòng khai báo của innermost scene bao bọc với thụt lề chuẩn (indent + 4 spaces).
 */
export function calculateVariableInsertion(
  content: string,
  varName: string,
  scope: 'global' | 'scene',
  errorLine: number,
): VariableInsertionResult {
  const lines = content.split('\n');
  const scenes = parseScenes(lines);

  const enclosingScenes = scenes.filter(
    s => s.startLine <= errorLine && errorLine <= s.endLine,
  );

  if (scope === 'global') {
    if (enclosingScenes.length === 0) {
      return {
        insertLine: 1,
        insertCol: 1,
        text: `define ${varName} = 0\n`,
        newCursorLine: errorLine + 1,
      };
    }

    const globalScene = enclosingScenes.find(s => !s.isSubScene) || enclosingScenes[0]!;
    return {
      insertLine: globalScene.startLine,
      insertCol: 1,
      text: `define ${varName} = 0\n`,
      newCursorLine: errorLine + 1,
    };
  }

  // scope === 'scene'
  if (enclosingScenes.length === 0) {
    return {
      insertLine: 1,
      insertCol: 1,
      text: `define ${varName} = 0\n`,
      newCursorLine: errorLine + 1,
    };
  }

  const innerScene = enclosingScenes.reduce((prev, curr) =>
    curr.startLine > prev.startLine ? curr : prev,
  );

  const localIndent = innerScene.indent + '    ';
  return {
    insertLine: innerScene.startLine + 1,
    insertCol: 1,
    text: `${localIndent}define ${varName} = 0\n`,
    newCursorLine: errorLine + 1,
  };
}

function findTargetRangeOnLine(
  content: string,
  lineNumber: number,
  targetId: string,
  fallbackCol = 1,
): { startLine: number; startCol: number; endLine: number; endCol: number } {
  const lines = content.split('\n');
  const line = lines[lineNumber - 1] || '';

  const escaped = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`);
  const match = line.match(regex);
  if (match && match.index !== undefined) {
    const startCol = match.index + 1;
    return {
      startLine: lineNumber,
      startCol,
      endLine: lineNumber,
      endCol: startCol + targetId.length,
    };
  }

  const idx = line.indexOf(targetId);
  if (idx !== -1) {
    const startCol = idx + 1;
    return {
      startLine: lineNumber,
      startCol,
      endLine: lineNumber,
      endCol: startCol + targetId.length,
    };
  }

  return {
    startLine: lineNumber,
    startCol: fallbackCol,
    endLine: lineNumber,
    endCol: fallbackCol + targetId.length,
  };
}

/**
 * Sinh danh sách QuickFixAction từ chẩn đoán lỗi tại vị trí con trỏ.
 */
export function resolveQuickFixActions(context: QuickFixContext): QuickFixAction[] {
  if (!context.diagnostics || context.diagnostics.length === 0) {
    return [];
  }

  const actions: QuickFixAction[] = [];
  const lineDiags = context.diagnostics.filter(
    d => d.line !== undefined && d.line === context.cursorLine,
  );

  for (const diag of lineDiags) {
    const qf = diag.quickFix;
    if (!qf) continue;

    const targetId = qf.targetId;
    if (!targetId) continue;

    const diagLine = diag.line ?? context.cursorLine;

    switch (qf.type) {
      case 'create_asset': {
        const rawCat = (qf.prefillData?.category as string) || 'background';
        const category = rawCat === 'audio' ? 'bgm' : rawCat === 'backgrounds' ? 'background' : rawCat;

        actions.push({
          id: `create-asset-${targetId}`,
          title: `Create asset '${targetId}'`,
          kind: 'quickfix',
          command: {
            id: 'vn.editor.createAsset',
            arguments: [targetId, category],
          },
        });

        // So khớp typo tương tự trong projectAssets
        const assetMap = new Map<string, string>();
        const candidateNames: string[] = [];

        for (const ast of context.projectAssets || []) {
          const rawName = ast.name || ast.id;
          if (!rawName) continue;
          candidateNames.push(rawName);
          assetMap.set(rawName.toLowerCase(), rawName);

          const baseName = rawName.replace(/\.[a-zA-Z0-9]+$/, '');
          if (baseName !== rawName) {
            candidateNames.push(baseName);
            assetMap.set(baseName.toLowerCase(), rawName);
          }
        }

        const matches = findClosestMatches(targetId, candidateNames, 2, 1);
        if (matches.length > 0) {
          const matchedCandidate = matches[0]!;
          const actualAsset = assetMap.get(matchedCandidate.toLowerCase()) || matchedCandidate;
          const targetRange = findTargetRangeOnLine(
            context.fileContent,
            diagLine,
            targetId,
            diag.col,
          );

          actions.push({
            id: `fix-typo-asset-${targetId}-${actualAsset}`,
            title: `Change to '${actualAsset}'`,
            kind: 'quickfix',
            isPreferred: true,
            edit: {
              fileId: context.fileId,
              range: targetRange,
              newText: actualAsset,
            },
          });
        }
        break;
      }

      case 'create_character': {
        actions.push({
          id: `create-character-${targetId}`,
          title: `Create character '${targetId}'`,
          kind: 'quickfix',
          command: {
            id: 'vn.editor.createCharacter',
            arguments: [targetId],
          },
        });

        const matches = findClosestMatches(targetId, context.projectCharacters || [], 2, 1);
        if (matches.length > 0) {
          const bestMatch = matches[0]!;
          const targetRange = findTargetRangeOnLine(
            context.fileContent,
            diagLine,
            targetId,
            diag.col,
          );

          actions.push({
            id: `fix-typo-char-${targetId}-${bestMatch}`,
            title: `Change to '${bestMatch}'`,
            kind: 'quickfix',
            isPreferred: true,
            edit: {
              fileId: context.fileId,
              range: targetRange,
              newText: bestMatch,
            },
          });
        }
        break;
      }

      case 'define_variable': {
        const lines = context.fileContent.split('\n');
        const scenes = parseScenes(lines);
        const enclosingScenes = scenes.filter(
          s => s.startLine <= diagLine && diagLine <= s.endLine,
        );
        const isInsideScene = enclosingScenes.length > 0;

        const matches = findClosestMatches(targetId, context.projectVariables || [], 2, 1);
        const hasTypoMatch = matches.length > 0;

        if (isInsideScene) {
          // 1. Declare scene variable (preferred for inside scene if no typo match)
          const sceneInsert = calculateVariableInsertion(
            context.fileContent,
            targetId,
            'scene',
            diagLine,
          );
          actions.push({
            id: `declare-scene-var-${targetId}`,
            title: `Declare scene variable '${targetId}'`,
            kind: 'quickfix',
            isPreferred: !hasTypoMatch,
            edit: {
              fileId: context.fileId,
              range: {
                startLine: sceneInsert.insertLine,
                startCol: sceneInsert.insertCol,
                endLine: sceneInsert.insertLine,
                endCol: sceneInsert.insertCol,
              },
              newText: sceneInsert.text,
            },
          });

          // 2. Declare global variable (secondary choice)
          const globalInsert = calculateVariableInsertion(
            context.fileContent,
            targetId,
            'global',
            diagLine,
          );
          actions.push({
            id: `declare-global-var-${targetId}`,
            title: `Declare global variable '${targetId}'`,
            kind: 'quickfix',
            isPreferred: false,
            edit: {
              fileId: context.fileId,
              range: {
                startLine: globalInsert.insertLine,
                startCol: globalInsert.insertCol,
                endLine: globalInsert.insertLine,
                endCol: globalInsert.insertCol,
              },
              newText: globalInsert.text,
            },
          });
        } else {
          // Top-level (outside scene): only declare global variable
          const globalInsert = calculateVariableInsertion(
            context.fileContent,
            targetId,
            'global',
            diagLine,
          );
          actions.push({
            id: `declare-global-var-${targetId}`,
            title: `Declare global variable '${targetId}'`,
            kind: 'quickfix',
            isPreferred: !hasTypoMatch,
            edit: {
              fileId: context.fileId,
              range: {
                startLine: globalInsert.insertLine,
                startCol: globalInsert.insertCol,
                endLine: globalInsert.insertLine,
                endCol: globalInsert.insertCol,
              },
              newText: globalInsert.text,
            },
          });
        }

        // 3. Typo correction
        if (hasTypoMatch) {
          const bestMatch = matches[0]!;
          const targetRange = findTargetRangeOnLine(
            context.fileContent,
            diagLine,
            targetId,
            diag.col,
          );

          actions.push({
            id: `fix-typo-var-${targetId}-${bestMatch}`,
            title: `Change to '${bestMatch}'`,
            kind: 'quickfix',
            isPreferred: true,
            edit: {
              fileId: context.fileId,
              range: targetRange,
              newText: bestMatch,
            },
          });
        }
        break;
      }
    }
  }

  return actions;
}

