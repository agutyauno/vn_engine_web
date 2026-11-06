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

  // =========================================================================
  // Phase 1: Choice & Conditional Expressions Autocomplete (TDD RED)
  // =========================================================================

  // TC-AUTO-CHOICE-01: Choice item snippet when cursor in choice block
  it('TC-AUTO-CHOICE-01: Suggests choice branch snippet when cursor is inside choice block', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [{ name: 'scene_next', file: 'main.vns', line: 10 }],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    const model = createMockModel('choice {\n  \n}');
    const pos = { lineNumber: 2, column: 3 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const suggestions = result?.suggestions || [];
    const choiceGoto = suggestions.find(
      s =>
        s.label === '"Choice": goto target' || s.label === '"${1:Choice}": goto ${2:target_scene}',
    );
    const choiceCall = suggestions.find(
      s =>
        s.label === '"Choice": call target' || s.label === '"${1:Choice}": call ${2:target_scene}',
    );

    expect(choiceGoto).toBeDefined();
    expect(choiceCall).toBeDefined();
    expect(choiceGoto?.kind).toBe(monaco.languages.CompletionItemKind.Snippet);
    expect(choiceCall?.kind).toBe(monaco.languages.CompletionItemKind.Snippet);
    expect(choiceGoto?.insertText).toContain('goto');
    expect(choiceCall?.insertText).toContain('call');
  });

  // TC-AUTO-CHOICE-02: Choice branch jump goto/call and target scenes
  it('TC-AUTO-CHOICE-02: Suggests branch jump actions (goto/call) after option colon and target scenes after goto', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [{ name: 'scene_good_end', file: 'endings.vns', line: 42 }],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    // Trường hợp 1: Model dòng '"Option 1": ' (dòng 1, cột 13)
    const model1 = createMockModel('"Option 1": ');
    const pos1 = { lineNumber: 1, column: 13 } as monaco.Position;
    const result1 = capturedCompletionProvider!.provideCompletionItems(
      model1,
      pos1,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const labels1 = (result1?.suggestions || []).map(s => s.label);
    expect(labels1).toContain('goto');
    expect(labels1).toContain('call');
    const gotoItem = (result1?.suggestions || []).find(s => s.label === 'goto');
    const callItem = (result1?.suggestions || []).find(s => s.label === 'call');
    expect(gotoItem?.sortText).toMatch(/^00_/);
    expect(callItem?.sortText).toMatch(/^00_/);

    // Trường hợp 2: Model dòng '"Option 1": goto ' (dòng 1, cột 18) với context có scene scene_good_end
    const model2 = createMockModel('"Option 1": goto ');
    const pos2 = { lineNumber: 1, column: 18 } as monaco.Position;
    const result2 = capturedCompletionProvider!.provideCompletionItems(
      model2,
      pos2,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const sceneItem = (result2?.suggestions || []).find(s => s.label === 'scene_good_end');
    expect(sceneItem).toBeDefined();
    expect(sceneItem?.sortText).toMatch(/^00_/);
  });

  // TC-AUTO-COND-01: Condition variables and boolean literals in if/while
  it('TC-AUTO-COND-01: Suggests script variables and boolean literals in if and while conditions', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => ['gold', 'hasKey', 'affinity'],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    // Trường hợp 1: Model 'if ' (dòng 1, cột 4)
    const modelIf = createMockModel('if ');
    const posIf = { lineNumber: 1, column: 4 } as monaco.Position;
    const resultIf = capturedCompletionProvider!.provideCompletionItems(
      modelIf,
      posIf,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const labelsIf = (resultIf?.suggestions || []).map(s => s.label);
    expect(labelsIf).toContain('gold');
    expect(labelsIf).toContain('hasKey');
    expect(labelsIf).toContain('affinity');
    expect(labelsIf).toContain('true');
    expect(labelsIf).toContain('false');

    // Trường hợp 2: Model 'while (' (dòng 1, cột 8)
    const modelWhile = createMockModel('while (');
    const posWhile = { lineNumber: 1, column: 8 } as monaco.Position;
    const resultWhile = capturedCompletionProvider!.provideCompletionItems(
      modelWhile,
      posWhile,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const labelsWhile = (resultWhile?.suggestions || []).map(s => s.label);
    expect(labelsWhile).toContain('gold');
    expect(labelsWhile).toContain('hasKey');
    expect(labelsWhile).toContain('affinity');
  });

  // TC-AUTO-ASSIGN-01: Assignment RHS variables
  it('TC-AUTO-ASSIGN-01: Suggests script variables and boolean literals on assignment right-hand side', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => ['gold', 'bonus'],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    // Model '~ gold = ' (dòng 1, cột 10)
    const modelAssign = createMockModel('~ gold = ');
    const posAssign = { lineNumber: 1, column: 10 } as monaco.Position;
    const resultAssign = capturedCompletionProvider!.provideCompletionItems(
      modelAssign,
      posAssign,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const labelsAssign = (resultAssign?.suggestions || []).map(s => s.label);
    expect(labelsAssign).toContain('gold');
    expect(labelsAssign).toContain('bonus');
    expect(labelsAssign).toContain('true');
    expect(labelsAssign).toContain('false');
  });

  // =========================================================================
  // Phase 2: Sub-scenes Relative & Canonical Completion (TDD RED)
  // =========================================================================

  // TC-AUTO-SUBSCENE-01: Relative Subscene Jump
  it('TC-AUTO-SUBSCENE-01: Suggests relative subscene targets starting with dot when typing goto . or call .', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [{ name: 'chapter1.intro', file: 'act1.vns', line: 15 }],
      getCharacters: () => new Map(),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    // Trường hợp 1: Model 'goto .' (dòng 1, cột 7)
    const modelGoto = createMockModel('goto .');
    const posGoto = { lineNumber: 1, column: 7 } as monaco.Position;
    const resultGoto = capturedCompletionProvider!.provideCompletionItems(
      modelGoto,
      posGoto,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const gotoSuggestions = resultGoto?.suggestions || [];
    const subsceneItem = gotoSuggestions.find(
      s => s.label === '.intro' || s.insertText === '.intro',
    );
    expect(subsceneItem).toBeDefined();
    expect(subsceneItem?.insertText).toBe('.intro');
    expect(subsceneItem?.sortText).toMatch(/^00_/);

    // Trường hợp 2: Model 'call .' (dòng 1, cột 7)
    const modelCall = createMockModel('call .');
    const posCall = { lineNumber: 1, column: 7 } as monaco.Position;
    const resultCall = capturedCompletionProvider!.provideCompletionItems(
      modelCall,
      posCall,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const callSuggestions = resultCall?.suggestions || [];
    const subsceneCallItem = callSuggestions.find(
      s => s.label === '.intro' || s.insertText === '.intro',
    );
    expect(subsceneCallItem).toBeDefined();
    expect(subsceneCallItem?.insertText).toBe('.intro');
    expect(subsceneCallItem?.sortText).toMatch(/^00_/);
  });

  // TC-AUTO-SUBSCENE-02: Subscene Definition Snippet
  it('TC-AUTO-SUBSCENE-02: Suggests subscene declaration snippet when typing scene .', () => {
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
    expect(capturedCompletionProvider).not.toBeNull();

    // Model 'scene .' (dòng 1, cột 8)
    const modelScene = createMockModel('scene .');
    const posScene = { lineNumber: 1, column: 8 } as monaco.Position;
    const resultScene = capturedCompletionProvider!.provideCompletionItems(
      modelScene,
      posScene,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const suggestions = resultScene?.suggestions || [];
    const subsceneSnippet = suggestions.find(
      s =>
        (typeof s.label === 'string' && s.label.includes('scene .')) ||
        (typeof s.label === 'object' && s.label.label.includes('scene .')) ||
        s.insertText?.includes('scene .'),
    );

    expect(subsceneSnippet).toBeDefined();
    expect(subsceneSnippet?.kind).toBe(monaco.languages.CompletionItemKind.Snippet);
    expect(subsceneSnippet?.insertText).toBe('scene .${1:subname} {\n\t$0\n}');
  });

  // =========================================================================
  // Phase 3: Comprehensive Typewriter Tags & Character Colors (TDD RED)
  // =========================================================================

  // TC-AUTO-TYPEWRITER-01: Comprehensive Typewriter Control Tags
  it('TC-AUTO-TYPEWRITER-01: Suggests comprehensive typewriter rhythm, speed, and color control tags when typing { inside dialogue', () => {
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
    expect(capturedCompletionProvider).not.toBeNull();

    const model = createMockModel('alice: "Hello {');
    const pos = { lineNumber: 1, column: 16 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const suggestions = result?.suggestions || [];
    const labels = suggestions.map(s => (typeof s.label === 'string' ? s.label : s.label.label));

    const expectedTags = [
      '{pause:300ms}',
      '{wait:1.0s}',
      '{speed:slow}',
      '{speed:normal}',
      '{speed:2.0}',
      '{color:default}',
      '{color:reset}',
      '{/color}',
    ];

    for (const tag of expectedTags) {
      expect(labels).toContain(tag);
      const item = suggestions.find(
        s => (typeof s.label === 'string' ? s.label : s.label.label) === tag,
      );
      expect(item).toBeDefined();
      expect(item?.kind).toBe(monaco.languages.CompletionItemKind.Snippet);
    }
  });

  // TC-AUTO-TYPEWRITER-02: Character Color Tags
  it('TC-AUTO-TYPEWRITER-02: Suggests character specific color tag with character documentation when typing { inside dialogue', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () =>
        new Map([
          [
            'alice',
            {
              displayName: 'Alice Carroll',
              colorHex: '#e91e63',
              sprites: new Set(),
            },
          ],
        ]),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    const model = createMockModel('alice: "Story {');
    const pos = { lineNumber: 1, column: 16 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const suggestions = result?.suggestions || [];
    const colorTag = suggestions.find(
      s =>
        (typeof s.label === 'string' ? s.label : s.label.label) === '{color:#e91e63}' ||
        s.insertText === '{color:#e91e63}',
    );

    expect(colorTag).toBeDefined();
    expect(colorTag?.kind).toBe(monaco.languages.CompletionItemKind.Snippet);

    const docOrDetail = `${colorTag?.detail ?? ''} ${
      typeof colorTag?.documentation === 'object'
        ? (colorTag?.documentation as monaco.IMarkdownString).value
        : (colorTag?.documentation ?? '')
    }`;

    expect(
      docOrDetail.toLowerCase().includes('alice carroll') ||
        docOrDetail.toLowerCase().includes('alice'),
    ).toBe(true);
  });

  // =========================================================================
  // Phase 4: Audio Stop Channels & Unified Ranking (TDD RED)
  // =========================================================================

  // TC-AUTO-STOP-01: Audio Stop Channels Completion
  it('TC-AUTO-STOP-01: Suggests audio channels (music, sound, voice, all) with fade_out parameters when typing stop keyword', () => {
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
    expect(capturedCompletionProvider).not.toBeNull();

    // Model: 'stop ' (dòng 1, cột 6)
    const model = createMockModel('stop ');
    const pos = { lineNumber: 1, column: 6 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const suggestions = result?.suggestions || [];
    const getLabel = (s: monaco.languages.CompletionItem) =>
      typeof s.label === 'string' ? s.label : s.label.label;

    const musicItem = suggestions.find(s => getLabel(s) === 'music');
    const soundItem = suggestions.find(s => getLabel(s) === 'sound');
    const voiceItem = suggestions.find(s => getLabel(s) === 'voice');
    const allItem = suggestions.find(s => getLabel(s) === 'all');

    expect(musicItem).toBeDefined();
    expect(soundItem).toBeDefined();
    expect(voiceItem).toBeDefined();
    expect(allItem).toBeDefined();

    // Kiểm tra sortText của mỗi kênh đều khớp /^00_/ (Direct Context Target)
    expect(musicItem?.sortText).toMatch(/^00_/);
    expect(soundItem?.sortText).toMatch(/^00_/);
    expect(voiceItem?.sortText).toMatch(/^00_/);
    expect(allItem?.sortText).toMatch(/^00_/);

    // Kiểm tra insertText của music và all chứa fade_out:
    expect(musicItem?.insertText).toContain('fade_out:');
    expect(allItem?.insertText).toContain('fade_out:');
  });

  // TC-AUTO-RANKING-01: Unified SortText Hierarchy
  it('TC-AUTO-RANKING-01: Enforces unified sortText ranking hierarchy across statements, dialogue, media, and control flow', () => {
    const mockContext: VnsProjectContext = {
      getFiles: () => ({}),
      getScenes: () => [],
      getCharacters: () =>
        new Map([
          [
            'alice',
            {
              displayName: 'Alice Wonderland',
              sprites: new Set(['happy']),
            },
          ],
        ]),
      getAssets: () => ({ backgrounds: new Set(), audio: new Set(), voices: new Set() }),
      getAssetDetails: () => new Map(),
      getVariables: () => [],
      switchActiveFile: () => {},
    };

    registerVnsLanguageFeatures(mockContext);
    expect(capturedCompletionProvider).not.toBeNull();

    // Model với dòng trống "" (dòng 1, cột 1) và context có nhân vật alice
    const model = createMockModel('');
    const pos = { lineNumber: 1, column: 1 } as monaco.Position;
    const result = capturedCompletionProvider!.provideCompletionItems(
      model,
      pos,
      dummyContext,
      dummyToken,
    ) as monaco.languages.CompletionList;

    const suggestions = result?.suggestions || [];
    const getLabel = (s: monaco.languages.CompletionItem) =>
      typeof s.label === 'string' ? s.label : s.label.label;

    // 01_...: Primary statements (scene, show, background, choice, hide)
    const sceneItem = suggestions.find(s => getLabel(s) === 'scene');
    const showItem = suggestions.find(s => getLabel(s) === 'show');
    expect(sceneItem).toBeDefined();
    expect(sceneItem?.sortText).toMatch(/^01_/);
    if (showItem) {
      expect(showItem.sortText).toMatch(/^01_/);
    }

    // 02_...: Character dialogue lines (alice: "...", narrator: "...")
    const aliceDialogueItem = suggestions.find(s => getLabel(s) === 'alice: "..."');
    const narratorDialogueItem = suggestions.find(s => getLabel(s) === 'narrator: "..."');
    expect(aliceDialogueItem).toBeDefined();
    expect(aliceDialogueItem?.sortText).toMatch(/^02_/);
    expect(narratorDialogueItem).toBeDefined();
    expect(narratorDialogueItem?.sortText).toMatch(/^02_/);

    // 03_...: Media and audio commands (play music, stop, input, wait, inspect)
    const playMusicItem = suggestions.find(s => getLabel(s) === 'play music');
    const stopItem = suggestions.find(s => getLabel(s) === 'stop');
    const inputItem = suggestions.find(s => getLabel(s) === 'input');
    expect(playMusicItem).toBeDefined();
    expect(playMusicItem?.sortText).toMatch(/^03_/);
    expect(stopItem).toBeDefined();
    expect(stopItem?.sortText).toMatch(/^03_/);
    expect(inputItem).toBeDefined();
    expect(inputItem?.sortText).toMatch(/^03_/);

    // 04_...: Control flow & general keywords (if, while, else, define, reveal, return, end)
    const ifItem = suggestions.find(s => getLabel(s) === 'if');
    const whileItem = suggestions.find(s => getLabel(s) === 'while');
    expect(ifItem).toBeDefined();
    expect(ifItem?.sortText).toMatch(/^04_/);
    expect(whileItem).toBeDefined();
    expect(whileItem?.sortText).toMatch(/^04_/);
  });
});
