import type { Project, EngineDiagnostic } from '@vn-engine/shared-types';

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

  const recordAssetRef = (assetName: string, file: string, line: number, type: 'background' | 'audio' | 'inspect') => {
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

      const sceneMatch = trimmed.match(/^scene\s+["']?([^"'\s]+)["']?/i);
      if (sceneMatch && sceneMatch[1]) {
        recordAssetRef(sceneMatch[1], fileName, lineNum, 'background');
      }

      const showMatch = trimmed.match(/^show\s+([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?/i);
      if (showMatch && showMatch[1]) {
        recordCharRef(showMatch[1], fileName, lineNum);
      }

      const hideMatch = trimmed.match(/^hide\s+([a-zA-Z0-9_]+)/i);
      if (hideMatch && hideMatch[1]) {
        recordCharRef(hideMatch[1], fileName, lineNum);
      }

      const playMatch = trimmed.match(/^play\s+(?:music|sound|voice|bgs)\s+["']?([^"'\s]+)["']?/i);
      if (playMatch && playMatch[1]) {
        recordAssetRef(playMatch[1], fileName, lineNum, 'audio');
      }

      const inspectMatch = trimmed.match(/^inspect\s+["']?([^"'\s]+)["']?/i);
      if (inspectMatch && inspectMatch[1]) {
        recordAssetRef(inspectMatch[1], fileName, lineNum, 'inspect');
      }
    }
  }

  const knownCharIds = new Set(
    (project.characters || []).map((c) => (c.id || '').trim().toLowerCase())
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
  project: Project
): DeletionSafetyResult {
  const target = (assetIdOrName || '').trim();
  if (!target) {
    return { safe: true, references: [] };
  }

  const matchedAsset = (project.assets || []).find(
    (a) => a.id === target || a.name === target || a.name.toLowerCase() === target.toLowerCase()
  );

  const report = scanActiveReconciliation(project);

  const refsByName = report.assetReferences[target] || report.assetReferences[target.toLowerCase()] || [];
  let refsByMatchedName: ScriptReference[] = [];
  let refsByMatchedId: ScriptReference[] = [];

  if (matchedAsset) {
    refsByMatchedName = report.assetReferences[matchedAsset.name] || report.assetReferences[matchedAsset.name.toLowerCase()] || [];
    refsByMatchedId = report.assetReferences[matchedAsset.id] || report.assetReferences[matchedAsset.id.toLowerCase()] || [];
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

export function generateDiagnostics(project: Project): GeneratedEditorDiagnostic[] {
  const report = scanActiveReconciliation(project);
  const diagnostics: GeneratedEditorDiagnostic[] = [];

  const fileMap = new Map<string, string>();
  for (const f of project.files || []) {
    fileMap.set(f.name, f.id);
  }

  for (const assetName of report.uncreatedAssets) {
    const refs = report.assetReferences[assetName] || report.assetReferences[assetName.toLowerCase()] || [];
    if (refs.length > 0) {
      for (const ref of refs) {
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
          col: 1,
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
    const refs = report.characterReferences[charId] || report.characterReferences[charId.toLowerCase()] || [];
    if (refs.length > 0) {
      for (const ref of refs) {
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
          col: 1,
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

  return diagnostics;
}
