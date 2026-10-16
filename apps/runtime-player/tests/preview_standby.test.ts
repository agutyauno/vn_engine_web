import { describe, it, expect, beforeEach } from 'vitest';
import type { Instruction } from '@vn-engine/shared-types';
import { GameStorage } from '../src/storage';
import { VNPlayer } from '../src/player';

// Lightweight Mock DOM
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

function setupMockDom() {
  for (const k in domRegistry) delete domRegistry[k];

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

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: { search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
      setTimeout: (fn: Function, ms?: number) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id: Parameters<typeof globalThis.clearTimeout>[0]) => globalThis.clearTimeout(id),
    },
    configurable: true,
    writable: true,
  });
}

describe('VNPlayer Standby & Preview Mode', () => {
  beforeEach(() => {
    setupMockDom();
    GameStorage.setProjectId(null);
    GameStorage.setPreviewMode(false);
  });

  it('initializes in standby mode without running initial script', async () => {
    const sampleProgram: Instruction[] = [
      { type: 'SCENE', name: 'start' },
      { type: 'DIALOGUE', character: 'alice', text: 'Hello from scenario.vns' },
    ];

    const player = new VNPlayer(sampleProgram, { isStandby: true });
    expect(player.getIsStandby()).toBe(true);

    const standbyScreen = document.getElementById('preview-standby-screen');
    expect(standbyScreen?.classList.contains('hidden')).toBe(false);

    // Dialogue box should not be visible since it is in standby
    const dialogueBox = document.getElementById('dialogue-box');
    expect(dialogueBox?.classList.contains('hidden')).toBe(true);
  });

  it('exits standby mode and executes script upon reloadProgram', async () => {
    const player = new VNPlayer([], { isStandby: true });
    expect(player.getIsStandby()).toBe(true);

    const newProgram: Instruction[] = [
      { type: 'SCENE', name: 'intro' },
      { type: 'DIALOGUE', character: 'narrator', text: 'Script from Studio Editor' },
    ];

    await player.reloadProgram(newProgram);
    expect(player.getIsStandby()).toBe(false);

    const standbyScreen = document.getElementById('preview-standby-screen');
    expect(standbyScreen?.classList.contains('hidden')).toBe(true);
  });

  it('updates project ID and configures GameStorage accordingly', () => {
    const player = new VNPlayer([]);
    GameStorage.setPreviewMode(true);

    player.updateProjectData({ id: 'proj_studio_123' });
    expect(GameStorage.getProjectId()).toBe('proj_studio_123');
    expect(player.getProjectData().id).toBe('proj_studio_123');
  });
});
