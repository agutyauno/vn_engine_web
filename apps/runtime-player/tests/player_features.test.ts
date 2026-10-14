import { describe, it, expect, beforeEach } from 'vitest';
import { ChoiceOverlay } from '../src/ui/choiceOverlay';
import { DialogueView } from '../src/ui/dialogueView';
import { TitleScreen } from '../src/ui/titleScreen';

// Lightweight in-memory DOM Mock for headless testing
class MockClassList {
  private classes: Set<string> = new Set();
  constructor(initial: string = '') {
    initial.split(/\s+/).filter(Boolean).forEach(c => this.classes.add(c));
  }
  add(cls: string) { this.classes.add(cls); }
  remove(cls: string) { this.classes.delete(cls); }
  contains(cls: string) { return this.classes.has(cls); }
  toggle(cls: string, force?: boolean) {
    if (force === true) { this.classes.add(cls); return true; }
    if (force === false) { this.classes.delete(cls); return false; }
    if (this.classes.has(cls)) { this.classes.delete(cls); return false; }
    this.classes.add(cls); return true;
  }
  toString() { return Array.from(this.classes).join(' '); }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public classList: MockClassList;
  private _textContent: string = '';
  public style: Record<string, string> = {};
  public children: MockElement[] = [];
  public disabled: boolean = false;
  private listeners: Record<string, Function[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
    this.classList = new MockClassList();
  }

  get textContent(): string {
    if (this._textContent) return this._textContent;
    return this.children.map(c => c.textContent).join('');
  }

  set textContent(val: string) {
    this._textContent = val;
  }

  get className(): string {
    return this.classList.toString();
  }

  set className(val: string) {
    this.classList = new MockClassList(val);
  }

  get innerHTML(): string {
    return this.textContent;
  }

  set innerHTML(val: string) {
    this.children = [];
    this.textContent = val;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]?.push(handler);
  }

  click() {
    this.listeners['click']?.forEach(fn => fn({ target: this, stopPropagation: () => {} }));
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
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

const elementsById: Record<string, MockElement> = {};

function createEl(tag: string, id?: string, cls?: string): MockElement {
  const el = new MockElement(tag);
  if (id) {
    el.id = id;
    elementsById[id] = el;
  }
  if (cls) el.className = cls;
  return el;
}

const mockDoc = {
  createElement: (tag: string) => new MockElement(tag),
  getElementById: (id: string) => elementsById[id] || null,
  querySelectorAll: (selector: string): MockElement[] => {
    const list: MockElement[] = [];
    Object.values(elementsById).forEach(root => {
      list.push(...root.querySelectorAll(selector));
    });
    return list;
  },
};

(globalThis as unknown as { document: typeof mockDoc }).document = mockDoc;

function initDOM() {
  Object.keys(elementsById).forEach(k => delete elementsById[k]);

  const gameRoot = createEl('div', 'game-root');
  createEl('div', 'canvas-container');

  const titleScreen = createEl('div', 'title-screen', 'hidden');
  const titleHeading = createEl('h1', undefined, 'title-screen-heading');
  titleHeading.textContent = 'Game Title';
  titleScreen.appendChild(titleHeading);
  titleScreen.appendChild(createEl('button', 'btn-title-new'));
  titleScreen.appendChild(createEl('button', 'btn-title-load'));
  titleScreen.appendChild(createEl('button', 'btn-title-settings'));
  gameRoot.appendChild(titleScreen);

  const uiLayer = createEl('div', 'ui-layer');
  const dialogueWrapper = createEl('div', undefined, 'dialogue-wrapper');
  dialogueWrapper.appendChild(createEl('div', 'speaker-nameplate', 'hidden'));
  const dialogueBox = createEl('div', 'dialogue-box', 'hidden');
  dialogueBox.appendChild(createEl('div', 'dialogue-text'));
  dialogueBox.appendChild(createEl('div', 'dialogue-next-indicator'));
  dialogueWrapper.appendChild(dialogueBox);

  const controlBar = createEl('div', 'control-bar');
  controlBar.appendChild(createEl('button', 'btn-back'));
  controlBar.appendChild(createEl('button', 'btn-auto'));
  controlBar.appendChild(createEl('button', 'btn-skip'));
  controlBar.appendChild(createEl('button', 'btn-log'));
  controlBar.appendChild(createEl('button', 'btn-qsave'));
  controlBar.appendChild(createEl('button', 'btn-qload'));
  controlBar.appendChild(createEl('button', 'btn-hide-ui'));
  controlBar.appendChild(createEl('button', 'btn-menu'));
  dialogueWrapper.appendChild(controlBar);
  uiLayer.appendChild(dialogueWrapper);

  const choiceOverlay = createEl('div', 'choice-overlay', 'hidden');
  choiceOverlay.appendChild(createEl('div', 'choice-buttons-list'));
  uiLayer.appendChild(choiceOverlay);
  gameRoot.appendChild(uiLayer);
}

describe('Player Features & UI Enhancements', () => {
  beforeEach(() => {
    initDOM();
  });

  describe('ChoiceOverlay clean buttons', () => {
    it('renders choice buttons without choice-key-hint badges', () => {
      const overlay = new ChoiceOverlay();
      const choices = [
        { text: 'Look around', target: 'look', enabled: true },
        { text: 'Run away', target: 'run', enabled: true },
      ];

      let chosenIndex = -1;
      overlay.presentChoices(choices, idx => {
        chosenIndex = idx;
      });

      const choiceList = document.getElementById('choice-buttons-list') as unknown as MockElement;
      expect(choiceList.children.length).toBe(2);

      // Verify no .choice-key-hint element exists inside buttons
      const keyHints = choiceList.querySelectorAll('.choice-key-hint');
      expect(keyHints.length).toBe(0);

      // Verify button contains choice text directly
      expect(choiceList.children[0]?.textContent).toBe('Look around');
      expect(choiceList.children[1]?.textContent).toBe('Run away');

      // Click to choose
      choiceList.children[0]?.click();
      expect(chosenIndex).toBe(0);
    });
  });

  describe('DialogueView setCustomSkin no-op', () => {
    it('does not assign ui-skin class to game-root (no-op until Custom UI phase)', () => {
      const dialogueView = new DialogueView();
      const gameRoot = document.getElementById('game-root')!;

      dialogueView.setCustomSkin('phone_chat_ui');
      expect(gameRoot.className).not.toContain('ui-skin-phone_chat_ui');
      expect(gameRoot.className).toBe('');

      dialogueView.setCustomSkin('retro_rpg');
      expect(gameRoot.className).not.toContain('ui-skin-retro_rpg');
      expect(gameRoot.className).toBe('');
    });
  });

  describe('TitleScreen component', () => {
    it('manages title screen visibility and button actions', () => {
      let newGameClicked = false;
      let loadGameClicked = false;
      let settingsClicked = false;

      const titleScreen = new TitleScreen({
        onNewGame: () => {
          newGameClicked = true;
        },
        onLoadGame: () => {
          loadGameClicked = true;
        },
        onSettings: () => {
          settingsClicked = true;
        },
      });

      const titleEl = document.getElementById('title-screen')!;

      // Initially show title screen
      titleScreen.show();
      expect(titleEl.classList.contains('hidden')).toBe(false);
      expect(titleScreen.isOpen()).toBe(true);

      // Click Load Game
      document.getElementById('btn-title-load')?.click();
      expect(loadGameClicked).toBe(true);

      // Click Settings
      document.getElementById('btn-title-settings')?.click();
      expect(settingsClicked).toBe(true);

      // Click New Game
      document.getElementById('btn-title-new')?.click();
      expect(newGameClicked).toBe(true);
      expect(titleEl.classList.contains('hidden')).toBe(true);
      expect(titleScreen.isOpen()).toBe(false);
    });
  });
});
