import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { CompileError } from '@vn-engine/dsl-compiler';
import type { Project } from '@vn-engine/shared-types';
import type { StudioContext } from '../src/modules/editorTypes';

class MockClassList {
  public classes: Set<string> = new Set();
  constructor(initial: string = '') {
    initial.split(/\s+/).filter(Boolean).forEach(c => this.classes.add(c));
  }
  add(cls: string) { this.classes.add(cls); }
  remove(cls: string) { this.classes.delete(cls); }
  contains(cls: string) { return this.classes.has(cls); }
  toggle(cls: string, force?: boolean): boolean {
    const shouldAdd = force !== undefined ? force : !this.classes.has(cls);
    if (shouldAdd) this.classes.add(cls);
    else this.classes.delete(cls);
    return shouldAdd;
  }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public classList: MockClassList;
  public children: MockElement[] = [];
  public style: Record<string, string> = {};
  private _textContent: string = '';
  get textContent(): string {
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join('');
    }
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = val;
  }
  get className(): string {
    return Array.from(this.classList.classes).join(' ');
  }
  set className(val: string) {
    this.classList = new MockClassList(val);
  }
  private _innerHTML: string = '';
  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }
  public dataset: Record<string, string> = {};
  public title: string = '';
  public value: string = '';
  private eventListeners: Record<string, Function[]> = {};

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
  }

  public parent: MockElement | null = null;

  appendChild(child: MockElement): MockElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parent = null;
    }
    return child;
  }

  remove(): void {
    if (this.parent) {
      this.parent.removeChild(this);
    }
  }

  querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const walk = (el: MockElement) => {
      for (const child of el.children) {
        if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
          results.push(child);
        } else if (selector.startsWith('#') && child.id === selector.slice(1)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  addEventListener(event: string, handler: Function): void {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  dispatchEvent(event: { type: string }): boolean {
    const listeners = this.eventListeners[event.type] || [];
    listeners.forEach(l => l(event));
    return true;
  }
}

let domRegistry: Record<string, MockElement> = {};

function createEl(tag: string, id?: string, className?: string): MockElement {
  const el = new MockElement(tag);
  if (id) {
    el.id = id;
    domRegistry[id] = el;
  }
  if (className) el.className = className;
  return el;
}

function setupMockDom() {
  domRegistry = {};

  const drawer = createEl('div', 'studio-bottom-drawer');
  const drawerHeader = createEl('div', undefined, 'drawer-header');
  const drawerTabs = createEl('div', undefined, 'drawer-tabs');
  const tabProblems = createEl('button', 'drawer-tab-problems', 'drawer-tab-btn active');
  tabProblems.dataset['drawerTab'] = 'problems';
  const summary = createEl('span', 'problems-summary');
  summary.textContent = '● Problems (0)';
  tabProblems.appendChild(summary);

  const tabVariables = createEl('button', 'drawer-tab-variables', 'drawer-tab-btn');
  tabVariables.dataset['drawerTab'] = 'variables';
  const tabVarsText = createEl('span');
  tabVarsText.textContent = 'Watch Variables';
  tabVariables.appendChild(tabVarsText);

  drawerTabs.appendChild(tabProblems);
  drawerTabs.appendChild(tabVariables);

  const drawerToggle = createEl('button', 'drawer-toggle-btn');
  drawerHeader.appendChild(drawerTabs);
  drawerHeader.appendChild(drawerToggle);

  const drawerBody = createEl('div', 'drawer-body');
  const paneProblems = createEl('div', 'drawer-pane-problems', 'drawer-pane active');
  const problemsList = createEl('div', 'problems-list');
  paneProblems.appendChild(problemsList);

  const paneVars = createEl('div', 'drawer-pane-variables', 'drawer-pane');
  const filterToolbar = createEl('div', undefined, 'vars-filter-toolbar');
  const sceneFilter = createEl('select', 'vars-scene-filter', 'vars-scene-select');
  const countBadge = createEl('div', 'vars-count-badge');
  filterToolbar.appendChild(sceneFilter);
  filterToolbar.appendChild(countBadge);
  const varsTbody = createEl('tbody', 'vars-watch-tbody');
  paneVars.appendChild(filterToolbar);
  paneVars.appendChild(varsTbody);

  drawerBody.appendChild(paneProblems);
  drawerBody.appendChild(paneVars);

  drawer.appendChild(drawerHeader);
  drawer.appendChild(drawerBody);

  const mockDoc = {
    getElementById: (id: string) => domRegistry[id] ?? null,
    querySelectorAll: (selector: string) => {
      const results: MockElement[] = [];
      for (const el of Object.values(domRegistry)) {
        if (selector === '.drawer-tab-btn' && el.classList.contains('drawer-tab-btn')) results.push(el);
        if (selector === '.drawer-pane' && el.classList.contains('drawer-pane')) results.push(el);
      }
      return results;
    },
    querySelector: (selector: string) => {
      if (selector === '.drawer-header') return drawerHeader;
      return null;
    },
    createElement: (tag: string) => new MockElement(tag),
  };

  Object.defineProperty(globalThis, 'document', {
    value: mockDoc,
    configurable: true,
    writable: true,
  });
}

function createMockContext(): StudioContext {
  const project: Project = {
    id: 'proj_test_789',
    title: 'Test Project',
    version: 1,
    ownerId: 'user_1',
    defaultLanguage: 'en',
    files: [
      { id: 'f_main', name: 'main.vns', content: 'scene start {}', order: 0, version: 1 },
    ],
    characters: [],
    assets: [],
    variables: [],
    uiScreens: [],
    customScripts: [],
  };

  return {
    getProject: () => project,
    setProject: vi.fn(),
    getActiveFile: () => 'main.vns',
    setActiveFile: vi.fn(),
    markDirty: vi.fn(),
    saveProjectToStorage: vi.fn(),
    showToast: vi.fn(),
    compileCurrentScript: vi.fn(),
    getPreviewBaseUrl: () => 'http://localhost:3000',
    getPreviewOrigin: () => 'http://localhost:3000',
    getFilesMap: () => ({ 'main.vns': 'scene start {}' }),
    getFileContent: () => 'scene start {}',
    setFileContent: vi.fn(),
    removeFile: vi.fn(),
    renameFileKey: vi.fn(),
    getProjectCharactersMap: () => new Map(),
    getProjectAssetsMap: () => ({ backgrounds: new Set(), audio: new Set() }),
    getCachedAstMetadata: () => ({
      characters: new Map(),
      backgrounds: new Set(),
      music: new Set(),
      sound: new Set(),
      assets: { backgrounds: new Set(), audio: new Set() },
      scenes: [],
      variables: [],
    }),
    getEditorInstance: vi.fn().mockReturnValue({
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
      focus: vi.fn(),
      layout: vi.fn(),
      setModel: vi.fn(),
    }),
    getLatestProgram: vi.fn().mockReturnValue([]),
    getOrCreateTextModel: vi.fn(),
    disposeTextModel: vi.fn(),
    flushEditorChanges: vi.fn(),
    renderFileList: vi.fn(),
    renderCharacterList: vi.fn(),
    renderAssetList: vi.fn(),
    setModelMarkers: vi.fn(),
  };
}

let BottomDrawerClass: typeof import('../src/modules/bottomDrawer').BottomDrawer;

beforeAll(async () => {
  setupMockDom();
  const mod = await import('../src/modules/bottomDrawer');
  BottomDrawerClass = mod.BottomDrawer;
});

describe('Unified Diagnostics Hub (Problems Tab)', () => {
  beforeEach(() => {
    setupMockDom();
  });

  it('initializes with zero problems in clean state', () => {
    const ctx = createMockContext();
    const drawer = new BottomDrawerClass(ctx);

    const summary = domRegistry['problems-summary']!;
    expect(summary.textContent).toContain('Problems (0)');
    expect(domRegistry['drawer-tab-problems']!.classList.contains('has-error')).toBe(false);
  });

  it('renders compiler errors with line/column and jumps to editor on click', () => {
    const ctx = createMockContext();
    const drawer = new BottomDrawerClass(ctx);

    const errors: CompileError[] = [
      {
        message: 'Syntax error: unexpected token',
        loc: { line: 5, col: 12, fileId: 'main.vns' },
      },
    ];

    drawer.renderErrors(errors);

    const summary = domRegistry['problems-summary']!;
    expect(summary.textContent).toContain('1');
    expect(domRegistry['drawer-tab-problems']!.classList.contains('has-error')).toBe(true);

    const rows = domRegistry['problems-list']!.children;
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('[main.vns]');
    expect(rows[0].textContent).toContain('Line 5, Col 12');
    expect(rows[0].textContent).toContain('Syntax error');

    // Click to jump
    rows[0].dispatchEvent({ type: 'click' });
    const editor = ctx.getEditorInstance()!;
    expect(editor.revealLineInCenter).toHaveBeenCalledWith(5);
    expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 5, column: 12 });
  });

  it('adds and aggregates runtime & missing asset diagnostics alongside compiler errors', () => {
    const ctx = createMockContext();
    const drawer = new BottomDrawerClass(ctx);

    // 1. Add compiler error
    drawer.renderErrors([
      { message: 'Undefined scene .forest', loc: { line: 10, col: 4, fileId: 'main.vns' } },
    ]);

    // 2. Add asset diagnostic problem
    drawer.addRuntimeDiagnostic({
      category: 'asset',
      severity: 'warning',
      message: 'Missing graphic asset: "alice.happy". Check spelling in script or upload it in Assets tab.',
      assetKey: 'alice.happy',
    });

    // 3. Add runtime logic diagnostic warning
    drawer.addRuntimeDiagnostic({
      category: 'runtime',
      severity: 'warning',
      message: "Scene 'intro' reached end without explicit 'return'.",
    });

    const summary = domRegistry['problems-summary']!;
    expect(summary.textContent).toContain('3');

    const rows = domRegistry['problems-list']!.children;
    expect(rows.length).toBe(3);

    // Check categories
    expect(rows[0].textContent).toContain('COMPILER');
    expect(rows[1].textContent).toContain('ASSET');
    expect(rows[1].textContent).toContain('alice.happy');
    expect(rows[2].textContent).toContain('RUNTIME');
    expect(rows[2].textContent).toContain("Scene 'intro'");
  });

  it('clears runtime diagnostics when clearRuntimeDiagnostics is called on recompile', () => {
    const ctx = createMockContext();
    const drawer = new BottomDrawerClass(ctx);

    drawer.addRuntimeDiagnostic({
      category: 'asset',
      severity: 'warning',
      message: 'Missing audio: "bgm_lake"',
    });

    expect(domRegistry['problems-list']!.children.length).toBe(1);

    drawer.clearRuntimeDiagnostics();

    // After clearing runtime diagnostics, if compiler is clean, state is clean
    drawer.renderSuccess(25);
    expect(domRegistry['problems-summary']!.textContent).toContain('Problems (0)');
    expect(domRegistry['problems-list']!.children.length).toBe(1);
    expect(domRegistry['problems-list']!.children[0].textContent).toContain('No problems detected');
  });
});
