import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { PreviewStateUpdateMessage } from '../src/modules/previewBridge';
import type { VariableMeta } from '../src/modules/bottomDrawer';
import type { StudioContext } from '../src/modules/editorTypes';
import type { Project } from '@vn-engine/shared-types';

class MockClassList {
  private classes: Set<string> = new Set();
  constructor(initial: string = '') {
    initial.split(/\s+/).filter(Boolean).forEach(c => this.classes.add(c));
  }
  add(cls: string) { this.classes.add(cls); }
  remove(cls: string) { this.classes.delete(cls); }
  contains(cls: string) { return this.classes.has(cls); }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public classList: MockClassList;
  public children: MockElement[] = [];
  public style: Record<string, string> = {};
  public textContent: string = '';
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
  public colSpan: number = 1;
  public dataset: Record<string, string> = {};
  public title: string = '';
  public value: string = '';
  public contentWindow: { postMessage: ReturnType<typeof vi.fn> } | null = null;
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

  focus() {}

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (el: MockElement) => {
      if (selector.startsWith('.')) {
        if (el.classList.contains(selector.slice(1))) results.push(el);
      } else if (selector.startsWith('#')) {
        if (el.id === selector.slice(1)) results.push(el);
      } else if (el.tagName.toLowerCase() === selector.toLowerCase()) {
        results.push(el);
      }
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

let postedMessages: Array<{ message: unknown; targetOrigin: string }> = [];
let windowMessageListeners: Function[] = [];

function setupMockDom() {
  for (const k in domRegistry) delete domRegistry[k];
  postedMessages = [];
  windowMessageListeners = [];

  const iframe = createEl('iframe', 'preview-iframe');
  iframe.contentWindow = {
    postMessage: vi.fn((message: unknown, targetOrigin: string) => {
      postedMessages.push({ message, targetOrigin });
    }),
  };

  createEl('span', 'preview-hot-reload-status');
  createEl('div', 'drawer-tab-problems');
  createEl('div', 'problems-summary');
  createEl('div', 'problems-list');
  createEl('tbody', 'vars-watch-tbody');

  const mockDoc = {
    getElementById: (id: string) => domRegistry[id] ?? null,
    createElement: (tag: string) => new MockElement(tag),
    querySelectorAll: (selector: string): MockElement[] => {
      const list: MockElement[] = [];
      Object.values(domRegistry).forEach(root => {
        list.push(...root.querySelectorAll(selector));
      });
      return list;
    },
    querySelector: (selector: string): MockElement | null => {
      for (const root of Object.values(domRegistry)) {
        const found = root.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    documentElement: new MockElement('html'),
    body: new MockElement('body'),
    addEventListener: () => {},
  };

  const mockCustomElements = {
    get: () => undefined,
    define: () => {},
  };

  Object.defineProperty(globalThis, 'customElements', {
    value: mockCustomElements,
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

  Object.defineProperty(globalThis, 'document', {
    value: mockDoc,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { origin: 'http://localhost:3001' },
      addEventListener: (event: string, handler: Function) => {
        if (event === 'message') windowMessageListeners.push(handler);
      },
      removeEventListener: () => {},
      document: mockDoc,
      HTMLElement: MockElement,
      Element: MockElement,
      customElements: mockCustomElements,
      navigator: { userAgent: 'node' },
    },
    configurable: true,
    writable: true,
  });
}

function createMockContext(): StudioContext {
  const project: Project = {
    id: 'proj_test_456',
    title: 'Test Project',
    version: 1,
    ownerId: 'user_1',
    defaultLanguage: 'en',
    files: [],
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
    getFilesMap: () => ({}),
    getFileContent: () => '',
    setFileContent: vi.fn(),
    removeFile: vi.fn(),
    renameFileKey: vi.fn(),
    getProjectCharactersMap: () => new Map(),
    getProjectAssetsMap: () => ({ backgrounds: new Set(), audio: new Set() }),
    getCachedAstMetadata: () => ({ scenes: [], characters: new Map(), assets: { backgrounds: new Set(), audio: new Set() }, variables: [] }),
    getEditorInstance: () => undefined,
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

let PreviewBridgeClass: typeof import('../src/modules/previewBridge').PreviewBridge;
let BottomDrawerClass: typeof import('../src/modules/bottomDrawer').BottomDrawer;

describe('PreviewBridge & BottomDrawer Live Debugger Suite (ADR-024)', () => {
  beforeAll(async () => {
    setupMockDom();
    const pb = await import('../src/modules/previewBridge');
    PreviewBridgeClass = pb.PreviewBridge;
    const bd = await import('../src/modules/bottomDrawer');
    BottomDrawerClass = bd.BottomDrawer;
  });

  beforeEach(() => {
    setupMockDom();
  });

  it('PreviewBridge sends SET_VM_VARIABLE message to preview iframe', () => {
    const ctx = createMockContext();
    const bridge = new PreviewBridgeClass(ctx);

    bridge.setVariable('affinity', 95, 'global');

    expect(postedMessages).toHaveLength(1);
    expect(postedMessages[0]?.targetOrigin).toBe('http://localhost:3000');
    expect(postedMessages[0]?.message).toEqual({
      type: 'SET_VM_VARIABLE',
      name: 'affinity',
      value: 95,
      scope: 'global',
    });
  });

  it('PreviewBridge triggers onStateUpdate upon receiving PREVIEW_STATE_UPDATE from allowed origin', () => {
    const ctx = createMockContext();
    const bridge = new PreviewBridgeClass(ctx);

    let receivedUpdate: PreviewStateUpdateMessage | null = null;
    bridge.onStateUpdate((state: PreviewStateUpdateMessage) => {
      receivedUpdate = state;
    });

    const fakeEvent = {
      origin: 'http://localhost:3000',
      data: {
        type: 'PREVIEW_STATE_UPDATE',
        variables: { score: 100 },
        localVariables: { turn: 2 },
        currentScene: 'chapter_one',
        instructionPointer: 15,
      },
    };

    windowMessageListeners.forEach(fn => fn(fakeEvent));

    expect(receivedUpdate).not.toBeNull();
    const res = receivedUpdate as unknown as PreviewStateUpdateMessage;
    expect(res.variables['score']).toBe(100);
    expect(res.currentScene).toBe('chapter_one');
  });

  it('BottomDrawer renders live variables and triggers onVariableChange upon inline edit', () => {
    const ctx = createMockContext();
    const drawer = new BottomDrawerClass(ctx);

    const onVarChange = vi.fn();
    drawer.setOnVariableChange(onVarChange);

    const astVariables = new Map<string, VariableMeta>([
      ['points', { name: 'points', value: 0, scope: 'global' }],
      ['local_cnt', { name: 'local_cnt', value: 1, scope: 'local', sceneName: 'scene1' }],
    ]);

    drawer.renderVariablesWatch(astVariables);

    // Cập nhật live state
    drawer.updateLiveVariables({
      type: 'PREVIEW_STATE_UPDATE',
      variables: { points: 50 },
      localVariables: { local_cnt: 9 },
      currentScene: 'scene1',
      instructionPointer: 10,
    });

    const tbody = domRegistry['vars-watch-tbody']!;
    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).toBe(2);

    // Kiểm tra row 0 (points) có giá trị live là 50
    const pointRow = rows[0]!;
    const cells = pointRow.querySelectorAll('td');
    expect(cells[0]?.textContent).toBe('points');
    expect(cells[3]?.textContent).toContain('50');

    // Trigger inline edit on cell
    const valCell = cells[3]!;
    valCell.dispatchEvent({ type: 'click' });

    // Cell should now contain an input
    const input = valCell.querySelectorAll('input')[0];
    expect(input).toBeDefined();

    // User types new value and presses Enter
    if (input) {
      input.value = '250';
      input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    }

    expect(onVarChange).toHaveBeenCalledWith('points', 250, 'global');
  });
});
