import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { LogEntry, LogChannel, LogLevel } from '@vn-engine/shared-types';
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
  public checked: boolean = true;
  public scrollTop: number = 0;
  public scrollHeight: number = 0;
  public clientHeight: number = 0;
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

  // Drawer tab & badge
  const tabBtn = createEl('button', 'drawer-tab-output', 'drawer-tab-btn');
  tabBtn.dataset['drawerTab'] = 'output';
  createEl('span', 'output-error-badge', 'output-badge-count hidden');

  // Terminal Container
  createEl('div', 'drawer-pane-output', 'drawer-pane');
  createEl('div', 'output-terminal-lines', 'output-terminal-lines font-mono');

  // Toolbars & Controls
  createEl('select', 'output-channel-filter');
  createEl('select', 'output-level-filter');
  createEl('input', 'output-search-input');
  createEl('button', 'btn-clear-output');
  createEl('button', 'btn-copy-output');
  const scrollToggle = createEl('input', 'toggle-autoscroll-output');
  scrollToggle.checked = true;

  if (typeof global !== 'undefined') {
    (global as unknown as { document: unknown }).document = {
      getElementById: (id: string) => domRegistry[id] || null,
      createElement: (tag: string) => new MockElement(tag),
      querySelectorAll: (sel: string) => {
        const results: MockElement[] = [];
        for (const k in domRegistry) {
          results.push(...domRegistry[k].querySelectorAll(sel));
        }
        return results;
      },
      querySelector: (sel: string) => {
        for (const k in domRegistry) {
          const found = domRegistry[k].querySelector(sel);
          if (found) return found;
        }
        return null;
      },
    };

    try {
      Object.defineProperty(global, 'navigator', {
        value: {
          clipboard: {
            writeText: vi.fn().mockResolvedValue(undefined),
          },
        },
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore
    }
  }
}

function createMockContext(): StudioContext {
  return {
    getProject: vi.fn().mockReturnValue({ id: 'test_proj', title: 'Test' }),
    setProject: vi.fn(),
    getActiveFile: vi.fn().mockReturnValue('main.vns'),
    setActiveFile: vi.fn(),
    markDirty: vi.fn(),
    saveProjectToStorage: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
    compileCurrentScript: vi.fn(),
    getPreviewBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
    getPreviewOrigin: vi.fn().mockReturnValue('http://localhost:3000'),
    getFilesMap: vi.fn().mockReturnValue({}),
    getFileContent: vi.fn().mockReturnValue(''),
    setFileContent: vi.fn(),
    removeFile: vi.fn(),
    renameFileKey: vi.fn(),
    getProjectCharactersMap: vi.fn().mockReturnValue(new Map()),
    getProjectAssetsMap: vi.fn().mockReturnValue({ backgrounds: new Set(), audio: new Set() }),
    getCachedAstMetadata: vi.fn().mockReturnValue({
      scenes: [],
      characters: new Map(),
      assets: { backgrounds: new Set(), audio: new Set() },
      variables: [],
    }),
    getEditorInstance: vi.fn().mockReturnValue(undefined),
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

let OutputManagerClass: typeof import('../src/modules/outputManager').OutputManager;

beforeAll(async () => {
  setupMockDom();
  const mod = await import('../src/modules/outputManager');
  OutputManagerClass = mod.OutputManager;
});

describe('OutputManager Module', () => {
  beforeEach(() => {
    setupMockDom();
  });

  it('initializes and appends INFO, WARN, and ERROR log entries correctly', () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx);

    manager.info('compiler', 'Compiled scene start successfully');
    manager.warn('player', 'Implicit return executed from scene .sub');
    manager.error('assets', 'Failed to load background texture: bg_forest');

    const lines = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line');
    expect(lines.length).toBe(3);

    // Line 0: INFO
    expect(lines[0].classList.contains('log-info')).toBe(true);
    expect(lines[0].textContent).toContain('[COMPILER]');
    expect(lines[0].textContent).toContain('Compiled scene start successfully');

    // Line 1: WARN
    expect(lines[1].classList.contains('log-warn')).toBe(true);
    expect(lines[1].textContent).toContain('[PLAYER]');
    expect(lines[1].textContent).toContain('Implicit return executed');

    // Line 2: ERROR
    expect(lines[2].classList.contains('log-error')).toBe(true);
    expect(lines[2].textContent).toContain('[ASSETS]');
    expect(lines[2].textContent).toContain('Failed to load background texture');
  });

  it('updates error badge counter on the drawer tab button when errors occur', () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx);
    const badge = domRegistry['output-error-badge']!;

    expect(badge.classList.contains('hidden')).toBe(true);
    expect(manager.getErrorCount()).toBe(0);

    manager.info('compiler', 'Building project');
    expect(badge.classList.contains('hidden')).toBe(true);

    manager.error('compiler', 'Syntax error on line 4');
    expect(badge.classList.contains('hidden')).toBe(false);
    expect(badge.textContent).toBe('1');
    expect(manager.getErrorCount()).toBe(1);

    manager.error('player', 'Division by zero in expression');
    expect(badge.textContent).toBe('2');
    expect(manager.getErrorCount()).toBe(2);

    // Clear resets error badge
    manager.clear();
    expect(badge.classList.contains('hidden')).toBe(true);
    expect(manager.getErrorCount()).toBe(0);
  });

  it('enforces Ring Buffer max capacity (1000 lines) by evicting oldest logs', () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx, { maxCapacity: 1000 });

    // Insert 1050 logs
    for (let i = 0; i < 1050; i++) {
      manager.info('player', `Log message #${i}`);
    }

    const logs = manager.getLogs();
    expect(logs.length).toBe(1000);
    expect(logs[0].message).toBe('Log message #50');
    expect(logs[999].message).toBe('Log message #1049');

    const lines = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line');
    expect(lines.length).toBe(1000);
  });

  it('filters logs by Channel (all, compiler, player, assets, export)', () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx);

    manager.info('compiler', 'Compiler ready');
    manager.info('player', 'Audio playing bgm');
    manager.warn('assets', 'Missing sprite alice.angry');
    manager.info('export', 'Packaging zip bundle');

    // Filter by compiler
    manager.setChannelFilter('compiler');
    let visible = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line').filter(
      l => !l.classList.contains('hidden'),
    );
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('Compiler ready');

    // Filter by assets
    manager.setChannelFilter('assets');
    visible = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line').filter(
      l => !l.classList.contains('hidden'),
    );
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('alice.angry');

    // Reset to all
    manager.setChannelFilter('all');
    visible = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line').filter(
      l => !l.classList.contains('hidden'),
    );
    expect(visible.length).toBe(4);
  });

  it('filters logs by Level (all, info, warn, error)', () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx);

    manager.info('player', 'Info message');
    manager.warn('player', 'Warning message');
    manager.error('player', 'Error message');

    // Filter WARN only
    manager.setLevelFilter('warn');
    let visible = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line').filter(
      l => !l.classList.contains('hidden'),
    );
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('Warning message');

    // Filter ERROR only
    manager.setLevelFilter('error');
    visible = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line').filter(
      l => !l.classList.contains('hidden'),
    );
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('Error message');
  });

  it('filters logs by text search query', () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx);

    manager.info('compiler', 'Compiling main.vns');
    manager.info('player', 'Showing sprite bob.normal');
    manager.error('assets', 'Failed to load sound click.wav');

    manager.setSearchQuery('click');
    const visible = domRegistry['output-terminal-lines']!.querySelectorAll('.log-line').filter(
      l => !l.classList.contains('hidden'),
    );
    expect(visible.length).toBe(1);
    expect(visible[0].textContent).toContain('click.wav');
  });

  it('copies all visible logs to clipboard as formatted text', async () => {
    const ctx = createMockContext();
    const manager = new OutputManagerClass(ctx);

    manager.info('compiler', 'Build ok');
    manager.warn('player', 'Volume low');

    await manager.copyLogsToClipboard();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const copiedText = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(copiedText).toContain('[COMPILER]');
    expect(copiedText).toContain('Build ok');
    expect(copiedText).toContain('[PLAYER]');
    expect(copiedText).toContain('Volume low');
  });
});
