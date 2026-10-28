import type { Project } from '@vn-engine/shared-types';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export type DiagnosticCategory = 'compiler' | 'asset' | 'character' | 'runtime';

export interface EditorDiagnostic {
  id: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  message: string;
  fileId?: string;
  fileName?: string;
  line?: number;
  col?: number;
  quickFix?: {
    type: 'create_asset' | 'create_character' | 'define_variable';
    targetId: string;
    prefillData?: Record<string, unknown>;
  };
}

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

/**
 * Scans all script files in a project to reconcile asset and character usage.
 * Identifies:
 * 1. Uncreated characters (referenced in script but not defined in project)
 * 2. Uncreated assets (referenced in script but not in asset library)
 * 3. Unused assets (stored in asset library but not referenced in any script)
 */
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

  // Scan line by line through each script file for maximum resilience
  for (const file of project.files || []) {
    const fileName = file.name || 'unnamed.vns';
    const lines = (file.content || '').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i]!;
      const trimmed = rawLine.trim();

      // Skip empty lines or pure comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }

      // 1. Scene / Background: scene "bg_classroom.png" or scene bg_classroom.png
      const sceneMatch = trimmed.match(/^scene\s+["']?([^"'\s]+)["']?/i);
      if (sceneMatch && sceneMatch[1]) {
        recordAssetRef(sceneMatch[1], fileName, lineNum, 'background');
      }

      // 2. Show character: show alice.happy or show bob
      const showMatch = trimmed.match(/^show\s+([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?/i);
      if (showMatch && showMatch[1]) {
        recordCharRef(showMatch[1], fileName, lineNum);
      }

      // 3. Hide character: hide alice
      const hideMatch = trimmed.match(/^hide\s+([a-zA-Z0-9_]+)/i);
      if (hideMatch && hideMatch[1]) {
        recordCharRef(hideMatch[1], fileName, lineNum);
      }

      // 4. Play audio: play music "bg_rain.mp3" or play sound "sfx.wav"
      const playMatch = trimmed.match(/^play\s+(?:music|sound|voice|bgs)\s+["']?([^"'\s]+)["']?/i);
      if (playMatch && playMatch[1]) {
        recordAssetRef(playMatch[1], fileName, lineNum, 'audio');
      }

      // 5. Inspect asset: inspect "item.png"
      const inspectMatch = trimmed.match(/^inspect\s+["']?([^"'\s]+)["']?/i);
      if (inspectMatch && inspectMatch[1]) {
        recordAssetRef(inspectMatch[1], fileName, lineNum, 'inspect');
      }
    }
  }

  // Known character IDs in project
  const knownCharIds = new Set(
    (project.characters || []).map((c) => (c.id || '').trim().toLowerCase())
  );

  // Known asset names and IDs in project
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

  // 1. Calculate uncreated characters
  const uncreatedCharacters: string[] = [];
  for (const charId of Object.keys(charRefMap)) {
    if (!knownCharIds.has(charId)) {
      uncreatedCharacters.push(charId);
    }
  }

  // 2. Calculate uncreated assets
  const uncreatedAssets: string[] = [];
  for (const assetRef of Object.keys(assetRefMap)) {
    if (!knownAssetKeys.has(assetRef) && !knownAssetKeys.has(assetRef.toLowerCase())) {
      uncreatedAssets.push(assetRef);
    }
  }

  // 3. Calculate unused assets
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

/**
 * Checks whether an asset can be safely deleted without breaking script references.
 */
export function checkAssetDeletionSafety(
  assetIdOrName: string,
  project: Project
): DeletionSafetyResult {
  const target = (assetIdOrName || '').trim();
  if (!target) {
    return { safe: true, references: [] };
  }

  // Find asset metadata to check both name and ID
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

  // Merge unique references
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

/**
 * Generates editor diagnostics from active reconciliation scanning.
 * Flags uncreated characters and uncreated assets as actionable warnings with QuickFix payloads.
 */
export function generateDiagnostics(project: Project): EditorDiagnostic[] {
  const report = scanActiveReconciliation(project);
  const diagnostics: EditorDiagnostic[] = [];

  const fileMap = new Map<string, string>();
  for (const f of project.files || []) {
    fileMap.set(f.name, f.id);
  }

  // Uncreated Assets
  for (const assetName of report.uncreatedAssets) {
    const refs = report.assetReferences[assetName] || report.assetReferences[assetName.toLowerCase()] || [];
    if (refs.length > 0) {
      for (const ref of refs) {
        diagnostics.push({
          id: `diag-asset-${assetName}-${ref.file}-${ref.line}`,
          category: 'asset',
          severity: 'warning',
          message: `Uncreated asset '${assetName}' referenced in script`,
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
        category: 'asset',
        severity: 'warning',
        message: `Uncreated asset '${assetName}' referenced in script`,
        quickFix: {
          type: 'create_asset',
          targetId: assetName,
          prefillData: { name: assetName, category: 'backgrounds' },
        },
      });
    }
  }

  // Uncreated Characters
  for (const charId of report.uncreatedCharacters) {
    const refs = report.characterReferences[charId] || report.characterReferences[charId.toLowerCase()] || [];
    if (refs.length > 0) {
      for (const ref of refs) {
        diagnostics.push({
          id: `diag-char-${charId}-${ref.file}-${ref.line}`,
          category: 'character',
          severity: 'warning',
          message: `Uncreated character '${charId}' referenced in script`,
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
        category: 'character',
        severity: 'warning',
        message: `Uncreated character '${charId}' referenced in script`,
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
