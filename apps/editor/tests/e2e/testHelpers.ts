// ================================================================
// E2E TEST HELPERS & RECONCILIATION ENGINE
// Shared utilities for Tier 1-4 Web Editor test suites
// ================================================================

import 'fake-indexeddb/auto';
import type {
  Project,
  ScriptFile,
  Character,
  AssetRef,
  StatementAST,
} from '@vn-engine/shared-types';
import { Compiler } from '@vn-engine/dsl-compiler';

// ----------------------------------------------------------------------------
// 1. Data Contracts (TASK-EDITOR-REBUILD-SPEC §2)
// ----------------------------------------------------------------------------

export interface ProjectDisplaySettings {
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  lockAspectRatio: boolean;
}

export interface ProjectGameplaySettings {
  unmetChoiceDisplay: 'hidden' | 'disabled';
  textSpeed: number;
  autoForwardDelay: number;
  defaultVolumes: {
    master: number;
    bgm: number;
    sfx: number;
    voice: number;
  };
}

export interface ProjectEditorSettings {
  autoSave: boolean;
  autoSaveDebounceMs: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  description?: string;
  updatedAt: number;
  canvasWidth: number;
  canvasHeight: number;
  orientation: 'landscape' | 'portrait';
  scriptCount: number;
  characterCount: number;
  assetCount: number;
  totalSizeBytes: number;
}

export interface CreateProjectParams {
  title: string;
  description?: string;
  displaySettings: ProjectDisplaySettings;
  gameplaySettings?: Partial<ProjectGameplaySettings>;
  editorSettings?: Partial<ProjectEditorSettings>;
}

export interface StorageEstimate {
  usedBytes: number;
  quotaBytes: number;
}

export interface EditorDiagnostic {
  id: string;
  category: 'compiler' | 'asset' | 'character' | 'runtime';
  severity: 'error' | 'warning' | 'info';
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

export interface ActiveReconciliationReport {
  uncreatedCharacters: string[];
  uncreatedAssets: string[];
  unusedAssets: string[];
}

export interface CharacterSpriteItem {
  expressionKey: string;
  imageUrl: string;
  fileName?: string;
  sizeBytes?: number;
  isDefault: boolean;
}

export interface CharacterFormData {
  id: string;
  name: string;
  colorHex: string;
  sprites: CharacterSpriteItem[];
}

export interface EditorTab {
  id: string;
  name: string;
  isDirty: boolean;
  scrollLine?: number;
  cursorPos?: { line: number; col: number };
}

// ----------------------------------------------------------------------------
// 2. Storage & Web API Polyfills (Node 22 / JSDOM Environment)
// ----------------------------------------------------------------------------

export function setupStoragePolyfill(): void {
  const createStorage = () => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    };
  };

  const ls = createStorage();
  const ss = createStorage();
  Object.defineProperty(window, 'localStorage', { value: ls, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: ss, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: ss, writable: true });

  if (typeof document !== 'undefined' && !document.queryCommandSupported) {
    document.queryCommandSupported = () => false;
  }
}

export class MockBroadcastChannel {
  public name: string;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  private static channels: Map<string, Set<MockBroadcastChannel>> = new Map();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name)!.add(this);
  }

  postMessage(message: unknown): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer !== this && peer.onmessage) {
        peer.onmessage({ data: message });
      }
    }
  }

  close(): void {
    const peers = MockBroadcastChannel.channels.get(this.name);
    if (peers) {
      peers.delete(this);
    }
  }
}

export function setupBroadcastChannelPolyfill(): void {
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = MockBroadcastChannel;
  (window as unknown as { BroadcastChannel: unknown }).BroadcastChannel = MockBroadcastChannel;
}

// ----------------------------------------------------------------------------
// 3. Active AST Reconciliation Scanner (TASK-EDITOR-REBUILD-SPEC §2, §6)
// ----------------------------------------------------------------------------

export function scanActiveReconciliation(
  files: ScriptFile[],
  characters: Character[],
  assets: AssetRef[],
): ActiveReconciliationReport {
  const compiler = new Compiler();
  const compileResult = compiler.compile(files, { characters });
  const referencedChars = new Set<string>();
  const referencedAssets = new Set<string>();

  if (compileResult.ast) {
    const walkStatements = (stmts: StatementAST[] | undefined) => {
      if (!stmts || !Array.isArray(stmts)) return;
      for (const stmt of stmts) {
        if (stmt.type === 'DialogueStatement' && stmt.character) {
          referencedChars.add(stmt.character);
        } else if (stmt.type === 'ShowStatement') {
          if (stmt.character) referencedChars.add(stmt.character);
          if (stmt.sprite) {
            referencedAssets.add(`${stmt.character}.${stmt.sprite}`);
          }
        } else if (stmt.type === 'BackgroundStatement' && stmt.assetId) {
          referencedAssets.add(stmt.assetId);
        } else if (stmt.type === 'PlayStatement' && stmt.assetId) {
          referencedAssets.add(stmt.assetId);
        } else if (stmt.type === 'IfStatement') {
          walkStatements(stmt.consequent);
          if (stmt.alternate) walkStatements(stmt.alternate);
        } else if (stmt.type === 'WhileStatement') {
          walkStatements(stmt.body);
        }
      }
    };

    if (compileResult.ast.topLevelStatements) {
      walkStatements(compileResult.ast.topLevelStatements);
    }
    if (compileResult.ast.scenes) {
      for (const sc of compileResult.ast.scenes) {
        walkStatements(sc.body);
      }
    }
  }

  const existingCharIds = new Set(characters.map(c => c.id));
  const existingAssetNames = new Set(assets.map(a => a.name));

  const uncreatedCharacters = Array.from(referencedChars).filter(id => !existingCharIds.has(id));
  const uncreatedAssets = Array.from(referencedAssets).filter(name => !existingAssetNames.has(name));
  const unusedAssets = Array.from(existingAssetNames).filter(name => !referencedAssets.has(name));

  return { uncreatedCharacters, uncreatedAssets, unusedAssets };
}

export function checkSafeAssetDeletion(
  assetName: string,
  files: ScriptFile[],
): { safe: boolean; references: Array<{ fileName: string; line: number }> } {
  const compiler = new Compiler();
  const compileResult = compiler.compile(files);
  const references: Array<{ fileName: string; line: number }> = [];

  if (compileResult.ast) {
    const checkStmt = (stmt: StatementAST, defaultFile: string) => {
      let isRef = false;
      if (stmt.type === 'BackgroundStatement' && (stmt.assetId === assetName || stmt.assetId.replace(/\.[^.]+$/, '') === assetName.replace(/\.[^.]+$/, ''))) {
        isRef = true;
      }
      if (stmt.type === 'PlayStatement' && (stmt.assetId === assetName || stmt.assetId.replace(/\.[^.]+$/, '') === assetName.replace(/\.[^.]+$/, ''))) {
        isRef = true;
      }
      if (stmt.type === 'ShowStatement' && `${stmt.character}.${stmt.sprite}` === assetName) {
        isRef = true;
      }

      if (isRef) {
        references.push({
          fileName: stmt.loc?.fileId || defaultFile,
          line: stmt.loc?.line || 1,
        });
      }

      if (stmt.type === 'IfStatement') {
        stmt.consequent?.forEach(s => checkStmt(s, defaultFile));
        stmt.alternate?.forEach(s => checkStmt(s, defaultFile));
      } else if (stmt.type === 'WhileStatement') {
        stmt.body?.forEach(s => checkStmt(s, defaultFile));
      }
    };

    compileResult.ast.scenes?.forEach(sc => {
      sc.body?.forEach(stmt => checkStmt(stmt, sc.loc?.fileId || 'main.vns'));
    });
  }

  return {
    safe: references.length === 0,
    references,
  };
}

// ----------------------------------------------------------------------------
// 4. In-Memory & IndexedDB Project Repository Spec Implementation
// ----------------------------------------------------------------------------

export class StudioProjectRepository {
  private dbName: string = 'vn_engine_studio_db';
  private dbPromise: Promise<IDBDatabase> | null = null;
  private assetBlobs: Map<string, Blob> = new Map();

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('asset_blobs')) {
          db.createObjectStore('asset_blobs', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  public async createProject(params: CreateProjectParams): Promise<Project> {
    const db = await this.getDB();
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const starterScript = `# ==============================================================
# Welcome to Visual Novel Engine!
# ==============================================================

scene start {
    background bg_courtyard transition: "fade"
    play music "theme_peaceful" volume: 0.8 loop: true

    show alice.happy(position: "center")
    alice: "Hello and welcome to your new visual novel story!"

    choice {
        "Let's get started": goto .begin
    }

    scene .begin {
        alice: "Have fun creating your adventure!"
        end
    }
}
`;

    const project: Project = {
      id,
      title: params.title.trim() || 'Untitled Project',
      version: 1,
      ownerId: 'local_studio_user',
      defaultLanguage: 'en',
      files: [
        {
          id: 'main.vns',
          name: 'main.vns',
          content: starterScript,
          order: 0,
          version: 1,
        },
      ],
      characters: [],
      variables: [],
      assets: [],
      uiScreens: [],
      customScripts: [],
    };

    // Attach custom settings
    (project as unknown as { displaySettings: ProjectDisplaySettings }).displaySettings =
      params.displaySettings;
    (project as unknown as { gameplaySettings: Partial<ProjectGameplaySettings> }).gameplaySettings =
      params.gameplaySettings || { unmetChoiceDisplay: 'hidden' };
    (project as unknown as { editorSettings: Partial<ProjectEditorSettings> }).editorSettings =
      params.editorSettings || { autoSave: true, autoSaveDebounceMs: 1000 };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return project;
  }

  public async getProject(id: string): Promise<Project | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const req = tx.objectStore('projects').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async updateProject(project: Project): Promise<void> {
    const db = await this.getDB();
    project.version = (project.version || 1) + 1;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async deleteProject(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async duplicateProject(id: string, newTitle: string): Promise<Project> {
    const original = await this.getProject(id);
    if (!original) throw new Error(`Project ${id} not found`);

    const cloned: Project = JSON.parse(JSON.stringify(original));
    cloned.id = `proj_${Date.now()}_copy`;
    cloned.title = newTitle;
    cloned.version = 1;

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(cloned);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return cloned;
  }

  public async listProjects(): Promise<ProjectSummary[]> {
    const db = await this.getDB();
    const rawProjects = await new Promise<Project[]>((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const req = tx.objectStore('projects').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return rawProjects.map(p => {
      const ds = (p as unknown as { displaySettings?: ProjectDisplaySettings }).displaySettings;
      return {
        id: p.id,
        title: p.title,
        updatedAt: Date.now(),
        canvasWidth: ds?.width || 1920,
        canvasHeight: ds?.height || 1080,
        orientation: ds?.orientation || 'landscape',
        scriptCount: p.files?.length || 1,
        characterCount: p.characters?.length || 0,
        assetCount: p.assets?.length || 0,
        totalSizeBytes: 1024 * (p.files?.length || 1),
      };
    });
  }

  public async saveAssetBlob(assetId: string, blob: Blob): Promise<void> {
    this.assetBlobs.set(assetId, blob);
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('asset_blobs', 'readwrite');
      tx.objectStore('asset_blobs').put({ id: assetId, blob, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAssetBlob(assetId: string): Promise<Blob | null> {
    if (this.assetBlobs.has(assetId)) {
      return this.assetBlobs.get(assetId)!;
    }
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('asset_blobs', 'readonly');
      const req = tx.objectStore('asset_blobs').get(assetId);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteAssetBlob(assetId: string): Promise<void> {
    this.assetBlobs.delete(assetId);
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('asset_blobs', 'readwrite');
      tx.objectStore('asset_blobs').delete(assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getStorageUsage(): Promise<StorageEstimate> {
    let estimate = { quota: 50 * 1024 * 1024, usage: 2 * 1024 * 1024 };
    if (navigator?.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota) estimate.quota = est.quota;
        if (est.usage) estimate.usage = est.usage;
      } catch {
        // Fallback
      }
    }
    return {
      usedBytes: estimate.usage,
      quotaBytes: estimate.quota,
    };
  }

  public async exportProjectZip(id: string): Promise<Blob> {
    const project = await this.getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);
    const jsonStr = JSON.stringify(project, null, 2);
    return new Blob([jsonStr], { type: 'application/zip' });
  }

  public async importProjectZip(zipBlob: Blob): Promise<Project> {
    const text = await zipBlob.text();
    const parsed = JSON.parse(text) as Project;
    parsed.id = `imported_${Date.now()}`;
    await this.updateProject(parsed);
    return parsed;
  }
}
