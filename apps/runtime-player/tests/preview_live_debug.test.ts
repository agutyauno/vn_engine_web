import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { GameStorage } from '../src/storage';
import { VNPlayer } from '../src/player';

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

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  replaceChildren(..._nodes: unknown[]): void {
    this.children = [];
    this.textContent = '';
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (el: MockElement) => {
      if (selector.startsWith('.')) {
        if (el.classList.contains(selector.slice(1))) results.push(el);
      } else if (selector.startsWith('#')) {
        if (el.id === selector.slice(1)) results.push(el);
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

function setupMockDom() {
  for (const k in domRegistry) delete domRegistry[k];
  postedMessages = [];

  createEl('div', 'game-root');
  createEl('div', 'canvas-container');
  createEl('div', 'toast-notification', 'hidden');
  createEl('div', 'title-screen', 'hidden');
  createEl('div', 'speaker-nameplate', 'hidden');
  createEl('div', 'dialogue-box', 'hidden');
  createEl('div', 'dialogue-text');
  createEl('div', 'dialogue-next-indicator');
  createEl('div', 'control-bar');
  createEl('div', 'choices-container', 'hidden');
  createEl('div', 'modal-inspect', 'hidden');
  createEl('div', 'modal-desync-warning', 'hidden');
  createEl('div', 'modal-settings', 'hidden');
  createEl('div', 'preview-standby-screen', 'hidden');

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
    documentElement: new MockElement('html'),
    body: new MockElement('body'),
    addEventListener: () => {},
  };

  Object.defineProperty(globalThis, 'document', {
    value: mockDoc,
    configurable: true,
    writable: true,
  });

  let mockStore: Record<string, string> = {};
  const mockLocalStorage: Storage = {
    getItem: (key: string) => mockStore[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStore[key] = String(value);
    },
    removeItem: (key: string) => {
      delete mockStore[key];
    },
    clear: () => {
      mockStore = {};
    },
    get length() {
      return Object.keys(mockStore).length;
    },
    key: (index: number) => Object.keys(mockStore)[index] ?? null,
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  });

  const mockParent = {
    postMessage: vi.fn((message: unknown, targetOrigin: string) => {
      postedMessages.push({ message, targetOrigin });
    }),
  };

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { search: '?embedded=true&mode=preview&projectId=proj_test_123', origin: 'http://localhost:3000', hostname: 'localhost' },
      parent: mockParent,
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: (fn: Function, ms?: number) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id: Parameters<typeof globalThis.clearTimeout>[0]) => globalThis.clearTimeout(id),
    },
    configurable: true,
    writable: true,
  });
}

describe('Runtime Player Live Debugging & State Broadcasting (ADR-024)', () => {
  beforeEach(() => {
    setupMockDom();
    GameStorage.setPreviewMode(true);
    GameStorage.setProjectId('proj_test_123');
  });

  it('should broadcast PREVIEW_STATE_UPDATE upon advance and reload', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'ASSIGN', variable: 'health', value: { type: 'Literal', value: 100 }, scope: 'global' },
      { type: 'ASSIGN', variable: 'scene_step', value: { type: 'Literal', value: 1 }, scope: 'local' },
      { type: 'DIALOGUE', character: 'alice', text: 'Thoại số 1' },
    ];

    const player = new VNPlayer([], { isStandby: true });
    await player.reloadProgram(program);

    // Kiểm tra có message PREVIEW_STATE_UPDATE được gửi sang parent
    const updateMsg = postedMessages.find(
      p => (p.message as { type?: string })?.type === 'PREVIEW_STATE_UPDATE',
    );
    expect(updateMsg).toBeDefined();

    const payload = updateMsg?.message as {
      type: string;
      variables: Record<string, unknown>;
      localVariables: Record<string, unknown>;
      currentScene: string;
      instructionPointer: number;
    };
    expect(payload.type).toBe('PREVIEW_STATE_UPDATE');
    expect(payload.variables['health']).toBe(100);
    expect(payload.localVariables['scene_step']).toBe(1);
    expect(payload.currentScene).toBe('intro');
  });

  it('should support setVariable on VNPlayer and immediately broadcast state update', async () => {
    const program: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'ASSIGN', variable: 'gold', value: { type: 'Literal', value: 50 }, scope: 'global' },
      { type: 'DIALOGUE', character: 'alice', text: 'Welcome' },
    ];

    const player = new VNPlayer([], { isStandby: true });
    await player.reloadProgram(program);

    postedMessages = [];

    // Inject biến gold = 500
    player.setVariable('gold', 500, 'global');

    // VM State cập nhật
    expect(player.getVM().getState().variables['gold']).toBe(500);

    // Phát tín hiệu PREVIEW_STATE_UPDATE ngay lập tức
    const updateMsg = postedMessages.find(
      p => (p.message as { type?: string })?.type === 'PREVIEW_STATE_UPDATE',
    );
    expect(updateMsg).toBeDefined();
    const payload = updateMsg?.message as {
      variables: Record<string, unknown>;
    };
    expect(payload.variables['gold']).toBe(500);
  });

  it('should throttle frequent broadcastStateUpdate calls (50-100ms)', async () => {
    vi.useFakeTimers();
    try {
      const program: Instruction[] = [
        { type: 'SCENE', name: 'intro' },
        { type: 'ASSIGN', variable: 'timer', value: { type: 'Literal', value: 0 }, scope: 'global' },
      ];

      const player = new VNPlayer([], { isStandby: true });
      await player.reloadProgram(program);

      // Advance past initial reload broadcast
      vi.advanceTimersByTime(100);
      postedMessages = [];

      // Call broadcastStateUpdate multiple times consecutively
      player.broadcastStateUpdate();
      player.broadcastStateUpdate();
      player.broadcastStateUpdate();

      // The first call broadcasts, subsequent calls within 60ms are throttled
      expect(postedMessages.length).toBe(1);

      // Advance time by 30ms (still within 60ms window)
      vi.advanceTimersByTime(30);
      expect(postedMessages.length).toBe(1);

      // Trigger another throttled broadcast
      player.broadcastStateUpdate();

      // Advance time to pass the 60ms window
      vi.advanceTimersByTime(35);
      expect(postedMessages.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
