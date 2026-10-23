// ================================================================
// VN ENGINE STUDIO - WEB EDITOR CONTROLLER (STUDIO APP MEDIATOR)
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 & SAD v1.0
// ================================================================

import * as monaco from 'monaco-editor';
import { Compiler } from '@vn-engine/dsl-compiler';
import type {
  Project,
  ScriptFile,
  Instruction,
  ProgramAST,
  StatementAST,
  DialogueStatement,
  ShowStatement,
  RevealStatement,
  BackgroundStatement,
  PlayStatement,
  VarDefineStatement,
  VarAssignStatement,
  IfStatement,
  WhileStatement,
  InspectStatement,
} from '@vn-engine/shared-types';
import { type IProjectRepository } from './repository/projectRepository';
import { SupabaseProjectRepository } from './repository/supabaseProjectRepository';

import type { StudioContext, CachedAstMetadata } from './modules/editorTypes';
import { FileExplorer } from './modules/fileExplorer';
import { CharacterManager } from './modules/characterManager';
import { AssetManager } from './modules/assetManager';
import { EditorController } from './modules/editorController';
import { BottomDrawer, type VariableMeta } from './modules/bottomDrawer';
import { PreviewBridge } from './modules/previewBridge';
import { ExportWizard } from './modules/exportWizard';
import { LayoutResizer } from './modules/layoutResizer';
import { BytecodeInspector } from './modules/bytecodeInspector';
import { OutputManager } from './modules/outputManager';

const DEFAULT_STARTER_SCRIPT = `# ==============================================================
# Welcome to Visual Novel Engine!
# Write your script here and see the live preview on the right.
# ==============================================================

define player_name = "Traveler"
define affinity = 10

scene start {
    background bg_courtyard transition: "fade"
    play music "theme_peaceful" volume: 0.8 loop: true

    show alice.happy(position: "center")
    alice: "Hello and welcome to your new visual novel story, ~player_name!"
    alice: "You can write script scenes here and see them previewed live on the right."

    choice {
        "Tell me more": goto .more_info
        "Let's get started": goto .begin
    }

    scene .more_info {
        ~ affinity = affinity + 5
        alice: "You can manage characters, backgrounds, and audio assets in the tabs above."
        alice: "Your affinity with Alice is now ~affinity!"
        goto .begin
    }

    scene .begin {
        alice: "Have fun creating your adventure!"
        end
    }
}
`;

export class StudioApp implements StudioContext {
  private compiler: Compiler;
  private repository: IProjectRepository;

  private project: Project = {
    id: 'local_default_project',
    title: 'Academy Mystery',
    version: 1,
    ownerId: 'local_user',
    defaultLanguage: 'en',
    files: [
      {
        id: 'main.vns',
        name: 'main.vns',
        content: DEFAULT_STARTER_SCRIPT,
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

  private activeFile: string = 'main.vns';
  private latestProgram: Instruction[] | null = null;
  private isDirty: boolean = false;
  private lastParsedAst: ProgramAST | null = null;

  private cachedAstMetadata: CachedAstMetadata = {
    scenes: [],
    characters: new Map(),
    assets: {
      backgrounds: new Set(),
      audio: new Set(),
    },
    variables: [],
  };

  // Submodules
  public fileExplorer!: FileExplorer;
  public characterManager!: CharacterManager;
  public assetManager!: AssetManager;
  public editorController!: EditorController;
  public bottomDrawer!: BottomDrawer;
  public previewBridge!: PreviewBridge;
  public exportWizard!: ExportWizard;
  public layoutResizer!: LayoutResizer;
  public bytecodeInspector!: BytecodeInspector;
  public outputManager!: OutputManager;

  // DOM Elements
  private projectTitleEl: HTMLElement;
  private saveStatusPill: HTMLElement;
  private activeFilenameEl: HTMLElement;
  private toastEl: HTMLElement;
  private varContainer: HTMLElement | null;
  private toastTimerId: number | null = null;
  private hadCompileErrors: boolean = false;

  constructor(repository?: IProjectRepository) {
    this.compiler = new Compiler();
    this.repository = repository || new SupabaseProjectRepository();

    this.projectTitleEl = document.getElementById('project-title')!;
    this.saveStatusPill = document.getElementById('save-status')!;
    this.activeFilenameEl = document.getElementById('active-filename')!;
    this.toastEl = document.getElementById('studio-toast')!;
    this.varContainer = document.getElementById('variable-list-container');
  }

  public async init(): Promise<void> {
    // 1. Nạp dự án từ Repository
    await this.loadProjectFromStorage();

    // 2. Cập nhật giao diện tiêu đề
    if (this.projectTitleEl) {
      this.projectTitleEl.textContent = this.project.title || 'Academy Mystery';
    }
    if (this.activeFilenameEl) {
      this.activeFilenameEl.textContent = this.activeFile;
    }

    // 3. Khởi tạo các module chuyên trách
    this.outputManager = new OutputManager(this);
    this.bottomDrawer = new BottomDrawer(this);
    this.previewBridge = new PreviewBridge(this);

    this.previewBridge.onLogEntry(log => {
      this.outputManager?.appendLog(log);
    });

    this.bottomDrawer.setOnVariableChange((name, value, scope) => {
      this.previewBridge?.setVariable(name, value, scope);
      this.showToast(`[Debugger] Injected ${name} = ${value}`);
    });

    this.previewBridge.onStateUpdate(liveState => {
      this.bottomDrawer?.updateLiveVariables(liveState);
      const targetPc =
        typeof liveState.activeExecutingPc === 'number'
          ? liveState.activeExecutingPc
          : liveState.instructionPointer;
      this.bytecodeInspector?.updateExecutionPointer(targetPc, liveState.currentScene);
    });

    this.bytecodeInspector = new BytecodeInspector(this);
    this.exportWizard = new ExportWizard(this);
    this.fileExplorer = new FileExplorer(this);
    this.characterManager = new CharacterManager(this);
    this.assetManager = new AssetManager(this);

    this.editorController = new EditorController(this, {
      onRunFromStart: () => this.runFromStart(),
      onRunFromLine: (targetLine, targetScene) => this.runFromLine(targetLine, targetScene),
    });

    const editorInstance = this.editorController.getEditor();
    if (editorInstance) {
      editorInstance.onDidChangeCursorPosition(e => {
        const line = e.position.lineNumber;
        const sceneName = this.findSceneAtLine(line);
        if (sceneName) {
          this.bottomDrawer?.setEditorCursorScene(sceneName);
        }
      });
    }

    this.layoutResizer = new LayoutResizer(this, {
      onRenameFileRequested: () => {
        const activeLi = document.querySelector(
          '#file-list .file-item.active',
        ) as HTMLElement | null;
        if (activeLi && this.activeFile) {
          this.fileExplorer.startRenameFile(this.activeFile, activeLi);
        }
      },
      onCloseModalsRequested: () => {
        this.characterManager.closeCharacterModal();
        this.assetManager.closeAssetModal();
        this.exportWizard.close();
      },
    });

    // 4. Render danh sách
    this.renderFileList();
    this.renderCharacterList();
    this.renderAssetList();

    // 5. Setup header action buttons
    this.setupHeaderActions();

    // 6. Biên dịch lần đầu
    this.compileCurrentScript({ verbose: true });
  }

  // ================================================================
  // STUDIO CONTEXT IMPLEMENTATION
  // ================================================================
  public getProject(): Project {
    return this.project;
  }

  public setProject(project: Project): void {
    this.project = project;
  }

  public getActiveFile(): string {
    return this.activeFile;
  }

  public setActiveFile(fileName: string): void {
    this.activeFile = fileName;
  }

  public markDirty(): void {
    this.isDirty = true;
  }

  public getCachedAstMetadata(): CachedAstMetadata {
    return this.cachedAstMetadata;
  }

  public getEditorInstance(): monaco.editor.IStandaloneCodeEditor | undefined {
    return this.editorController?.getEditor();
  }

  public getLatestProgram(): Instruction[] | null {
    return this.latestProgram;
  }

  public getOrCreateTextModel(
    fileName: string,
    initialContent?: string,
  ): monaco.editor.ITextModel {
    return this.editorController.getOrCreateTextModel(fileName, initialContent);
  }

  public disposeTextModel(fileName: string): void {
    this.editorController?.disposeTextModel(fileName);
  }

  public flushEditorChanges(): void {
    this.editorController?.flushEditorChanges();
  }

  public renderFileList(): void {
    this.fileExplorer?.renderFileList();
  }

  public renderCharacterList(): void {
    this.characterManager?.renderCharacterList();
  }

  public renderAssetList(): void {
    this.assetManager?.renderAssetList();
  }

  public getPreviewBaseUrl(): string {
    const envUrl = import.meta.env.VITE_PREVIEW_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
      return envUrl.trim().replace(/\/+$/, '');
    }
    return typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3000'
      : typeof window !== 'undefined'
        ? window.location.origin
        : '';
  }

  public getPreviewOrigin(): string {
    try {
      const url = new URL(this.getPreviewBaseUrl());
      return url.origin;
    } catch {
      return typeof window !== 'undefined' ? window.location.origin : '';
    }
  }

  public getFilesMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const f of this.project.files) {
      map[f.name] = f.content;
    }
    return map;
  }

  public getFileContent(fileName: string): string {
    const f = this.project.files.find(item => item.name === fileName);
    return f ? f.content : '';
  }

  public setFileContent(fileName: string, content: string): void {
    const f = this.project.files.find(item => item.name === fileName);
    if (f) {
      if (f.content !== content) {
        f.content = content;
        f.version = (f.version || 1) + 1;
        this.isDirty = true;
      }
    } else {
      this.project.files.push({
        id: fileName,
        name: fileName,
        content,
        order: this.project.files.length,
        version: 1,
      });
      this.isDirty = true;
    }
  }

  public removeFile(fileName: string): void {
    this.project.files = this.project.files.filter(f => f.name !== fileName);
    this.isDirty = true;
  }

  public renameFileKey(oldName: string, newName: string): void {
    const f = this.project.files.find(item => item.name === oldName);
    if (f) {
      f.name = newName;
      f.id = newName;
      f.version = (f.version || 1) + 1;
      this.isDirty = true;
    }
  }

  public getProjectCharactersMap(): Map<string, { displayName?: string; sprites: Set<string> }> {
    const map = new Map<string, { displayName?: string; sprites: Set<string> }>();
    if (Array.isArray(this.project.characters)) {
      for (const c of this.project.characters) {
        const sprites = new Set<string>(Object.keys(c.sprites || {}));
        map.set(c.id, { displayName: c.name, sprites });
      }
    }
    for (const [id, info] of this.cachedAstMetadata.characters) {
      if (!map.has(id)) {
        map.set(id, { displayName: info.displayName, sprites: new Set(info.sprites) });
      } else {
        const existing = map.get(id)!;
        for (const sp of info.sprites) existing.sprites.add(sp);
      }
    }
    return map;
  }

  public getProjectAssetsMap(): { backgrounds: Set<string>; audio: Set<string> } {
    const backgrounds = new Set<string>();
    const audio = new Set<string>();
    if (Array.isArray(this.project.assets)) {
      for (const a of this.project.assets) {
        if (a.type === 'image') {
          backgrounds.add(a.name);
        } else if (a.type === 'audio') {
          audio.add(a.name);
        }
      }
    }
    for (const b of this.cachedAstMetadata.assets.backgrounds) backgrounds.add(b);
    for (const a of this.cachedAstMetadata.assets.audio) audio.add(a);
    return { backgrounds, audio };
  }

  public setModelMarkers(
    currentModel: monaco.editor.ITextModel,
    owner: string,
    markers: monaco.editor.IMarkerData[],
  ): void {
    monaco.editor.setModelMarkers(currentModel, owner, markers);
  }

  // ================================================================
  // PROJECT STORAGE (LOAD & SAVE)
  // ================================================================
  private async loadProjectFromStorage(): Promise<void> {
    try {
      const projects = await this.repository.listProjects();
      if (projects.length > 0 && projects[0]) {
        const fullProj = await this.repository.getProject(projects[0].id);
        if (fullProj && Array.isArray(fullProj.files) && fullProj.files.length > 0) {
          this.project = fullProj;
          const fileNames = this.project.files.map(f => f.name);
          if (!fileNames.includes(this.activeFile)) {
            this.activeFile = fileNames[0] ?? 'main.vns';
          }
          return;
        }
      }
    } catch (e) {
      console.warn('[StudioApp] Could not load project from repository:', e);
    }

    this.project = {
      id: 'local_default_project',
      title: 'Academy Mystery',
      version: 1,
      ownerId: 'local_user',
      defaultLanguage: 'en',
      files: [
        {
          id: 'main.vns',
          name: 'main.vns',
          content: DEFAULT_STARTER_SCRIPT,
          order: 0,
          version: 1,
        },
      ],
      characters: [
        {
          id: 'alice',
          name: 'Alice Carroll',
          colorHex: '#38bdf8',
          sprites: {
            default: '',
            happy: '',
            serious: '',
            sad: '',
          },
        },
      ],
      variables: [],
      assets: [
        {
          id: 'asset_bg_courtyard',
          name: 'bg_courtyard',
          type: 'image',
          storageUrl: '',
          sizeBytes: 1024 * 180,
        },
        {
          id: 'asset_theme_peaceful',
          name: 'theme_peaceful',
          type: 'audio',
          storageUrl: '',
          sizeBytes: 1024 * 1024 * 2,
        },
      ],
      uiScreens: [],
      customScripts: [],
    };
    this.activeFile = 'main.vns';
  }

  public async loadProjectById(projectId: string): Promise<void> {
    this.flushEditorChanges();
    if (
      this.isDirty &&
      this.project?.id &&
      this.project.id !== projectId &&
      this.project.id !== 'local_default_project'
    ) {
      await this.saveProjectToStorage();
    }
    this.isDirty = false;

    try {
      const loaded = await this.repository.getProject(projectId);
      if (loaded) {
        this.project = loaded;
        if (!this.project.title) this.project.title = 'Untitled Project';
        if (!Array.isArray(this.project.characters)) this.project.characters = [];
        if (!Array.isArray(this.project.assets)) this.project.assets = [];
        if (!Array.isArray(this.project.files) || this.project.files.length === 0) {
          this.project.files = [
            {
              id: 'main.vns',
              name: 'main.vns',
              content: DEFAULT_STARTER_SCRIPT,
              order: 0,
              version: 1,
            },
          ];
        }
        const fileNames = this.project.files.map(f => f.name);
        this.activeFile = fileNames[0] ?? 'main.vns';

        if (this.projectTitleEl) this.projectTitleEl.textContent = this.project.title;
        if (this.activeFilenameEl) this.activeFilenameEl.textContent = this.activeFile;

        this.renderFileList();
        this.renderCharacterList();
        this.renderAssetList();

        const content = this.getFileContent(this.activeFile);
        const model = this.getOrCreateTextModel(this.activeFile, content);
        const editor = this.getEditorInstance();
        if (editor) {
          editor.setModel(model);
          editor.layout();
        }
        this.previewBridge?.loadProject(this.project.id);
        this.compileCurrentScript();
      } else {
        console.warn(
          `[StudioApp] Project ${projectId} not found, redirecting to projects dashboard.`,
        );
        window.location.hash = '#/projects';
      }
    } catch (err) {
      console.error('[StudioApp] Error loading project by ID:', err);
      window.location.hash = '#/projects';
    }
  }

  public async saveProjectToStorage(): Promise<void> {
    try {
      if (this.saveStatusPill) {
        this.saveStatusPill.textContent = '● SAVING...';
        this.saveStatusPill.className = 'save-status-pill syncing';
      }

      if (this.isDirty) {
        this.project.version = (this.project.version || 1) + 1;
      }
      await this.repository.saveProject(this.project);
      this.isDirty = false;

      if (this.saveStatusPill) {
        this.saveStatusPill.textContent = '● SAVED';
        this.saveStatusPill.className = 'save-status-pill';
      }
    } catch (e) {
      console.error('[StudioApp] Error saving to storage:', e);
      if (this.saveStatusPill) {
        this.saveStatusPill.textContent = '● SAVE ERROR';
        this.saveStatusPill.className = 'save-status-pill error';
      }
    }
  }

  // ================================================================
  // COMPILATION & AST METADATA PROCESSING
  // ================================================================
  public compileCurrentScript(options?: { verbose?: boolean; clearOutput?: boolean }): void {
    if (options?.clearOutput !== false) {
      this.outputManager?.clear();
    }

    const editor = this.getEditorInstance();
    if (editor) {
      this.setFileContent(this.activeFile, editor.getValue());
    }

    const scriptFiles: ScriptFile[] = this.project.files.map((f, index) => ({
      id: f.id,
      name: f.name,
      content: f.content,
      order: index,
      version: f.version || 1,
    }));

    const result = this.compiler.compile(scriptFiles, {
      characters: this.project.characters,
    });

    const currentModel = editor?.getModel();

    if (result.success && result.program) {
      this.latestProgram = result.program;
      if (result.ast) {
        this.lastParsedAst = result.ast;
      }
      this.bottomDrawer?.renderSuccess(this.latestProgram.length, currentModel ?? undefined);
      this.previewBridge?.sendProgramToPreview(this.latestProgram);
      this.bytecodeInspector?.updateCompiledProgram(this.latestProgram, result.ast);
      this.bytecodeInspector?.setOutOfDate(false);

      if (result.ast) {
        this.updateSidebarMetadata(result.ast);
      }

      if (options?.verbose) {
        this.outputManager?.info(
          'compiler',
          `✓ Compiled script successfully (${this.latestProgram.length} instructions).`,
        );
      } else if (this.hadCompileErrors) {
        this.outputManager?.info(
          'compiler',
          `✓ All compilation errors resolved (${this.latestProgram.length} instructions).`,
        );
      }
      this.hadCompileErrors = false;
    } else {
      this.hadCompileErrors = true;
      const errors = result.errors || [];
      this.bottomDrawer?.renderErrors(errors, currentModel ?? undefined);
      this.bytecodeInspector?.setOutOfDate(true, errors.length);

      errors.forEach(err => {
        const locStr = err.loc?.line ? ` [line ${err.loc.line}:${err.loc.col ?? 1}]` : '';
        this.outputManager?.error('compiler', `Compile Error${locStr}: ${err.message}`);
      });
    }
  }

  private updateSidebarMetadata(ast: ProgramAST): void {
    const characters = new Map<string, { displayName?: string; sprites: Set<string> }>();
    const backgrounds = new Set<string>();
    const musicAssets = new Set<string>();
    const soundAssets = new Set<string>();
    const variables = new Map<string, VariableMeta>();
    const scenesList: string[] = [];

    if (ast.topLevelStatements) {
      for (const stmt of ast.topLevelStatements) {
        if (stmt.type === 'VarDefineStatement') {
          const vd = stmt as VarDefineStatement;
          variables.set(vd.variable, {
            name: vd.variable,
            value: (vd.value as { value?: unknown })?.value ?? 'assigned value',
            scope: 'global',
          });
        }
      }
    }

    const traverse = (stmts: StatementAST[], sceneName: string) => {
      for (const stmt of stmts) {
        if (stmt.type === 'ShowStatement') {
          const s = stmt as ShowStatement;
          backgrounds.add(s.character);
          if (!characters.has(s.character)) {
            characters.set(s.character, { sprites: new Set() });
          }
          if (s.sprite && s.sprite.trim().length > 0) {
            characters.get(s.character)!.sprites.add(s.sprite);
          }
        } else if (stmt.type === 'DialogueStatement') {
          const d = stmt as DialogueStatement;
          if (d.character) {
            if (!characters.has(d.character)) {
              characters.set(d.character, { sprites: new Set() });
            }
            if (d.displayNameOverride && !characters.get(d.character)!.displayName) {
              characters.get(d.character)!.displayName = d.displayNameOverride;
            }
          }
        } else if (stmt.type === 'RevealStatement') {
          const r = stmt as RevealStatement;
          if (!characters.has(r.characterId)) {
            characters.set(r.characterId, { sprites: new Set() });
          }
          characters.get(r.characterId)!.displayName = r.displayName;
        } else if (stmt.type === 'BackgroundStatement') {
          const b = stmt as BackgroundStatement;
          backgrounds.add(b.assetId);
        } else if (stmt.type === 'InspectStatement') {
          const insp = stmt as InspectStatement;
          backgrounds.add(insp.assetId);
        } else if (stmt.type === 'PlayStatement') {
          const p = stmt as PlayStatement;
          if (p.channel === 'music') musicAssets.add(p.assetId);
          else soundAssets.add(p.assetId);
        } else if (stmt.type === 'VarDefineStatement') {
          const vd = stmt as VarDefineStatement;
          variables.set(vd.variable, {
            name: vd.variable,
            value: (vd.value as { value?: unknown })?.value ?? 'assigned value',
            scope: 'local',
            sceneName,
          });
        } else if (stmt.type === 'VarAssignStatement') {
          const v = stmt as VarAssignStatement;
          const existing = variables.get(v.variable);
          if (existing) {
            existing.value = (v.value as { value?: unknown })?.value ?? existing.value;
          } else {
            variables.set(v.variable, {
              name: v.variable,
              value: (v.value as { value?: unknown })?.value ?? 'assigned value',
              scope: 'local',
              sceneName,
            });
          }
        } else if (stmt.type === 'IfStatement') {
          const ifs = stmt as IfStatement;
          traverse(ifs.consequent, sceneName);
          if (ifs.alternate) {
            if (Array.isArray(ifs.alternate)) traverse(ifs.alternate, sceneName);
            else traverse([ifs.alternate], sceneName);
          }
        } else if (stmt.type === 'WhileStatement') {
          const ws = stmt as WhileStatement;
          traverse(ws.body, sceneName);
        }
      }
    };

    if (Array.isArray(ast.scenes)) {
      for (const sc of ast.scenes) {
        if (sc && sc.name) {
          scenesList.push(sc.name);
          if (sc.body) traverse(sc.body, sc.name);
        }
      }
    }

    this.cachedAstMetadata.scenes = scenesList;
    this.cachedAstMetadata.characters = characters;
    this.cachedAstMetadata.assets.backgrounds = backgrounds;
    this.cachedAstMetadata.assets.audio = new Set([...musicAssets, ...soundAssets]);
    this.cachedAstMetadata.variables = Array.from(variables.keys());

    // 1. Reconciliation & Render
    this.characterManager?.reconcileCharactersWithScript(characters);
    this.renderCharacterList();

    this.assetManager?.reconcileAssetsWithScript(
      backgrounds,
      new Set([...musicAssets, ...soundAssets]),
    );
    this.renderAssetList();

    // 2. Render Variables Tab
    if (this.varContainer) {
      this.varContainer.innerHTML = '';
      if (variables.size === 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-meta-hint';
        hint.textContent =
          'No state variables yet. Use syntax: define var_name = value to declare a variable.';
        this.varContainer.appendChild(hint);
      } else {
        for (const [, meta] of variables) {
          const card = document.createElement('div');
          card.className = 'meta-card';

          const title = document.createElement('div');
          title.className = 'meta-card-title';
          title.textContent = `define ${meta.name}`;
          card.appendChild(title);

          const tags = document.createElement('div');
          tags.className = 'meta-tags-list';

          const scopePill = document.createElement('span');
          scopePill.className = 'meta-tag-pill';
          scopePill.style.fontWeight = '600';
          scopePill.style.color = meta.scope === 'global' ? '#4ade80' : '#60a5fa';
          scopePill.textContent =
            meta.scope === 'global' ? 'Global' : `Local: ${meta.sceneName || 'scene'}`;
          tags.appendChild(scopePill);

          const pill = document.createElement('span');
          pill.className = 'meta-tag-pill';
          pill.textContent = `Initial: ${String(meta.value)}`;
          tags.appendChild(pill);

          card.appendChild(tags);
          this.varContainer.appendChild(card);
        }
      }
    }

    // 3. Render Variables Watch in Bottom Drawer
    this.bottomDrawer?.populateSceneFilter(scenesList);
    this.bottomDrawer?.renderVariablesWatch(variables);
  }

  public findSceneAtLine(line: number): string | null {
    if (!this.lastParsedAst?.scenes) return null;
    let matchingScene: string | null = null;
    let minDiff = Infinity;
    for (const sc of this.lastParsedAst.scenes) {
      const scLine = sc.loc?.line ?? 1;
      if (scLine <= line) {
        const diff = line - scLine;
        if (diff < minDiff) {
          minDiff = diff;
          matchingScene = sc.name;
        }
      }
    }
    return matchingScene;
  }

  // ================================================================
  // ACTIONS: RUN FROM START, RUN FROM LINE, HEADER ACTIONS
  // ================================================================
  public runFromStart(): void {
    this.flushEditorChanges();
    this.compileCurrentScript({ verbose: true });
    this.outputManager?.info('player', '▶ Preview started.');
    if (this.latestProgram) {
      this.previewBridge?.sendProgramToPreview(this.latestProgram);
      this.showToast('▶ Running script from start!');
    }
  }

  public runFromLine(targetLine?: number, targetScene?: string | null): void {
    this.flushEditorChanges();
    if (!this.latestProgram) return;

    const editor = this.getEditorInstance();
    const line = targetLine ?? (editor?.getPosition()?.lineNumber || 1);

    this.previewBridge?.sendProgramToPreview(this.latestProgram, {
      targetScene: targetScene ?? null,
      targetLine: line,
      fileId: this.activeFile,
    });

    if (targetScene) {
      this.showToast(`▶ Running from scene: "${targetScene}" (line ${line})!`);
    } else {
      this.showToast(`▶ Running script from line ${line}!`);
    }
  }

  private setupHeaderActions(): void {
    document.getElementById('btn-back-to-projects')?.addEventListener('click', async () => {
      this.flushEditorChanges();
      await this.saveProjectToStorage();
      window.location.hash = '#/projects';
    });

    document.getElementById('btn-run-from-start')?.addEventListener('click', () => {
      this.runFromStart();
    });

    document.getElementById('btn-run-from-line')?.addEventListener('click', () => {
      this.editorController?.runFromLine();
    });

    document.getElementById('btn-export-game')?.addEventListener('click', () => {
      this.exportWizard?.open();
    });

    document.getElementById('btn-reload-preview')?.addEventListener('click', () => {
      this.compileCurrentScript({ verbose: true });
      this.outputManager?.info('player', '▶ Preview reloaded.');
      this.previewBridge?.reloadPreview();
    });

    document.getElementById('btn-popout-preview')?.addEventListener('click', () => {
      this.previewBridge?.popoutPreview();
    });

    document.getElementById('btn-format-document')?.addEventListener('click', () => {
      this.editorController?.formatActiveDocument();
    });
  }

  public showToast(message: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    if (this.toastTimerId !== null) {
      clearTimeout(this.toastTimerId);
    }
    this.toastTimerId = window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
      this.toastTimerId = null;
    }, 2200);
  }
}
