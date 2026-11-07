import type { Project, EngineDiagnostic, ScriptFile, Character, ProgramAST } from '@vn-engine/shared-types';
import {
  VNSLexer,
  parserInstance,
  VNSAstBuilder,
  extractScriptReferences,
  type ScriptReferences,
} from '@vn-engine/dsl-compiler';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export type DiagnosticCategory = 'compiler' | 'asset' | 'character' | 'runtime' | 'storage';

export interface EditorDiagnostic extends Omit<EngineDiagnostic, 'timestamp'> {
  timestamp?: number;
  fileName?: string;
  quickFix?: {
    type: 'create_asset' | 'create_character' | 'define_variable';
    targetId: string;
    prefillData?: Record<string, unknown>;
  };
}

export type GeneratedEditorDiagnostic = EditorDiagnostic & EngineDiagnostic;

export interface ScriptReference {
  file: string;
  line: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  type?: 'background' | 'audio' | 'inspect' | 'character';
}

export interface ReconciliationReport {
  uncreatedCharacters: string[];
  uncreatedAssets: string[];
  unusedAssets: string[];
  assetReferences: Record<string, ScriptReference[]>;
  characterReferences: Record<string, ScriptReference[]>;
}

export interface DeletionSafetyResult {
  safe: boolean;
  references: ScriptReference[];
  error?: string;
}

export function scanActiveReconciliation(project: Project): ReconciliationReport {
  const assetRefMap: Record<string, ScriptReference[]> = {};
  const charRefMap: Record<string, ScriptReference[]> = {};

  const recordAssetRef = (
    assetName: string,
    file: string,
    line: number,
    type: 'background' | 'audio' | 'inspect',
  ) => {
    const cleanName = assetName.trim();
    if (!cleanName) return;
    if (!assetRefMap[cleanName]) {
      assetRefMap[cleanName] = [];
    }
    assetRefMap[cleanName]!.push({ file, line, type });
  };

  const recordCharRef = (charId: string, file: string, line: number) => {
    const cleanId = charId.trim().toLowerCase();
    if (!cleanId) return;
    if (!charRefMap[cleanId]) {
      charRefMap[cleanId] = [];
    }
    charRefMap[cleanId]!.push({ file, line, type: 'character' });
  };

  for (const file of project.files || []) {
    const fileName = file.name || 'unnamed.vns';
    const lines = (file.content || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i]!;
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }

      // DSL 1.1.0: background <asset_id> (with optional args/transition)
      const bgMatch = trimmed.match(/^background\s+([a-zA-Z0-9_]+)(?:\s*\(|\s+transition:|\s*$)/i);
      if (bgMatch && bgMatch[1]) {
        recordAssetRef(bgMatch[1], fileName, lineNum, 'background');
      }

      // Legacy support: scene "bg_filename.ext" (quoted with file extension, not scene block declaration)
      const legacySceneMatch = trimmed.match(/^scene\s+["']([^"']+\.[a-zA-Z0-9]+)["']/i);
      if (legacySceneMatch && legacySceneMatch[1]) {
        recordAssetRef(legacySceneMatch[1], fileName, lineNum, 'background');
      }

      // Show character: show <char_id>.<expression> or show <char_id>
      const showMatch = trimmed.match(/^show\s+([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?/i);
      if (showMatch && showMatch[1]) {
        recordCharRef(showMatch[1], fileName, lineNum);
      }

      // Hide character: hide <char_id>
      const hideMatch = trimmed.match(/^hide\s+([a-zA-Z0-9_]+)/i);
      if (hideMatch && hideMatch[1]) {
        recordCharRef(hideMatch[1], fileName, lineNum);
      }

      // Dialogue lines (char: "..." or char as "...": "...") and reveal statements
      // represent spoken dialogue or text aliases and do NOT require visual sprites in CharacterManager.
      // Therefore, they are not recorded as character references for uncreated character warnings.

      // Audio statements: play music/sound/voice/bgs <asset_id>
      const playMatch = trimmed.match(/^play\s+(?:music|sound|voice|bgs)\s+["']?([^"'\s]+)["']?/i);
      if (playMatch && playMatch[1]) {
        recordAssetRef(playMatch[1], fileName, lineNum, 'audio');
      }

      // Inspect statements
      const inspectMatch = trimmed.match(/^inspect\s+["']?([^"'\s]+)["']?/i);
      if (inspectMatch && inspectMatch[1]) {
        recordAssetRef(inspectMatch[1], fileName, lineNum, 'inspect');
      }
    }
  }

  const knownCharIds = new Set(
    (project.characters || []).map(c => (c.id || '').trim().toLowerCase()),
  );

  const knownAssetKeys = new Set<string>();
  for (const asset of project.assets || []) {
    if (asset.id) {
      knownAssetKeys.add(asset.id.trim());
      knownAssetKeys.add(asset.id.trim().toLowerCase());
    }
    if (asset.name) {
      knownAssetKeys.add(asset.name.trim());
      knownAssetKeys.add(asset.name.trim().toLowerCase());
    }
  }

  const uncreatedCharacters: string[] = [];
  for (const charId of Object.keys(charRefMap)) {
    if (!knownCharIds.has(charId)) {
      uncreatedCharacters.push(charId);
    }
  }

  const uncreatedAssets: string[] = [];
  for (const assetRef of Object.keys(assetRefMap)) {
    if (!knownAssetKeys.has(assetRef) && !knownAssetKeys.has(assetRef.toLowerCase())) {
      uncreatedAssets.push(assetRef);
    }
  }

  const unusedAssets: string[] = [];
  for (const asset of project.assets || []) {
    const nameMatches = assetRefMap[asset.name] || assetRefMap[asset.name.toLowerCase()];
    const idMatches = assetRefMap[asset.id] || assetRefMap[asset.id.toLowerCase()];
    if ((!nameMatches || nameMatches.length === 0) && (!idMatches || idMatches.length === 0)) {
      unusedAssets.push(asset.name);
    }
  }

  return {
    uncreatedCharacters,
    uncreatedAssets,
    unusedAssets,
    assetReferences: assetRefMap,
    characterReferences: charRefMap,
  };
}

export function checkAssetDeletionSafety(
  assetIdOrName: string,
  project: Project,
): DeletionSafetyResult {
  const target = (assetIdOrName || '').trim();
  if (!target) {
    return { safe: true, references: [] };
  }

  const matchedAsset = (project.assets || []).find(
    a => a.id === target || a.name === target || a.name.toLowerCase() === target.toLowerCase(),
  );

  const report = scanActiveReconciliation(project);

  const refsByName =
    report.assetReferences[target] || report.assetReferences[target.toLowerCase()] || [];
  let refsByMatchedName: ScriptReference[] = [];
  let refsByMatchedId: ScriptReference[] = [];

  if (matchedAsset) {
    refsByMatchedName =
      report.assetReferences[matchedAsset.name] ||
      report.assetReferences[matchedAsset.name.toLowerCase()] ||
      [];
    refsByMatchedId =
      report.assetReferences[matchedAsset.id] ||
      report.assetReferences[matchedAsset.id.toLowerCase()] ||
      [];
  }

  const allRefs = [...refsByName, ...refsByMatchedName, ...refsByMatchedId];
  const uniqueRefs: ScriptReference[] = [];
  const seen = new Set<string>();

  for (const r of allRefs) {
    const key = `${r.file}:${r.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRefs.push(r);
    }
  }

  if (uniqueRefs.length > 0) {
    const assetDisplayName = matchedAsset?.name || target;
    return {
      safe: false,
      references: uniqueRefs,
      error: `Cannot delete asset '${assetDisplayName}': it is referenced in ${uniqueRefs.length} place(s).`,
    };
  }

  return {
    safe: true,
    references: [],
  };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveSpanFromLine(
  lineText: string | undefined,
  targetId: string,
  fallbackLine: number,
): { col: number; endLine: number; endCol: number } {
  if (!lineText) return { col: 1, endLine: fallbackLine, endCol: 1 };
  const cleanTarget = targetId.trim();
  if (cleanTarget) {
    const wordMatch = new RegExp(`\\b${escapeRegExp(cleanTarget)}\\b`).exec(lineText);
    if (wordMatch) {
      const col = wordMatch.index + 1;
      return { col, endLine: fallbackLine, endCol: col + cleanTarget.length };
    }
    const idx = lineText.indexOf(cleanTarget);
    if (idx !== -1) {
      const col = idx + 1;
      return { col, endLine: fallbackLine, endCol: col + cleanTarget.length };
    }
  }
  return { col: 1, endLine: fallbackLine, endCol: 1 };
}

export function generateDiagnostics(project: Project): GeneratedEditorDiagnostic[] {
  const report = scanActiveReconciliation(project);
  const diagnostics: GeneratedEditorDiagnostic[] = [];

  const fileMap = new Map<string, string>();
  const fileLinesMap = new Map<string, string[]>();
  for (const f of project.files || []) {
    fileMap.set(f.name, f.id);
    fileLinesMap.set(f.name, (f.content || '').split('\n'));
    if (f.id) {
      fileLinesMap.set(f.id, (f.content || '').split('\n'));
    }
  }

  for (const assetName of report.uncreatedAssets) {
    const refs =
      report.assetReferences[assetName] || report.assetReferences[assetName.toLowerCase()] || [];
    if (refs.length > 0) {
      for (const ref of refs) {
        const lines = fileLinesMap.get(ref.file);
        const rawLine =
          lines && ref.line > 0 && ref.line <= lines.length ? lines[ref.line - 1] : undefined;
        const span = resolveSpanFromLine(rawLine, assetName, ref.line);
        diagnostics.push({
          id: `diag-asset-${assetName}-${ref.file}-${ref.line}`,
          timestamp: Date.now(),
          category: 'asset',
          severity: 'warning',
          message: `Uncreated asset '${assetName}' referenced in script`,
          assetKey: assetName,
          fileName: ref.file,
          fileId: fileMap.get(ref.file),
          line: ref.line,
          col: typeof ref.col === 'number' && ref.col > 0 ? ref.col : span.col,
          endLine: typeof ref.endLine === 'number' && ref.endLine > 0 ? ref.endLine : span.endLine,
          endCol: typeof ref.endCol === 'number' && ref.endCol > 0 ? ref.endCol : span.endCol,
          quickFix: {
            type: 'create_asset',
            targetId: assetName,
            prefillData: {
              name: assetName,
              category: ref.type === 'audio' ? 'audio' : 'backgrounds',
            },
          },
        });
      }
    } else {
      diagnostics.push({
        id: `diag-asset-${assetName}`,
        timestamp: Date.now(),
        category: 'asset',
        severity: 'warning',
        message: `Uncreated asset '${assetName}' referenced in script`,
        assetKey: assetName,
        col: 1,
        quickFix: {
          type: 'create_asset',
          targetId: assetName,
          prefillData: { name: assetName, category: 'backgrounds' },
        },
      });
    }
  }

  for (const charId of report.uncreatedCharacters) {
    const refs =
      report.characterReferences[charId] || report.characterReferences[charId.toLowerCase()] || [];
    if (refs.length > 0) {
      for (const ref of refs) {
        const lines = fileLinesMap.get(ref.file);
        const rawLine =
          lines && ref.line > 0 && ref.line <= lines.length ? lines[ref.line - 1] : undefined;
        const span = resolveSpanFromLine(rawLine, charId, ref.line);
        diagnostics.push({
          id: `diag-char-${charId}-${ref.file}-${ref.line}`,
          timestamp: Date.now(),
          category: 'character',
          severity: 'warning',
          message: `Uncreated character '${charId}' referenced in script`,
          assetKey: charId,
          fileName: ref.file,
          fileId: fileMap.get(ref.file),
          line: ref.line,
          col: typeof ref.col === 'number' && ref.col > 0 ? ref.col : span.col,
          endLine: typeof ref.endLine === 'number' && ref.endLine > 0 ? ref.endLine : span.endLine,
          endCol: typeof ref.endCol === 'number' && ref.endCol > 0 ? ref.endCol : span.endCol,
          quickFix: {
            type: 'create_character',
            targetId: charId,
            prefillData: { id: charId, name: charId },
          },
        });
      }
    } else {
      diagnostics.push({
        id: `diag-char-${charId}`,
        timestamp: Date.now(),
        category: 'character',
        severity: 'warning',
        message: `Uncreated character '${charId}' referenced in script`,
        assetKey: charId,
        col: 1,
        quickFix: {
          type: 'create_character',
          targetId: charId,
          prefillData: { id: charId, name: charId },
        },
      });
    }
  }

  for (const assetName of report.unusedAssets) {
    diagnostics.push({
      id: `diag-unused-asset-${assetName}`,
      timestamp: Date.now(),
      category: 'asset',
      severity: 'info',
      message: `Unused asset '${assetName}' is present in project assets but never referenced in scripts`,
      assetKey: assetName,
      col: 1,
    });
  }

  return diagnostics;
}

/**
 * Lightweight regex fallback extractor when AST parsing fails on initial project load (e.g. legacy scripts).
 */
function extractReferencesViaRegex(content: string, fileId: string): ScriptReferences {
  const characters: ScriptReferences['characters'] = [];
  const assets: ScriptReferences['assets'] = [];
  const lines = (content || '').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i]!;
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    const getSpan = (target: string): { col: number; endCol: number } => {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(`\\b${escaped}\\b`).exec(rawLine);
      if (match) {
        const col = match.index + 1;
        return { col, endCol: col + target.length };
      }
      const idx = rawLine.indexOf(target);
      if (idx !== -1) {
        const col = idx + 1;
        return { col, endCol: col + target.length };
      }
      return { col: 1, endCol: 1 + target.length };
    };

    const bgMatch = trimmed.match(/^background\s+([a-zA-Z0-9_]+)(?:\s*\(|\s+transition:|\s*$)/i);
    if (bgMatch && bgMatch[1]) {
      const span = getSpan(bgMatch[1]);
      assets.push({
        assetKey: bgMatch[1],
        category: 'background',
        expectedType: 'image',
        loc: { fileId, line: lineNum, col: span.col, endLine: lineNum, endCol: span.endCol },
      });
    }

    const legacySceneMatch = trimmed.match(/^scene\s+["']([^"']+\.[a-zA-Z0-9]+)["']/i);
    if (legacySceneMatch && legacySceneMatch[1]) {
      const span = getSpan(legacySceneMatch[1]);
      assets.push({
        assetKey: legacySceneMatch[1],
        category: 'background',
        expectedType: 'image',
        loc: { fileId, line: lineNum, col: span.col, endLine: lineNum, endCol: span.endCol },
      });
    }

    const showMatch = trimmed.match(/^show\s+([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?/i);
    if (showMatch && showMatch[1]) {
      const span = getSpan(showMatch[1]);
      characters.push({
        characterId: showMatch[1],
        loc: { fileId, line: lineNum, col: span.col, endLine: lineNum, endCol: span.endCol },
      });
    }

    const hideMatch = trimmed.match(/^hide\s+([a-zA-Z0-9_]+)/i);
    if (hideMatch && hideMatch[1]) {
      const span = getSpan(hideMatch[1]);
      characters.push({
        characterId: hideMatch[1],
        loc: { fileId, line: lineNum, col: span.col, endLine: lineNum, endCol: span.endCol },
      });
    }

    const playMatch = trimmed.match(/^play\s+(?:music|sound|voice|bgs)\s+["']?([^"'\s]+)["']?/i);
    if (playMatch && playMatch[1]) {
      const span = getSpan(playMatch[1]);
      assets.push({
        assetKey: playMatch[1],
        category: 'audio',
        expectedType: 'audio',
        loc: { fileId, line: lineNum, col: span.col, endLine: lineNum, endCol: span.endCol },
      });
    }

    const inspectMatch = trimmed.match(/^inspect\s+["']?([^"'\s]+)["']?/i);
    if (inspectMatch && inspectMatch[1]) {
      const span = getSpan(inspectMatch[1]);
      assets.push({
        assetKey: inspectMatch[1],
        category: 'inspect',
        expectedType: 'image',
        loc: { fileId, line: lineNum, col: span.col, endLine: lineNum, endCol: span.endCol },
      });
    }
  }

  return { characters, assets };
}

/**
 * Thực hiện AST reconciliation với cơ chế Error-State Retention (Quyết định 3):
 * - Phân tích AST từng file kịch bản và trích xuất tham chiếu nhân vật/asset.
 * - Nếu file hiện tại gặp lỗi cú pháp (chưa có AST mới), lưu giữ lại references đã cache trước đó của file đó.
 * - Xóa sạch cache của các file đã bị xóa khỏi project.
 * - So khớp references với character/asset registry để sinh cảnh báo uncreated (kèm quickFix) và unused assets.
 */
export function computeReconciliationDiagnostics(
  files: ScriptFile[],
  options: {
    characters?: Character[];
    assets?: Array<{ id: string; name?: string; type?: string; category?: string }>;
  } | undefined,
  cache: Map<string, ScriptReferences>,
): GeneratedEditorDiagnostic[] {
  const currentFileKeys = new Set(files.map(f => f.id || f.name));
  for (const key of cache.keys()) {
    if (!currentFileKeys.has(key)) {
      cache.delete(key);
    }
  }

  const fileMap = new Map<string, string>();
  const fileNameMap = new Map<string, string>();

  for (const file of files) {
    const key = file.id || file.name;
    if (file.name) {
      fileMap.set(file.name, file.id);
      fileNameMap.set(file.name, file.name);
    }
    if (file.id) {
      fileMap.set(file.id, file.id);
      fileNameMap.set(file.id, file.name || file.id);
    }

    try {
      const lexResult = VNSLexer.tokenize(file.content);
      let parsed = false;
      if (lexResult.errors.length === 0) {
        parserInstance.input = lexResult.tokens;
        const cst = parserInstance.program();
        if (parserInstance.errors.length === 0) {
          const builder = new VNSAstBuilder(file.id || file.name);
          const fileAst = builder.visit(cst) as ProgramAST;
          if (fileAst) {
            const refs = extractScriptReferences(fileAst);
            cache.set(key, refs);
            parsed = true;
          }
        }
      }
      if (!parsed && !cache.has(key)) {
        cache.set(key, extractReferencesViaRegex(file.content, file.id || file.name));
      }
    } catch {
      if (!cache.has(key)) {
        cache.set(key, extractReferencesViaRegex(file.content, file.id || file.name));
      }
    }
  }

  const assetRefMap: Record<string, ScriptReference[]> = {};
  const charRefMap: Record<string, ScriptReference[]> = {};

  for (const [fileKey, fileRefs] of cache.entries()) {
    const fileName = fileNameMap.get(fileKey) || fileKey;

    for (const charRef of fileRefs.characters) {
      const cleanId = (charRef.characterId || '').trim().toLowerCase();
      if (!cleanId) continue;
      if (!charRefMap[cleanId]) {
        charRefMap[cleanId] = [];
      }
      charRefMap[cleanId]!.push({
        file: fileName,
        line: charRef.loc?.line ?? 1,
        col: charRef.loc?.col,
        endLine: charRef.loc?.endLine,
        endCol: charRef.loc?.endCol,
        type: 'character',
      });
    }

    for (const assetRef of fileRefs.assets) {
      const cleanKey = (assetRef.assetKey || '').trim();
      if (!cleanKey) continue;
      if (!assetRefMap[cleanKey]) {
        assetRefMap[cleanKey] = [];
      }
      assetRefMap[cleanKey]!.push({
        file: fileName,
        line: assetRef.loc?.line ?? 1,
        col: assetRef.loc?.col,
        endLine: assetRef.loc?.endLine,
        endCol: assetRef.loc?.endCol,
        type: assetRef.category ?? 'background',
      });
    }
  }

  const knownCharIds = new Set(
    (options?.characters || []).map(c => (c.id || '').trim().toLowerCase()),
  );

  const knownAssetKeys = new Set<string>();
  for (const asset of options?.assets || []) {
    if (asset.id) {
      knownAssetKeys.add(asset.id.trim());
      knownAssetKeys.add(asset.id.trim().toLowerCase());
    }
    if (asset.name) {
      knownAssetKeys.add(asset.name.trim());
      knownAssetKeys.add(asset.name.trim().toLowerCase());
    }
  }

  const diagnostics: GeneratedEditorDiagnostic[] = [];

  // Uncreated Assets
  for (const assetRef of Object.keys(assetRefMap)) {
    if (!knownAssetKeys.has(assetRef) && !knownAssetKeys.has(assetRef.toLowerCase())) {
      const refs = assetRefMap[assetRef] || [];
      const seenLocs = new Set<string>();
      for (const ref of refs) {
        const locKey = `${ref.file}:${ref.line}`;
        if (seenLocs.has(locKey)) continue;
        seenLocs.add(locKey);

        diagnostics.push({
          id: `diag-asset-${assetRef}-${ref.file}-${ref.line}`,
          timestamp: Date.now(),
          category: 'asset',
          severity: 'warning',
          message: `Uncreated asset '${assetRef}' referenced in script`,
          assetKey: assetRef,
          fileName: ref.file,
          fileId: fileMap.get(ref.file),
          line: ref.line,
          col: typeof ref.col === 'number' && ref.col > 0 ? ref.col : 1,
          endLine: typeof ref.endLine === 'number' && ref.endLine > 0 ? ref.endLine : ref.line,
          endCol: typeof ref.endCol === 'number' && ref.endCol > 0 ? ref.endCol : undefined,
          quickFix: {
            type: 'create_asset',
            targetId: assetRef,
            prefillData: {
              name: assetRef,
              category: ref.type === 'audio' ? 'audio' : 'backgrounds',
            },
          },
        });
      }
    }
  }

  // Uncreated Characters
  for (const charId of Object.keys(charRefMap)) {
    if (!knownCharIds.has(charId)) {
      const refs = charRefMap[charId] || [];
      const seenLocs = new Set<string>();
      for (const ref of refs) {
        const locKey = `${ref.file}:${ref.line}`;
        if (seenLocs.has(locKey)) continue;
        seenLocs.add(locKey);

        diagnostics.push({
          id: `diag-char-${charId}-${ref.file}-${ref.line}`,
          timestamp: Date.now(),
          category: 'character',
          severity: 'warning',
          message: `Uncreated character '${charId}' referenced in script`,
          assetKey: charId,
          fileName: ref.file,
          fileId: fileMap.get(ref.file),
          line: ref.line,
          col: typeof ref.col === 'number' && ref.col > 0 ? ref.col : 1,
          endLine: typeof ref.endLine === 'number' && ref.endLine > 0 ? ref.endLine : ref.line,
          endCol: typeof ref.endCol === 'number' && ref.endCol > 0 ? ref.endCol : undefined,
          quickFix: {
            type: 'create_character',
            targetId: charId,
            prefillData: { id: charId, name: charId },
          },
        });
      }
    }
  }

  // Unused Assets
  for (const asset of options?.assets || []) {
    const assetName = asset.name || asset.id;
    const nameMatches = asset.name
      ? assetRefMap[asset.name] || assetRefMap[asset.name.toLowerCase()]
      : undefined;
    const idMatches = asset.id
      ? assetRefMap[asset.id] || assetRefMap[asset.id.toLowerCase()]
      : undefined;

    if ((!nameMatches || nameMatches.length === 0) && (!idMatches || idMatches.length === 0)) {
      diagnostics.push({
        id: `diag-unused-asset-${assetName}`,
        timestamp: Date.now(),
        category: 'asset',
        severity: 'info',
        message: `Unused asset '${assetName}' is present in project assets but never referenced in scripts`,
        assetKey: assetName,
        col: 1,
      });
    }
  }

  return diagnostics;
}
