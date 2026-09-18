import { describe, it, expect } from 'vitest';
import type { Project, Instruction, VMState, VMSnapshot } from '../src';

describe('Shared Types & Data Contracts', () => {
  it('should instantiate a valid Project schema and serialize to JSON pure', () => {
    const project: Project = {
      id: '11111111-2222-3333-4444-555555555555',
      title: 'Học Viện Mùa Hạ',
      version: 1,
      ownerId: 'user-uuid-123',
      defaultLanguage: 'vi',
      publishedGameId: 'game-slug-456',
      files: [
        {
          id: 'file-1',
          name: 'chapter1.vns',
          content: 'scene start { alice: "Chào bạn!" }',
          order: 0,
          version: 1,
        },
      ],
      characters: [
        {
          id: 'alice',
          name: 'Alice Carroll',
          colorHex: '#e91e63',
          sprites: { happy: 'asset-img-1', sad: 'asset-img-2' },
        },
      ],
      variables: [
        {
          name: 'affection',
          type: 'number',
          defaultValue: 0,
        },
      ],
      assets: [
        {
          id: 'asset-img-1',
          name: 'alice_happy.png',
          type: 'image',
          storageUrl: 'https://assets.example.com/alice_happy.png',
          sizeBytes: 102400,
        },
      ],
      uiScreens: [],
      customScripts: [],
    };

    // Serialize to JSON and parse back
    const jsonString = JSON.stringify(project);
    const parsed = JSON.parse(jsonString) as Project;

    expect(parsed.id).toBe(project.id);
    expect(parsed.title).toBe('Học Viện Mùa Hạ');
    expect(parsed.publishedGameId).toBe('game-slug-456');
    expect(parsed.characters[0]?.name).toBe('Alice Carroll');
    expect(parsed.files[0]?.content).toContain('scene start');
  });

  it('should support the standardized instruction set (ADR-021)', () => {
    const instructions: Instruction[] = [
      {
        type: 'BACKGROUND',
        assetId: 'bg_classroom',
        transition: 'fade',
        loc: { fileId: 'file-1', line: 10, col: 5 },
      },
      {
        type: 'SHOW',
        character: 'alice',
        sprite: 'happy',
        position: 'center',
        loc: { fileId: 'file-1', line: 11, col: 5 },
      },
      {
        type: 'PLAY',
        channel: 'music',
        assetId: 'bgm_peaceful',
        volume: 0.8,
        loop: true,
      },
      {
        type: 'DIALOGUE',
        character: 'alice',
        displayNameOverride: '???',
        text: 'Cậu là ai vậy?',
      },
      {
        type: 'REVEAL',
        characterId: 'alice',
        displayName: 'Alice',
      },
      {
        type: 'CHOICE',
        choices: [
          { text: 'Chào Alice', targetScene: 'alice_greet' },
          { text: 'Im lặng', targetScene: 'stay_silent' },
        ],
      },
      {
        type: 'GOTO',
        targetScene: 'chapter1_end',
      },
      {
        type: 'SCENE',
        name: 'chapter1_end',
      },
      {
        type: 'RETURN',
      },
    ];

    expect(instructions).toHaveLength(9);
    expect(instructions[0]?.type).toBe('BACKGROUND');
    expect(instructions[3]?.type).toBe('DIALOGUE');
    if (instructions[3]?.type === 'DIALOGUE') {
      expect(instructions[3].displayNameOverride).toBe('???');
    }
  });

  it('should serialize VMState and VMSnapshot properly', () => {
    const state: VMState = {
      currentScene: 'chapter1_scene1',
      instructionPointer: 5,
      callStack: [{ scene: 'main', ip: 2 }],
      variables: { affection: 20, isMet: true, playerName: 'Khang' },
      characterDisplayOverrides: { alice: 'Alice' },
      customScriptState: {},
    };

    const snapshot: VMSnapshot = {
      timestamp: Date.now(),
      dialogueIndex: 3,
      state,
    };

    const serialized = JSON.stringify(snapshot);
    const restored = JSON.parse(serialized) as VMSnapshot;

    expect(restored.dialogueIndex).toBe(3);
    expect(restored.state.variables['affection']).toBe(20);
    expect(restored.state.variables['playerName']).toBe('Khang');
    expect(restored.state.characterDisplayOverrides['alice']).toBe('Alice');
  });
});
