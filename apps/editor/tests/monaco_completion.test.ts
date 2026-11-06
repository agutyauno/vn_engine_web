// @vitest-environment jsdom
// apps/editor/tests/monaco_completion.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import type { Project, AssetRef, Character, VariableDeclaration } from '@vn-engine/shared-types';
import { createVnsProjectContext } from '../src/core/services/vnsContextProvider';
import { registerVnsLanguageFeatures, type VnsProjectContext } from '../src/vnsLanguageFeatures';

function createMockProject(options?: {
  assets?: AssetRef[];
  characters?: Array<{ id: string; name: string; sprites?: Record<string, string> }>;
  variables?: Array<{ name: string }>;
}): Project {
  return {
    id: 'test-monaco-proj',
    title: 'Test Monaco Project',
    version: 1,
    ownerId: 'owner-1',
    defaultLanguage: 'vi',
    files: [],
    characters: (options?.characters as unknown as Character[]) || [],
    variables: (options?.variables as unknown as VariableDeclaration[]) || [],
    assets: options?.assets || [],
    uiScreens: [],
    customScripts: [],
  };
}

describe('Monaco VNS Completion & Dynamic Store Binding', () => {
  it('TC-AUTO-01: getAssets returns asset.id (DSL 1.1.0 compliant) alongside asset.name for background and audio', () => {
    let currentProject = createMockProject({
      assets: [
        {
          id: 'bg_classroom',
          name: 'Classroom Sunset.png',
          type: 'image',
          category: 'background',
          storageUrl: '/assets/classroom.png',
          sizeBytes: 1024,
        },
        {
          id: 'bgm_peaceful',
          name: 'Peaceful Afternoon.mp3',
          type: 'audio',
          category: 'bgm',
          storageUrl: '/assets/peaceful.mp3',
          sizeBytes: 2048,
        },
      ],
    });

    const context = createVnsProjectContext(() => currentProject);
    const { backgrounds, audio } = context.getAssets();

    // Must contain DSL 1.1.0 identifier asset.id
    expect(backgrounds.has('bg_classroom')).toBe(true);
    expect(audio.has('bgm_peaceful')).toBe(true);

    // Also support fallback by asset.name
    expect(backgrounds.has('Classroom Sunset.png')).toBe(true);
    expect(audio.has('Peaceful Afternoon.mp3')).toBe(true);
  });

  it('TC-AUTO-02: dynamically reflects live project updates from store without stale closure', () => {
    let projectState = createMockProject({
      assets: [
        {
          id: 'bg_initial',
          name: 'initial.png',
          type: 'image',
          category: 'background',
          storageUrl: '/assets/initial.png',
          sizeBytes: 100,
        },
      ],
      characters: [{ id: 'alice', name: 'Alice', sprites: { happy: '/happy.png' } }],
    });

    const context = createVnsProjectContext(() => projectState);

    // Initial check
    expect(context.getAssets().backgrounds.has('bg_initial')).toBe(true);
    expect(context.getCharacters().has('alice')).toBe(true);
    expect(context.getCharacters().has('bob')).toBe(false);

    // Simulate project update in store (e.g. user added character bob and asset bg_courtyard)
    projectState = {
      ...projectState,
      assets: [
        ...projectState.assets,
        {
          id: 'bg_courtyard',
          name: 'courtyard.png',
          type: 'image',
          category: 'background',
          storageUrl: '/assets/courtyard.png',
          sizeBytes: 200,
        },
      ],
      characters: [
        ...projectState.characters,
        { id: 'bob', name: 'Bob', sprites: { default: '/bob.png' } },
      ],
    };

    // Live query through context provider MUST reflect new data without restarting
    expect(context.getAssets().backgrounds.has('bg_courtyard')).toBe(true);
    expect(context.getCharacters().has('bob')).toBe(true);
  });
});

// Helper tạo mock Monaco text model
function createMockModel(content: string): monaco.editor.ITextModel {
  const lines = content.split('\n');
  return {
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
    getWordUntilPosition: (position: monaco.Position) => {
      const line = lines[position.lineNumber - 1] ?? '';
      const text = line.substring(0, position.column - 1);
      const match = text.match(/[a-zA-Z0-9_]+$/);
      return {
        word: match ? match[0] : '',
        startColumn: match ? position.column - match[0].length : position.column,
        endColumn: position.column,
      };
    },
    getWordAtPosition: (position: monaco.Position) => {
      const line = lines[position.lineNumber - 1] ?? '';
      const text = line.substring(0, position.column);
      const match = text.match(/[a-zA-Z0-9_]+$/);
      return match
        ? {
            word: match[0],
            startColumn: position.column - match[0].length + 1,
            endColumn: position.column + 1,
          }
        : null;
    },
    getValue: () => content,
  } as unknown as monaco.editor.ITextModel;
}

describe('Monaco DSL 1.1.0 Features, Scoped Interpolation & Hover Provider (TDD RED)', () => {
  let capturedCompletionProvider: monaco.languages.CompletionItemProvider | null = null;
  let capturedHoverProvider: monaco.languages.HoverProvider | null = null;

  const dummyContext: monaco.languages.CompletionContext = {
    triggerKind: monaco.languages.CompletionTriggerKind.Invoke,
  };
  const dummyToken: monaco.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(),
  };

  beforeEach(() => {
    capturedCompletionProvider = null;
    capturedHoverProvider = null;

    vi.spyOn(monaco.languages, 'registerCompletionItemProvider').mockImplementation(
      (_lang, provider) => {
        capturedCompletionProvider = provider;
        return { dispose: () => {} };
      },
    );

    vi.spyOn(monaco.languages, 'registerHoverProvider').mockImplementation((_lang, provider) => {
      capturedHoverProvider = provider;
      return { dispose: () => {} };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // TC-MC-01: Jump suggestions with source doc
  it('TC-MC-01: Jump suggestions display source file name and declaration line number in documentation', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [{ name: 'intro', file: 'prologue.vns', line: 12 }],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    const model = createMockModel('goto ');
    const pos = { lineNumber: 1, column: 6 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const introSuggestion = (result?.suggestions || []).find(s => s.label === 'intro');
    expect(introSuggestion).toBeDefined();
    expect(introSuggestion?.documentation).toContain('prologue.vns');
    expect(introSuggestion?.documentation).toContain('12');
  });

  // TC-MC-02: DSL 1.1.0 input snippet
  it('TC-MC-02: Suggests DSL 1.1.0 input snippet when typing input keyword', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    const model = createMockModel('input');
    const pos = { lineNumber: 1, column: 6 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const inputSnippet = (result?.suggestions || []).find(s => s.label === 'input');
    expect(inputSnippet).toBeDefined();
    expect(inputSnippet?.insertText).toContain(
      'input ${1:variable} "${2:Prompt question}" default: "${3:value}"',
    );
  });

  // TC-MC-03: DSL 1.1.0 play voice snippet
  it('TC-MC-03: Suggests voice assets from context.getAssets().voices after play voice', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({
        backgrounds: new Set(),
        audio: new Set(),
        voices: new Set(['voice_alice_hello']),
      }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    const model = createMockModel('play voice ');
    const pos = { lineNumber: 1, column: 12 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const voiceItem = (result?.suggestions || []).find(s => s.label === 'voice_alice_hello');
    expect(voiceItem).toBeDefined();
  });

  // TC-MC-04: Scoped dialogue string interpolation
  it('TC-MC-04: Suggests variables and typewriter tags when typing { inside dialogue string', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => ['playerName', 'playerScore'],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    const model = createMockModel('alice: "Xin chao {');
    const pos = { lineNumber: 1, column: 19 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const labels = (result?.suggestions || []).map(s => s.label);
    expect(labels).toContain('{playerName}');
    expect(labels).toContain('{pause:0.5s}');
    expect(labels).toContain('{speed:fast}');
    expect(labels).toContain('{color:#38bdf8}');
  });

  // TC-MC-05: Non-dialogue brace exclusion
  it('TC-MC-05: Does not suggest typewriter tags when typing { outside dialogue string', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => ['playerName'],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    const model = createMockModel('background "bg_{');
    const pos = { lineNumber: 1, column: 17 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const labels = (result?.suggestions || []).map(s => s.label);
    expect(labels).not.toContain('{pause:0.5s}');
    expect(labels).not.toContain('{speed:fast}');
  });

  // TC-MC-06: Monaco Hover Provider Zero-Trust
  it('TC-MC-06: Hover provider returns zero-trust Markdown card with character details', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () =>
        new Map([
          ['alice', { displayName: 'Alice Wonderland', sprites: new Set(['happy', 'sad']) }],
        ]),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedHoverProvider).not.toBeNull();

    const model = createMockModel('alice: "Hello!"');
    const pos = { lineNumber: 1, column: 3 } as monaco.Position;
    const hover = capturedHoverProvider!.provideHover(
      model,
      pos,
      dummyToken,
    ) as monaco.languages.Hover;

    expect(hover).toBeDefined();
    expect(hover.contents).toBeDefined();
    expect(hover.contents.length).toBeGreaterThan(0);
    const card = hover.contents[0] as monaco.IMarkdownString;
    expect(card.value).toContain('Alice Wonderland');
    expect(card.value).toContain('happy');
    expect(card.isTrusted).toBe(false);
    expect(card.supportHtml).toBe(false);
  });

  // TC-MC-07: Monaco Hover Asset details
  it('TC-MC-07: Hover provider displays asset details metadata including category, type, and size', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () =>
        new Map([['bg_classroom', { category: 'background', type: 'image', sizeBytes: 20480 }]]),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedHoverProvider).not.toBeNull();

    const model = createMockModel('background bg_classroom');
    const pos = { lineNumber: 1, column: 15 } as monaco.Position;
    const hover = capturedHoverProvider!.provideHover(
      model,
      pos,
      dummyToken,
    ) as monaco.languages.Hover;

    expect(hover).toBeDefined();
    const card = hover.contents[0] as monaco.IMarkdownString;
    expect(card.value).toContain('bg_classroom');
    expect(card.value).toContain('background');
    expect(card.value).toContain('image');
  });
});
