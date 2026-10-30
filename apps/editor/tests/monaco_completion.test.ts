// apps/editor/tests/monaco_completion.test.ts
import { describe, it, expect } from 'vitest';
import type { Project, AssetRef } from '@vn-engine/shared-types';
import { createVnsProjectContext } from '../src/core/services/vnsContextProvider';

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
    characters: (options?.characters as any) || [],
    variables: (options?.variables as any) || [],
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
