import { describe, it, expect } from 'vitest';
import type {
  Project,
  AssetRef,
  Character,
  VariableDeclaration,
  ScriptFile,
} from '@vn-engine/shared-types';
import {
  createVnsProjectContext,
  type SceneItem,
} from '../../src/core/services/vnsContextProvider';

function createMockProject(options?: {
  files?: Array<{ id: string; name: string; content: string; order: number; version: number }>;
  assets?: AssetRef[];
  characters?: Array<{ id: string; name: string; sprites?: Record<string, string> }>;
  variables?: Array<{ name: string }>;
}): Project {
  return {
    id: 'test-proj',
    title: 'Test Project',
    version: 1,
    ownerId: 'owner-1',
    defaultLanguage: 'vi',
    files: (options?.files as unknown as ScriptFile[]) || [],
    characters: (options?.characters as unknown as Character[]) || [],
    variables: (options?.variables as unknown as VariableDeclaration[]) || [],
    assets: options?.assets || [],
    uiScreens: [],
    customScripts: [],
  };
}

describe('VNS Project Context Provider (vnsContextProvider)', () => {
  // TC-CTX-01: Multi-file scene discovery
  it('TC-CTX-01: scans multiple files and extracts scene names with file and line', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file1',
          name: 'prologue.vns',
          content: 'scene intro {\n  "Welcome"\n}',
          order: 0,
          version: 1,
        },
        {
          id: 'file2',
          name: 'chapter1.vns',
          content: '// Heading\nscene classroom {\n  "Classroom"\n}',
          order: 1,
          version: 1,
        },
      ],
    });

    const context = createVnsProjectContext(() => project);
    const scenes = context.getScenes() as SceneItem[];

    expect(scenes).toHaveLength(2);
    expect(scenes.find(s => s.name === 'intro')).toEqual({
      name: 'intro',
      file: 'prologue.vns',
      line: 1,
    });
    expect(scenes.find(s => s.name === 'classroom')).toEqual({
      name: 'classroom',
      file: 'chapter1.vns',
      line: 2,
    });
  });

  // TC-CTX-02: Subscene qualification
  it('TC-CTX-02: qualifies subscenes with parent scene name according to ADR-015', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file1',
          name: 'act1.vns',
          content: 'scene intro {\n  scene .morning {\n    "Morning"\n  }\n}',
          order: 0,
          version: 1,
        },
      ],
    });

    const context = createVnsProjectContext(() => project);
    const scenes = context.getScenes() as SceneItem[];

    expect(scenes).toHaveLength(2);
    expect(scenes.find(s => s.name === 'intro')).toBeDefined();
    expect(scenes.find(s => s.name === 'intro.morning')).toEqual({
      name: 'intro.morning',
      file: 'act1.vns',
      line: 2,
    });
  });

  // TC-CTX-03: Ignore commented scenes
  it('TC-CTX-03: ignores single-line and multi-line commented scenes', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file1',
          name: 'story.vns',
          content: '// scene fake1 {\n/*\nscene fake2 {\n*/\nscene real_scene {\n  "Hi"\n}',
          order: 0,
          version: 1,
        },
      ],
    });

    const context = createVnsProjectContext(() => project);
    const scenes = context.getScenes() as SceneItem[];
    const names = scenes.map(s => s.name);

    expect(names).toContain('real_scene');
    expect(names).not.toContain('fake1');
    expect(names).not.toContain('fake2');
  });

  // TC-CTX-04: Content memoization
  it('TC-CTX-04: memoizes scenes per file when content does not change', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file1',
          name: 'story.vns',
          content: 'scene cached_scene {\n  "Hi"\n}',
          order: 0,
          version: 1,
        },
      ],
    });

    const context = createVnsProjectContext(() => project);
    const firstCall = context.getScenes();
    const secondCall = context.getScenes();

    expect(firstCall).toBe(secondCall);
  });

  // TC-CTX-05: Voice asset categorization
  it('TC-CTX-05: categorizes voice assets into a dedicated voices Set', () => {
    const project = createMockProject({
      assets: [
        {
          id: 'voice_alice_01',
          name: 'alice_01.mp3',
          type: 'audio',
          category: 'voice',
          storageUrl: '/voice/alice_01.mp3',
          sizeBytes: 1024,
        },
        {
          id: 'bgm_theme',
          name: 'theme.mp3',
          type: 'audio',
          category: 'bgm',
          storageUrl: '/bgm/theme.mp3',
          sizeBytes: 5120,
        },
      ],
    });

    const context = createVnsProjectContext(() => project);
    const assets = context.getAssets();

    expect(assets.voices).toBeDefined();
    expect(assets.voices?.has('voice_alice_01')).toBe(true);
    expect(assets.audio.has('bgm_theme')).toBe(true);
  });

  // TC-CTX-06: Asset details metadata
  it('TC-CTX-06: provides asset details map with category, type, and size', () => {
    const project = createMockProject({
      assets: [
        {
          id: 'bg_classroom',
          name: 'classroom.png',
          type: 'image',
          category: 'background',
          storageUrl: '/img/classroom.png',
          sizeBytes: 20480,
        },
      ],
    });

    const context = createVnsProjectContext(() => project);
    expect(typeof context.getAssetDetails).toBe('function');
    const details = context.getAssetDetails?.();
    expect(details?.get('bg_classroom')).toEqual({
      category: 'background',
      type: 'image',
      sizeBytes: 20480,
    });
  });
});
