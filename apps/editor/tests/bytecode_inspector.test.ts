import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type * as monaco from 'monaco-editor';
import type { Instruction, ProgramAST, Project } from '@vn-engine/shared-types';
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

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  append(...nodes: unknown[]): void {
    nodes.forEach(n => {
      if (n instanceof MockElement) this.children.push(n);
    });
  }

  querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }

  addEventListener(event: string, handler: Function) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  dispatchEvent(event: { type: string; [key: string]: unknown }) {
    const list = this.eventListeners[event.type] || [];
    list.forEach(fn => fn(event));
  }

  matchesSelector(selector: string): boolean {
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    } else if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    } else if (this.tagName.toLowerCase() === selector.toLowerCase()) {
      return true;
    }
    return false;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (this.matchesSelector(selector)) {
      results.push(this);
    }
    const check = (el: MockElement) => {
      if (el.matchesSelector(selector) && !results.includes(el)) results.push(el);
      el.children.forEach(check);
    };
    this.children.forEach(check);
    return results;
  }

  scrollIntoView = vi.fn();
}

const domRegistry: Record<string, MockElement> = {};

function createEl(tag: string, id?: string, classNames?: string): MockElement {
  const el = new MockElement(tag);
  if (id) {
    el.id = id;
    domRegistry[id] = el;
  }
  if (classNames) el.classList = new MockClassList(classNames);
  return el;
}

function setupMockDom() {
  for (const k in domRegistry) delete domRegistry[k];

  // Workspace tab & pane
  createEl('button', 'tab-btn-bytecode', 'workspace-tab sidebar-tab');
  createEl('div', 'pane-bytecode', 'workspace-pane sidebar-pane');

  // Subtabs
  const btnSubtabBytecode = createEl('button', 'subtab-btn-bytecode', 'subtab-btn active');
  btnSubtabBytecode.dataset['subview'] = 'bytecode';
  const btnSubtabAst = createEl('button', 'subtab-btn-ast', 'subtab-btn');
  btnSubtabAst.dataset['subview'] = 'ast';

  // Subviews
  createEl('div', 'bytecode-view-container', 'bytecode-subview active');
  createEl('div', 'ast-view-container', 'bytecode-subview hidden');

  // Toolbar elements
  createEl('input', 'bytecode-search-input');
  createEl('select', 'bytecode-scene-select');
  createEl('span', 'bytecode-count-badge');
  createEl('button', 'btn-jump-current-pc');
  createEl('button', 'btn-copy-ast-json');

  // Out of date banner
  createEl('div', 'bytecode-out-of-date-alert', 'bytecode-alert-banner hidden');

  // Bytecode table tbody
  createEl('tbody', 'bytecode-tbody');

  // AST containers
  createEl('div', 'ast-monaco-container');
}

let BytecodeInspectorClass: new (
  ctx: StudioContext,
) => InstanceType<typeof import('../src/modules/bytecodeInspector').BytecodeInspector>;

beforeAll(async () => {
  setupMockDom();

  const mockDoc = {
    getElementById: (id: string) => domRegistry[id] || null,
    querySelector: (selector: string) => {
      for (const k in domRegistry) {
        const found = domRegistry[k].querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      const results: MockElement[] = [];
      for (const k in domRegistry) {
        const found = domRegistry[k].querySelectorAll(selector);
        found.forEach(el => {
          if (!results.includes(el)) results.push(el);
        });
      }
      return results;
    },
    createElement: (tag: string) => new MockElement(tag),
  };

  Object.defineProperty(globalThis, 'document', {
    value: mockDoc,
    configurable: true,
    writable: true,
  });

  const mockLocation = { href: 'http://localhost:3000', origin: 'http://localhost:3000' };
  (globalThis as unknown as { location: unknown }).location = mockLocation;
  (globalThis as unknown as { window: unknown }).window = {
    addEventListener: vi.fn(),
    document: mockDoc,
    location: mockLocation,
    setTimeout: (fn: Function) => fn(),
  };

  try {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  } catch {
    (globalThis as unknown as { navigator: unknown }).navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };
  }

  Object.defineProperty(globalThis, 'customElements', {
    value: { get: () => undefined, define: () => {} },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'HTMLElement', {
    value: MockElement,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'Element', {
    value: MockElement,
    configurable: true,
    writable: true,
  });

  const mod = await import('../src/modules/bytecodeInspector');
  BytecodeInspectorClass = mod.BytecodeInspector;
});

function createMockContext(projectOverride?: Partial<Project>): StudioContext {
  const project: Project = {
    id: 'test_proj',
    title: 'Test Visual Novel',
    version: 1,
    ownerId: 'user_1',
    defaultLanguage: 'vi',
    files: [
      { id: 'main.vns', name: 'main.vns', content: 'scene start {\n  alice: "Hello"\n}', order: 0, version: 1 },
    ],
    characters: [],
    variables: [],
    assets: [],
    uiScreens: [],
    customScripts: [],
    ...projectOverride,
  };

  const editorMock = {
    revealLineInCenter: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
  };

  return {
    getProject: () => project,
    setProject: vi.fn(),
    getActiveFile: () => 'main.vns',
    setActiveFile: vi.fn(),
    markDirty: vi.fn(),
    saveProjectToStorage: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
    compileCurrentScript: vi.fn(),
    getPreviewBaseUrl: () => 'http://localhost:3000',
    getPreviewOrigin: () => 'http://localhost:3000',
    getFilesMap: () => ({ 'main.vns': project.files[0].content }),
    getFileContent: (name: string) => project.files.find(f => f.name === name)?.content || '',
    setFileContent: vi.fn(),
    removeFile: vi.fn(),
    renameFileKey: vi.fn(),
    getProjectCharactersMap: () => new Map(),
    getProjectAssetsMap: () => ({ backgrounds: new Set(), audio: new Set() }),
    getCachedAstMetadata: () => ({ scenes: ['start'], characters: new Map(), assets: { backgrounds: new Set(), audio: new Set() }, variables: [] }),
    getEditorInstance: () => editorMock as unknown as monaco.editor.IStandaloneCodeEditor,
    getLatestProgram: () => null,
    getOrCreateTextModel: vi.fn(),
    disposeTextModel: vi.fn(),
    flushEditorChanges: vi.fn(),
    renderFileList: vi.fn(),
    renderCharacterList: vi.fn(),
    renderAssetList: vi.fn(),
    setModelMarkers: vi.fn(),
  };
}

describe('BytecodeInspector Module', () => {
  beforeEach(() => {
    setupMockDom();
  });

  const sampleInstructions: Instruction[] = [
    {
      type: 'SCENE',
      name: 'start',
      loc: { fileId: 'main.vns', line: 5, col: 1 },
    },
    {
      type: 'BACKGROUND',
      assetId: 'bg_courtyard',
      loc: { fileId: 'main.vns', line: 6, col: 5 },
    },
    {
      type: 'SHOW',
      character: 'alice',
      sprite: 'happy',
      position: 'center',
      loc: { fileId: 'main.vns', line: 7, col: 5 },
    },
    {
      type: 'DIALOGUE',
      character: 'alice',
      text: 'Hello world!',
      loc: { fileId: 'main.vns', line: 8, col: 5 },
    },
    {
      type: 'CHOICE',
      choices: [
        { text: 'Option 1', targetScene: '.option1' },
        { text: 'Option 2', targetScene: '.option2' },
      ],
      loc: { fileId: 'main.vns', line: 10, col: 5 },
    },
    {
      type: 'ASSIGN',
      variable: 'score',
      value: { type: 'Literal', value: 100 },
      loc: { fileId: 'main.vns', line: 15, col: 5 },
    },
  ];

  const sampleAst: ProgramAST = {
    type: 'Program',
    scenes: [
      {
        type: 'Scene',
        name: 'start',
        loc: { fileId: 'main.vns', line: 5 },
        body: [],
      },
    ],
  };

  it('renders bytecode instructions with PC, Opcode pill, formatted arguments, and loc', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    inspector.updateCompiledProgram(sampleInstructions, sampleAst);

    const tbody = domRegistry['bytecode-tbody']!;
    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).toBe(6);

    // Row 0: SCENE
    const r0Cols = rows[0].querySelectorAll('td');
    expect(r0Cols[0].textContent).toContain('0000');
    expect(r0Cols[1].textContent).toContain('SCENE');
    expect(r0Cols[2].textContent).toContain('scene start');
    expect(r0Cols[3].textContent).toContain('main.vns:5');

    // Row 3: DIALOGUE
    const r3Cols = rows[3].querySelectorAll('td');
    expect(r3Cols[0].textContent).toContain('0003');
    expect(r3Cols[1].textContent).toContain('DIALOGUE');
    expect(r3Cols[2].textContent).toContain('alice: "Hello world!"');
    expect(r3Cols[3].textContent).toContain('main.vns:8');

    // Check count badge
    expect(domRegistry['bytecode-count-badge']?.textContent).toContain('6 instructions');
  });

  it('clicking a bytecode row jumps to source line in Monaco editor', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    inspector.updateCompiledProgram(sampleInstructions, sampleAst);

    const tbody = domRegistry['bytecode-tbody']!;
    const row3 = tbody.querySelectorAll('tr')[3]; // DIALOGUE at line 8
    row3.dispatchEvent({ type: 'click' });

    const editor = ctx.getEditorInstance();
    expect(editor?.setPosition).toHaveBeenCalledWith({ lineNumber: 8, column: 5 });
    expect(editor?.revealLineInCenter).toHaveBeenCalledWith(8);
  });

  it('live execution pointer highlights current PC row and un-highlights previous row', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    inspector.updateCompiledProgram(sampleInstructions, sampleAst);

    const tbody = domRegistry['bytecode-tbody']!;
    const rows = tbody.querySelectorAll('tr');

    // Execute PC = 2
    inspector.updateExecutionPointer(2);
    expect(rows[2].classList.contains('bytecode-row-current')).toBe(true);
    expect(rows[3].classList.contains('bytecode-row-current')).toBe(false);

    // Advance to PC = 3
    inspector.updateExecutionPointer(3);
    expect(rows[2].classList.contains('bytecode-row-current')).toBe(false);
    expect(rows[3].classList.contains('bytecode-row-current')).toBe(true);
  });

  it('filters bytecode by search query and scene selection', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    inspector.updateCompiledProgram(sampleInstructions, sampleAst);

    // Search for "dialogue"
    inspector.search('dialogue');
    const tbody = domRegistry['bytecode-tbody']!;
    let visibleRows = tbody.querySelectorAll('tr').filter(r => !r.classList.contains('hidden'));
    expect(visibleRows.length).toBe(1);
    expect(visibleRows[0].querySelectorAll('td')[1].textContent).toContain('DIALOGUE');

    // Reset search
    inspector.search('');
    visibleRows = tbody.querySelectorAll('tr').filter(r => !r.classList.contains('hidden'));
    expect(visibleRows.length).toBe(6);
  });

  it('manages out-of-date banner when script has compilation errors', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    inspector.updateCompiledProgram(sampleInstructions, sampleAst);

    const banner = domRegistry['bytecode-out-of-date-alert']!;
    expect(banner.classList.contains('hidden')).toBe(true);

    // Trigger error
    inspector.setOutOfDate(true, 2);
    expect(banner.classList.contains('hidden')).toBe(false);
    expect(banner.textContent).toContain('2 errors');

    // Existing instructions still remain displayed
    const tbody = domRegistry['bytecode-tbody']!;
    expect(tbody.querySelectorAll('tr').length).toBe(6);

    // Successful re-compile clears alert
    inspector.setOutOfDate(false);
    expect(banner.classList.contains('hidden')).toBe(true);
  });

  it('switches between Bytecode and AST subviews and allows copying AST JSON', async () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    inspector.updateCompiledProgram(sampleInstructions, sampleAst);

    const bytecodeView = domRegistry['bytecode-view-container']!;
    const astView = domRegistry['ast-view-container']!;

    // Switch to AST view
    inspector.switchSubView('ast');
    expect(bytecodeView.classList.contains('hidden')).toBe(true);
    expect(astView.classList.contains('hidden')).toBe(false);

    // Copy AST button
    const copyBtn = domRegistry['btn-copy-ast-json']!;
    await copyBtn.dispatchEvent({ type: 'click' });

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(ctx.showToast).toHaveBeenCalledWith('✓ AST JSON copied to clipboard!');
  });

  it('formats CHOICE actions showing goto/call and enables searching them', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    const programWithChoice: Instruction[] = [
      {
        type: 'CHOICE',
        choices: [
          { text: 'Path A', action: 'goto', targetScene: 'scene_a' },
          { text: 'Subroutine B', action: 'call', targetScene: 'scene_b' },
        ],
      },
    ];

    inspector.updateCompiledProgram(programWithChoice);
    const tbody = domRegistry['bytecode-tbody']!;
    const choiceRow = tbody.querySelectorAll('tr')[0]!;
    expect(choiceRow.textContent).toContain('"Path A" -> goto scene_a');
    expect(choiceRow.textContent).toContain('"Subroutine B" -> call scene_b');

    // Searching "call" matches this choice row
    inspector.search('call');
    expect(choiceRow.classList.contains('hidden')).toBe(false);

    // Searching "goto" matches this choice row
    inspector.search('goto');
    expect(choiceRow.classList.contains('hidden')).toBe(false);
  });

  it('supports subscenes when filtering by parent scene, and global preamble', () => {
    const ctx = createMockContext();
    const inspector = new BytecodeInspectorClass(ctx);

    const hierarchicalProgram: Instruction[] = [
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 100 } }, // Preamble (before SCENE)
      { type: 'SCENE', name: 'lab_flow' },
      { type: 'DIALOGUE', character: null, text: 'Main scene' },
      { type: 'SCENE', name: 'lab_flow.turn' },
      { type: 'DIALOGUE', character: null, text: 'Sub-scene turn' },
      { type: 'SCENE', name: 'other_scene' },
      { type: 'DIALOGUE', character: null, text: 'Other scene' },
    ];

    const ast: ProgramAST = {
      type: 'Program',
      scenes: [
        { type: 'Scene', name: 'lab_flow', body: [] },
        { type: 'Scene', name: 'lab_flow.turn', body: [] },
        { type: 'Scene', name: 'other_scene', body: [] },
      ],
    };

    inspector.updateCompiledProgram(hierarchicalProgram, ast);
    const tbody = domRegistry['bytecode-tbody']!;

    // Filter by parent scene "lab_flow": both lab_flow AND lab_flow.turn should be visible!
    inspector.filterByScene('lab_flow');
    let visibleRows = tbody.querySelectorAll('tr').filter(r => !r.classList.contains('hidden'));
    expect(visibleRows.length).toBe(4); // SCENE lab_flow, DIALOGUE Main scene, SCENE lab_flow.turn, DIALOGUE Sub-scene turn

    // Filter by subscene "lab_flow.turn": only lab_flow.turn rows should be visible
    inspector.filterByScene('lab_flow.turn');
    visibleRows = tbody.querySelectorAll('tr').filter(r => !r.classList.contains('hidden'));
    expect(visibleRows.length).toBe(2); // SCENE lab_flow.turn, DIALOGUE Sub-scene turn

    // Filter by preamble: global ASSIGN row should be visible
    inspector.filterByScene('__preamble__');
    visibleRows = tbody.querySelectorAll('tr').filter(r => !r.classList.contains('hidden'));
    expect(visibleRows.length).toBe(1);
    expect(visibleRows[0].textContent).toContain('ASSIGN');
  });
});
