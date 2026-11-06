import type {
  ProgramAST,
  StatementAST,
  SceneASTNode,
} from '@vn-engine/shared-types';

export interface ScriptReferenceLocation {
  fileId: string;
  line: number;
  col?: number;
  endLine?: number;
  endCol?: number;
}

export interface CharacterReference {
  characterId: string;
  loc?: ScriptReferenceLocation;
}

export interface AssetReference {
  assetKey: string;
  loc?: ScriptReferenceLocation;
  expectedType?: 'image' | 'audio';
  category?: 'background' | 'audio' | 'inspect';
}

export interface ScriptReferences {
  characters: CharacterReference[];
  assets: AssetReference[];
}

/**
 * Pure AST visitor extracting character and media asset references across
 * topLevelStatements, scenes, sub-scenes, and nested control flow statements.
 */
export function extractScriptReferences(ast: ProgramAST): ScriptReferences {
  const characters: CharacterReference[] = [];
  const assets: AssetReference[] = [];

  function visitStatement(stmt: StatementAST | SceneASTNode) {
    if (!stmt) return;

    switch (stmt.type) {
      case 'BackgroundStatement':
        if (stmt.assetId) {
          assets.push({
            assetKey: stmt.assetId,
            category: 'background',
            expectedType: 'image',
            loc: stmt.loc,
          });
        }
        break;

      case 'ShowStatement':
        if (stmt.character) {
          characters.push({
            characterId: stmt.character,
            loc: stmt.loc,
          });
        }
        break;

      case 'HideStatement':
        if (stmt.character) {
          characters.push({
            characterId: stmt.character,
            loc: stmt.loc,
          });
        }
        break;

      case 'PlayStatement':
        if (stmt.assetId) {
          assets.push({
            assetKey: stmt.assetId,
            category: 'audio',
            expectedType: 'audio',
            loc: stmt.loc,
          });
        }
        break;

      case 'InspectStatement':
        if (stmt.assetId) {
          assets.push({
            assetKey: stmt.assetId,
            category: 'inspect',
            expectedType: 'image',
            loc: stmt.loc,
          });
        }
        if (Array.isArray(stmt.body)) {
          for (const s of stmt.body) {
            visitStatement(s);
          }
        }
        break;

      case 'IfStatement':
        if (Array.isArray(stmt.consequent)) {
          for (const s of stmt.consequent) {
            visitStatement(s);
          }
        }
        if (Array.isArray(stmt.alternate)) {
          for (const s of stmt.alternate) {
            visitStatement(s);
          }
        } else if (stmt.alternate) {
          visitStatement(stmt.alternate);
        }
        break;

      case 'WhileStatement':
        if (Array.isArray(stmt.body)) {
          for (const s of stmt.body) {
            visitStatement(s);
          }
        }
        break;

      case 'Scene':
        if (Array.isArray(stmt.body)) {
          for (const s of stmt.body) {
            visitStatement(s);
          }
        }
        break;
    }
  }

  if (Array.isArray(ast.topLevelStatements)) {
    for (const stmt of ast.topLevelStatements) {
      visitStatement(stmt);
    }
  }

  if (Array.isArray(ast.scenes)) {
    for (const scene of ast.scenes) {
      if (Array.isArray(scene.body)) {
        for (const stmt of scene.body) {
          visitStatement(stmt);
        }
      }
    }
  }

  return { characters, assets };
}

