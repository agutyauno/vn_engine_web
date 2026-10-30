// apps/editor/tests/reconciliation.test.ts
import { describe, it, expect } from 'vitest';
import type { Project, ScriptFile, Character, AssetRef } from '@vn-engine/shared-types';
import {
  scanActiveReconciliation,
  generateDiagnostics,
} from '../src/core/services/reconciliation';

function createMockProject(options?: {
  files?: ScriptFile[];
  characters?: Character[];
  assets?: AssetRef[];
}): Project {
  return {
    id: 'test-proj-id',
    title: 'Test Project',
    version: 1,
    ownerId: 'owner-1',
    defaultLanguage: 'vi',
    files: options?.files ?? [],
    characters: options?.characters ?? [],
    assets: options?.assets ?? [],
    variables: [],
    uiScreens: [],
    customScripts: [],
  };
}

describe('Reconciliation Service (DSL 1.1.0 Syntax & Accurate Diagnostics)', () => {
  // TC-RECON-01: scene intro { or scene .c1 { MUST NOT be recognized as background assets
  it('TC-RECON-01: should NOT record scene declarations (e.g. scene intro {, scene .c1 {) as background assets', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'main.vns',
          content: [
            'scene intro {',
            '  alice: "Xin chào thế giới!"',
            '}',
            'scene .c1 {',
            '  alice: "Nhánh con c1"',
            '}',
            'scene ending {',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [{ id: 'alice', name: 'Alice', sprites: {} }],
      assets: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.assetReferences['intro']).toBeUndefined();
    expect(report.assetReferences['.c1']).toBeUndefined();
    expect(report.assetReferences['ending']).toBeUndefined();

    expect(report.uncreatedAssets).not.toContain('intro');
    expect(report.uncreatedAssets).not.toContain('.c1');
    expect(report.uncreatedAssets).not.toContain('ending');

    const diagnostics = generateDiagnostics(project);
    const sceneAssetDiags = diagnostics.filter(
      (d) => d.category === 'asset' && ['intro', '.c1', 'ending'].includes(d.assetKey ?? '')
    );
    expect(sceneAssetDiags).toHaveLength(0);
  });

  // TC-RECON-02: background bg_room records background asset reference for 'bg_room'
  it('TC-RECON-02: should record background asset reference for plain background statements', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'chapter1.vns',
          content: [
            'scene classroom {',
            '  background bg_room',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      assets: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.assetReferences['bg_room']).toBeDefined();
    expect(report.assetReferences['bg_room']).toEqual([
      { file: 'chapter1.vns', line: 2, type: 'background' },
    ]);
    expect(report.uncreatedAssets).toContain('bg_room');
  });

  // TC-RECON-03: background with arguments or transition:
  it('TC-RECON-03: should record background asset reference when background has arguments or transition', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'chapter1.vns',
          content: [
            'scene intro {',
            '  background bg_rooftop(position: "center", transition: "fade")',
            '  background bg_sunset transition: "dissolve"',
            '  background bg_night (scale: 1.2)',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      assets: [
        {
          id: 'bg_rooftop',
          name: 'bg_rooftop.png',
          type: 'image',
          storageUrl: '/assets/bg_rooftop.png',
          sizeBytes: 1024,
        },
      ],
    });

    const report = scanActiveReconciliation(project);

    expect(report.assetReferences['bg_rooftop']).toEqual([
      { file: 'chapter1.vns', line: 2, type: 'background' },
    ]);
    expect(report.assetReferences['bg_sunset']).toEqual([
      { file: 'chapter1.vns', line: 3, type: 'background' },
    ]);
    expect(report.assetReferences['bg_night']).toEqual([
      { file: 'chapter1.vns', line: 4, type: 'background' },
    ]);

    expect(report.uncreatedAssets).not.toContain('bg_rooftop');
    expect(report.uncreatedAssets).toContain('bg_sunset');
    expect(report.uncreatedAssets).toContain('bg_night');
  });

  // TC-RECON-04: play music, play sound, play voice, play bgs
  it('TC-RECON-04: should record audio asset reference for play music, sound, voice, and bgs statements', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'audio_test.vns',
          content: [
            'scene audio_scene {',
            '  play music bgm_theme',
            '  play sound sfx_click',
            '  play voice voice_ch1_01',
            '  play bgs ambient_rain',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      assets: [
        {
          id: 'bgm_theme',
          name: 'bgm_theme.mp3',
          type: 'audio',
          storageUrl: '/assets/bgm_theme.mp3',
          sizeBytes: 5000,
        },
      ],
    });

    const report = scanActiveReconciliation(project);

    expect(report.assetReferences['bgm_theme']).toEqual([
      { file: 'audio_test.vns', line: 2, type: 'audio' },
    ]);
    expect(report.assetReferences['sfx_click']).toEqual([
      { file: 'audio_test.vns', line: 3, type: 'audio' },
    ]);
    expect(report.assetReferences['voice_ch1_01']).toEqual([
      { file: 'audio_test.vns', line: 4, type: 'audio' },
    ]);
    expect(report.assetReferences['ambient_rain']).toEqual([
      { file: 'audio_test.vns', line: 5, type: 'audio' },
    ]);

    expect(report.uncreatedAssets).not.toContain('bgm_theme');
    expect(report.uncreatedAssets).toContain('sfx_click');
    expect(report.uncreatedAssets).toContain('voice_ch1_01');
    expect(report.uncreatedAssets).toContain('ambient_rain');
  });

  // TC-RECON-05: Dialogue alice: "Xin chào" records character reference for 'alice'
  it('TC-RECON-05: should record character reference for dialogue lines alice: "Xin chào"', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'dialogue.vns',
          content: [
            'scene greeting {',
            '  alice: "Xin chào, tôi là Alice!"',
            '  bob: "Chào bạn, tôi là Bob."',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [{ id: 'alice', name: 'Alice', sprites: {} }],
    });

    const report = scanActiveReconciliation(project);

    expect(report.characterReferences['alice']).toEqual([
      { file: 'dialogue.vns', line: 2, type: 'character' },
    ]);
    expect(report.characterReferences['bob']).toEqual([
      { file: 'dialogue.vns', line: 3, type: 'character' },
    ]);

    expect(report.uncreatedCharacters).not.toContain('alice');
    expect(report.uncreatedCharacters).toContain('bob');
  });

  // TC-RECON-06: Dialogue with as-alias alice as "???": "Xin chào"
  it('TC-RECON-06: should record character reference for dialogue with as-alias (alice as "???": "Xin chào")', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'alias.vns',
          content: [
            'scene mystery {',
            '  alice as "???": "Ai đó đang nhìn chúng ta."',
            '  charlie as "Người lạ mặt": "Chính là tôi!"',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [{ id: 'alice', name: 'Alice', sprites: {} }],
    });

    const report = scanActiveReconciliation(project);

    expect(report.characterReferences['alice']).toEqual([
      { file: 'alias.vns', line: 2, type: 'character' },
    ]);
    expect(report.characterReferences['charlie']).toEqual([
      { file: 'alias.vns', line: 3, type: 'character' },
    ]);

    expect(report.characterReferences['???']).toBeUndefined();
    expect(report.uncreatedCharacters).not.toContain('alice');
    expect(report.uncreatedCharacters).toContain('charlie');
  });

  // TC-RECON-07: reveal statement reveal bob as "Thám tử"
  it('TC-RECON-07: should record character reference for reveal statement (reveal bob as "Thám tử")', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'reveal.vns',
          content: [
            'scene reveal_scene {',
            '  reveal bob as "Thám tử tư"',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.characterReferences['bob']).toEqual([
      { file: 'reveal.vns', line: 2, type: 'character' },
    ]);
    expect(report.uncreatedCharacters).toContain('bob');
  });

  // TC-RECON-08: narrator: "Trời mưa..." does NOT flag narrator as uncreated character
  it('TC-RECON-08: should NOT consider narrator dialogue as an uncreated character', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'narrator.vns',
          content: [
            'scene story {',
            '  narrator: "Trời mưa rả rích bên ngoài cửa sổ."',
            '  narrator as "Người dẫn": "Đêm buông xuống."',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.uncreatedCharacters).not.toContain('narrator');

    const diagnostics = generateDiagnostics(project);
    const narratorDiags = diagnostics.filter(
      (d) => d.category === 'character' && d.assetKey === 'narrator'
    );
    expect(narratorDiags).toHaveLength(0);
  });

  // Comments and indentation edge case
  it('should ignore commented-out statements and handle leading/trailing indentation', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'indented.vns',
          content: [
            '# background bg_commented',
            '// play music bgm_commented',
            '   background bg_indented',
            '     alice: "Thụt đầu dòng"',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.assetReferences['bg_commented']).toBeUndefined();
    expect(report.assetReferences['bgm_commented']).toBeUndefined();
    expect(report.assetReferences['bg_indented']).toBeDefined();
    expect(report.characterReferences['alice']).toBeDefined();
  });

  // Unused assets detection
  it('should accurately detect unused assets in project.assets', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'main.vns',
          content: 'background bg_used\n',
          order: 0,
          version: 1,
        },
      ],
      assets: [
        {
          id: 'bg_used',
          name: 'bg_used.png',
          type: 'image',
          storageUrl: '/assets/bg_used.png',
          sizeBytes: 100,
        },
        {
          id: 'bg_unused',
          name: 'bg_unused.png',
          type: 'image',
          storageUrl: '/assets/bg_unused.png',
          sizeBytes: 100,
        },
      ],
    });

    const report = scanActiveReconciliation(project);
    expect(report.unusedAssets).toContain('bg_unused.png');
    expect(report.unusedAssets).not.toContain('bg_used.png');
  });
});
