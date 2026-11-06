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

  // TC-RECON-03: background with arguments or transition
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

  // TC-RECON-05: Dialogue alice: "Xin chào" does NOT flag uncreated character warning for speakers
  it('TC-RECON-05: should NOT record uncreated character for dialogue lines alice: "Xin chào" or bob: "Chào bạn"', () => {
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

    // Dialogue speakers do not require visual definitions in CharacterManager
    expect(report.uncreatedCharacters).not.toContain('alice');
    expect(report.uncreatedCharacters).not.toContain('bob');

    const diagnostics = generateDiagnostics(project);
    const bobDiags = diagnostics.filter(
      (d) => d.category === 'character' && d.assetKey === 'bob'
    );
    expect(bobDiags).toHaveLength(0);
  });

  // TC-RECON-06: Dialogue with as-alias alice as "???": "Xin chào" does NOT flag uncreated character
  it('TC-RECON-06: should NOT record uncreated character for dialogue with as-alias (alice as "???": "Xin chào")', () => {
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

    expect(report.characterReferences['???']).toBeUndefined();
    expect(report.uncreatedCharacters).not.toContain('alice');
    expect(report.uncreatedCharacters).not.toContain('charlie');

    const diagnostics = generateDiagnostics(project);
    const charlieDiags = diagnostics.filter(
      (d) => d.category === 'character' && d.assetKey === 'charlie'
    );
    expect(charlieDiags).toHaveLength(0);
  });

  // TC-RECON-07: reveal statement reveal bob as "Thám tử" does NOT flag uncreated character
  it('TC-RECON-07: should NOT record uncreated character for reveal statement (reveal bob as "Thám tử")', () => {
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

    expect(report.uncreatedCharacters).not.toContain('bob');

    const diagnostics = generateDiagnostics(project);
    const bobDiags = diagnostics.filter(
      (d) => d.category === 'character' && d.assetKey === 'bob'
    );
    expect(bobDiags).toHaveLength(0);
  });

  // TC-RECON-SHOW: show statement with uncreated character flags uncreated character
  it('TC-RECON-SHOW: should record uncreated character and generate warning for show statement', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'show_test.vns',
          content: [
            'scene visual_scene {',
            '  show charlie.happy',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.characterReferences['charlie']).toEqual([
      { file: 'show_test.vns', line: 2, type: 'character' },
    ]);
    expect(report.uncreatedCharacters).toContain('charlie');

    const diagnostics = generateDiagnostics(project);
    const charlieDiags = diagnostics.filter(
      (d) => d.category === 'character' && d.assetKey === 'charlie'
    );
    expect(charlieDiags).toHaveLength(1);
    expect(charlieDiags[0].severity).toBe('warning');
  });

  // TC-RECON-HIDE: hide statement with uncreated character flags uncreated character
  it('TC-RECON-HIDE: should record uncreated character and generate warning for hide statement', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'hide_test.vns',
          content: [
            'scene visual_scene {',
            '  hide dave',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      characters: [],
    });

    const report = scanActiveReconciliation(project);

    expect(report.characterReferences['dave']).toEqual([
      { file: 'hide_test.vns', line: 2, type: 'character' },
    ]);
    expect(report.uncreatedCharacters).toContain('dave');

    const diagnostics = generateDiagnostics(project);
    const daveDiags = diagnostics.filter(
      (d) => d.category === 'character' && d.assetKey === 'dave'
    );
    expect(daveDiags).toHaveLength(1);
    expect(daveDiags[0].severity).toBe('warning');
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
            '     show alice.smile',
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

  // TC-UNUSED-01: generateDiagnostics produces info diagnostic for unused assets
  it('TC-UNUSED-01: should generate info diagnostic for unused assets in project.assets', () => {
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
      characters: [],
      assets: [
        {
          id: 'bg_park',
          name: 'bg_park.png',
          type: 'image',
          storageUrl: '/assets/bg_park.png',
          sizeBytes: 1024,
        },
      ],
    });

    const diagnostics = generateDiagnostics(project);
    const unusedDiag = diagnostics.find(
      (d) => d.category === 'asset' && d.assetKey === 'bg_park.png'
    );

    expect(unusedDiag).toBeDefined();
    expect(unusedDiag?.severity).toBe('info');
    expect(unusedDiag?.message).toEqual(
      expect.stringContaining('Unused asset')
    );
    expect(unusedDiag?.message).toEqual(
      expect.stringContaining('bg_park.png')
    );
  });

  // TC-UNUSED-02: generateDiagnostics does NOT produce unused asset diagnostic for referenced assets
  it('TC-UNUSED-02: should NOT generate unused asset diagnostic when asset is referenced in script via background or play music', () => {
    const project = createMockProject({
      files: [
        {
          id: 'file-1',
          name: 'main.vns',
          content: [
            'scene park {',
            '  background bg_park',
            '  play music bgm_relax',
            '}',
          ].join('\n'),
          order: 0,
          version: 1,
        },
      ],
      assets: [
        {
          id: 'bg_park',
          name: 'bg_park.png',
          type: 'image',
          storageUrl: '/assets/bg_park.png',
          sizeBytes: 1024,
        },
        {
          id: 'bgm_relax',
          name: 'bgm_relax.mp3',
          type: 'audio',
          storageUrl: '/assets/bgm_relax.mp3',
          sizeBytes: 2048,
        },
      ],
    });

    const diagnostics = generateDiagnostics(project);
    const unusedDiags = diagnostics.filter(
      (d) =>
        d.category === 'asset' &&
        d.severity === 'info' &&
        (d.assetKey === 'bg_park.png' ||
          d.assetKey === 'bgm_relax.mp3' ||
          d.assetKey === 'bg_park' ||
          d.assetKey === 'bgm_relax')
    );

    expect(unusedDiags).toHaveLength(0);
  });
});
