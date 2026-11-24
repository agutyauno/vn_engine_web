// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type {
  Project,
  Instruction,
  PublishedGameBundle,
  AssetRef,
  ProjectTitleSettings,
} from '@vn-engine/shared-types';
import { PUBLISHED_BUNDLE_FORMAT_VERSION } from '@vn-engine/shared-types';
import {
  resolveEntrySceneName,
  buildPublishedGameZip,
} from '../../src/core/services/publishedBundle';

function createMockProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-published-unit-test',
    title: 'Test Visual Novel Project',
    version: 1,
    ownerId: 'user-unit-test',
    defaultLanguage: 'vi',
    updatedAt: 1700000000000,
    files: [],
    variables: [],
    assets: [],
    uiScreens: [],
    customScripts: [],
    displaySettings: {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      lockAspectRatio: true,
    },
    ...overrides,
  };
}

describe('L3 Unit Tests: publishedBundle service', () => {
  // ========================================================================
  // 1. resolveEntrySceneName
  // ========================================================================
  describe('resolveEntrySceneName', () => {
    it('resolves entryScene pointing to file with comments before scene declaration', () => {
      const project = createMockProject({
        entryScene: 'main.vns',
        files: [
          {
            id: 'f-main',
            name: 'main.vns',
            content: `// Main entry script
/* Multi-line header comments
   describing the visual novel setup */
scene start {
  "Teacher" "Welcome to class!"
}

scene chapter1 {
  "Teacher" "Starting chapter 1"
}
`,
            order: 0,
            version: 1,
          },
        ],
      });

      const program: Instruction[] = [
        { type: 'SCENE', name: 'start' },
        { type: 'DIALOGUE', character: 'Teacher', text: 'Welcome to class!' },
        { type: 'SCENE', name: 'chapter1' },
      ];

      const resolved = resolveEntrySceneName(project, program);
      expect(resolved).toBe('start');
    });

    it('resolves entryScene by matching filename without .vns extension and picking first scene', () => {
      const project = createMockProject({
        entryScene: 'chapter2',
        files: [
          {
            id: 'f-ch2',
            name: 'chapter2.vns',
            content: `// Chapter 2 script
scene chapter2_intro {
  "Hero" "Here we go again."
}

scene chapter2_climax {
  "Hero" "The battle begins."
}
`,
            order: 1,
            version: 1,
          },
        ],
      });

      const program: Instruction[] = [
        { type: 'SCENE', name: 'chapter2_intro' },
        { type: 'DIALOGUE', character: 'Hero', text: 'Here we go again.' },
        { type: 'SCENE', name: 'chapter2_climax' },
      ];

      const resolved = resolveEntrySceneName(project, program);
      expect(resolved).toBe('chapter2_intro');
    });

    it('resolves directly to SCENE name in program if entryScene matches a SCENE directly and no file matches', () => {
      const project = createMockProject({
        entryScene: 'start',
        files: [
          {
            id: 'f-scenario',
            name: 'scenario.vns',
            content: 'scene prologue {}\n',
            order: 0,
            version: 1,
          },
        ],
      });

      const program: Instruction[] = [
        { type: 'SCENE', name: 'prologue' },
        { type: 'SCENE', name: 'start' },
      ];

      const resolved = resolveEntrySceneName(project, program);
      expect(resolved).toBe('start');
    });

    it('returns undefined if entryScene is missing, empty, or does not match any file or scene', () => {
      const projectWithoutEntry = createMockProject({
        entryScene: undefined,
        files: [
          {
            id: 'f-1',
            name: 'main.vns',
            content: 'scene start {}\n',
            order: 0,
            version: 1,
          },
        ],
      });
      const program: Instruction[] = [{ type: 'SCENE', name: 'start' }];
      expect(resolveEntrySceneName(projectWithoutEntry, program)).toBeUndefined();

      const projectWithEmptyEntry = createMockProject({
        entryScene: '',
        files: [
          {
            id: 'f-1',
            name: 'main.vns',
            content: 'scene start {}\n',
            order: 0,
            version: 1,
          },
        ],
      });
      expect(resolveEntrySceneName(projectWithEmptyEntry, program)).toBeUndefined();

      const projectWithUnknownEntry = createMockProject({
        entryScene: 'nonexistent_file_or_scene',
        files: [
          {
            id: 'f-1',
            name: 'main.vns',
            content: 'scene start {}\n',
            order: 0,
            version: 1,
          },
        ],
      });
      expect(resolveEntrySceneName(projectWithUnknownEntry, program)).toBeUndefined();
    });

    it('returns undefined if first scene declared in matched file is not present in compiled program', () => {
      const project = createMockProject({
        entryScene: 'main.vns',
        files: [
          {
            id: 'f-main',
            name: 'main.vns',
            content: 'scene uncompiled_scene {}\n',
            order: 0,
            version: 1,
          },
        ],
      });

      const program: Instruction[] = [{ type: 'SCENE', name: 'other_compiled_scene' }];

      const resolved = resolveEntrySceneName(project, program);
      expect(resolved).toBeUndefined();
    });
  });

  // ========================================================================
  // 2. buildPublishedGameZip
  // ========================================================================
  describe('buildPublishedGameZip', () => {
    it('creates a valid ZIP package with project.json matching PublishedGameBundle contract', async () => {
      const fixedNow = 1715000000000;
      const titleSettings: ProjectTitleSettings = {
        backgroundAssetId: 'bg-title',
        logoAssetId: 'logo-game',
        bgmAssetId: 'bgm-title',
      };

      const project = createMockProject({
        titleSettings,
        entryScene: 'main.vns',
        files: [
          {
            id: 'f-main',
            name: 'main.vns',
            content: 'scene start {}\n',
            order: 0,
            version: 1,
          },
        ],
      });

      const program: Instruction[] = [
        { type: 'SCENE', name: 'start' },
        { type: 'DIALOGUE', character: 'Alice', text: 'Hello from published ZIP!' },
      ];

      const getAssetBlob = vi.fn().mockResolvedValue(null);

      const result = await buildPublishedGameZip({
        project,
        program,
        getAssetBlob,
        now: fixedNow,
      });

      expect(result.zip).toBeInstanceOf(Uint8Array);
      expect(result.bundle.formatVersion).toBe(PUBLISHED_BUNDLE_FORMAT_VERSION);
      expect(result.bundle.projectId).toBe(project.id);
      expect(result.bundle.title).toBe(project.title);
      expect(result.bundle.publishedAt).toBe(fixedNow);
      expect(result.bundle.entryScene).toBe('start');
      expect(result.bundle.titleSettings).toEqual(titleSettings);
      expect(result.bundle.program).toEqual(program);

      // Unzip verification
      const unzipped = unzipSync(result.zip);
      const projectJsonBytes = unzipped['project.json'];
      expect(projectJsonBytes).toBeDefined();
      if (!projectJsonBytes) throw new Error('project.json missing in zip');

      const unzippedBundle = JSON.parse(strFromU8(projectJsonBytes)) as PublishedGameBundle;
      expect(unzippedBundle).toEqual(result.bundle);
    });

    it('omits entryScene and titleSettings keys when project does not provide them', async () => {
      const project = createMockProject({
        entryScene: undefined,
        titleSettings: undefined,
      });
      const program: Instruction[] = [{ type: 'HALT' }];

      const { bundle, zip } = await buildPublishedGameZip({
        project,
        program,
        getAssetBlob: vi.fn().mockResolvedValue(null),
      });

      expect('entryScene' in bundle).toBe(false);
      expect('titleSettings' in bundle).toBe(false);

      const unzipped = unzipSync(zip);
      const projectJsonBytes = unzipped['project.json'];
      expect(projectJsonBytes).toBeDefined();
      if (!projectJsonBytes) throw new Error('project.json missing in zip');

      const parsedJson = JSON.parse(strFromU8(projectJsonBytes)) as Record<string, unknown>;
      expect('entryScene' in parsedJson).toBe(false);
      expect('titleSettings' in parsedJson).toBe(false);
    });

    it('packs assets with blobs into assets/<16-hex-hash>.<ext> and deduplicates identical bytes', async () => {
      const img1Bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const img2Bytes = new Uint8Array([1, 2, 3, 4, 5]); // identical bytes -> should deduplicate
      const soundBytes = new Uint8Array([9, 8, 7]);

      const asset1: AssetRef = {
        id: 'asset-bg-1',
        name: 'classroom.png',
        type: 'image',
        category: 'background',
        storageUrl: 'blob:http://localhost/bg1',
        sizeBytes: 5,
        tag: 'bg',
        variant: 'day',
      };

      const asset2: AssetRef = {
        id: 'asset-bg-2',
        name: 'classroom_copy.png',
        type: 'image',
        category: 'background',
        storageUrl: 'blob:http://localhost/bg2',
        sizeBytes: 5,
        tag: 'bg',
        variant: 'duplicate',
      };

      const asset3: AssetRef = {
        id: 'asset-se-1',
        name: 'bell.wav',
        type: 'audio',
        category: 'sfx',
        storageUrl: 'blob:http://localhost/se1',
        sizeBytes: 3,
      };

      const project = createMockProject({
        assets: [asset1, asset2, asset3],
      });

      const getAssetBlob = vi.fn().mockImplementation(async (id: string) => {
        if (id === 'asset-bg-1') return new Blob([img1Bytes], { type: 'image/png' });
        if (id === 'asset-bg-2') return new Blob([img2Bytes], { type: 'image/png' });
        if (id === 'asset-se-1') return new Blob([soundBytes], { type: 'audio/wav' });
        return null;
      });

      const { zip, bundle } = await buildPublishedGameZip({
        project,
        program: [],
        getAssetBlob,
      });

      expect(bundle.assets).toHaveLength(3);

      const bundleAsset1 = bundle.assets[0];
      const bundleAsset2 = bundle.assets[1];
      const bundleAsset3 = bundle.assets[2];

      expect(bundleAsset1).toBeDefined();
      expect(bundleAsset2).toBeDefined();
      expect(bundleAsset3).toBeDefined();
      if (!bundleAsset1 || !bundleAsset2 || !bundleAsset3) throw new Error('Assets expected');

      // 16-hex character hash check
      expect(bundleAsset1.storageUrl).toMatch(/^assets\/[0-9a-f]{16}\.png$/);
      expect(bundleAsset2.storageUrl).toMatch(/^assets\/[0-9a-f]{16}\.png$/);
      expect(bundleAsset3.storageUrl).toMatch(/^assets\/[0-9a-f]{16}\.wav$/);

      // Identical bytes must have identical storageUrl
      expect(bundleAsset1.storageUrl).toBe(bundleAsset2.storageUrl);
      expect(bundleAsset1.storageUrl).not.toBe(bundleAsset3.storageUrl);

      // Verify zip entries
      const unzipped = unzipSync(zip);
      const packedFile1 = unzipped[bundleAsset1.storageUrl];
      const packedFile3 = unzipped[bundleAsset3.storageUrl];

      expect(packedFile1).toBeDefined();
      expect(packedFile3).toBeDefined();
      if (!packedFile1 || !packedFile3) throw new Error('Packed asset files missing');

      expect(Array.from(packedFile1)).toEqual(Array.from(img1Bytes));
      expect(Array.from(packedFile3)).toEqual(Array.from(soundBytes));

      // Check deduplication in zip: only 2 files in assets/ directory
      const assetKeys = Object.keys(unzipped).filter(k => k.startsWith('assets/'));
      expect(assetKeys).toHaveLength(2);

      // Verify asset metadata preservation
      expect(bundleAsset1).toMatchObject({
        id: asset1.id,
        name: asset1.name,
        type: asset1.type,
        category: asset1.category,
        tag: asset1.tag,
        variant: asset1.variant,
        sizeBytes: asset1.sizeBytes,
      });
    });

    it('derives extension from asset name or falls back to MIME type mappings', async () => {
      const mimeCases: Array<{
        name: string;
        mime: string;
        expectedExt: string;
      }> = [
        { name: 'hero.WEBP', mime: 'image/webp', expectedExt: 'webp' },
        { name: 'photo.JPEG', mime: 'image/jpeg', expectedExt: 'jpeg' },
        { name: 'noext_png', mime: 'image/png', expectedExt: 'png' },
        { name: 'noext_jpg', mime: 'image/jpeg', expectedExt: 'jpg' },
        { name: 'noext_webp', mime: 'image/webp', expectedExt: 'webp' },
        { name: 'noext_svg', mime: 'image/svg+xml', expectedExt: 'svg' },
        { name: 'noext_mp3', mime: 'audio/mpeg', expectedExt: 'mp3' },
        { name: 'noext_ogg', mime: 'audio/ogg', expectedExt: 'ogg' },
        { name: 'noext_wav', mime: 'audio/wav', expectedExt: 'wav' },
        { name: 'noext_unknown', mime: 'application/octet-stream', expectedExt: 'bin' },
        { name: 'invalid_ext.toolongextname', mime: 'image/png', expectedExt: 'png' },
      ];

      for (let i = 0; i < mimeCases.length; i++) {
        const item = mimeCases[i];
        if (!item) continue;

        const asset: AssetRef = {
          id: `asset-ext-${i}`,
          name: item.name,
          type: item.mime.startsWith('image') ? 'image' : 'audio',
          storageUrl: `blob:http://localhost/ext-${i}`,
          sizeBytes: 10,
        };

        const project = createMockProject({ assets: [asset] });
        const getAssetBlob = vi
          .fn()
          .mockResolvedValue(new Blob([new Uint8Array([i + 1, i + 2])], { type: item.mime }));

        const { bundle } = await buildPublishedGameZip({
          project,
          program: [],
          getAssetBlob,
        });

        const publishedAsset = bundle.assets[0];
        expect(publishedAsset).toBeDefined();
        if (!publishedAsset) throw new Error('Published asset missing');

        const regex = new RegExp(`^assets\\/[0-9a-f]{16}\\.${item.expectedExt}$`);
        expect(publishedAsset.storageUrl).toMatch(regex);
      }
    });

    it('preserves remote HTTP and HTTPS assets without fetching blobs or adding zip files', async () => {
      const httpAsset: AssetRef = {
        id: 'asset-remote-http',
        name: 'remote_bg.png',
        type: 'image',
        storageUrl: 'http://cdn.example.com/assets/remote_bg.png',
        sizeBytes: 1024,
      };

      const httpsAsset: AssetRef = {
        id: 'asset-remote-https',
        name: 'remote_se.mp3',
        type: 'audio',
        storageUrl: 'https://cdn.example.com/assets/remote_se.mp3',
        sizeBytes: 2048,
      };

      const project = createMockProject({
        assets: [httpAsset, httpsAsset],
      });

      const getAssetBlob = vi.fn().mockResolvedValue(null);

      const { bundle, zip } = await buildPublishedGameZip({
        project,
        program: [],
        getAssetBlob,
      });

      expect(getAssetBlob).not.toHaveBeenCalledWith(httpAsset.id);
      expect(getAssetBlob).not.toHaveBeenCalledWith(httpsAsset.id);

      expect(bundle.assets).toHaveLength(2);
      expect(bundle.assets[0]?.storageUrl).toBe(httpAsset.storageUrl);
      expect(bundle.assets[1]?.storageUrl).toBe(httpsAsset.storageUrl);

      const unzipped = unzipSync(zip);
      const assetKeys = Object.keys(unzipped).filter(k => k.startsWith('assets/'));
      expect(assetKeys).toHaveLength(0);
    });

    it('omits blob: assets missing a backing Blob, emits warnings, and preserves data: URLs', async () => {
      const missingBlobAsset: AssetRef = {
        id: 'asset-missing-blob-id',
        name: 'lost_texture.png',
        type: 'image',
        storageUrl: 'blob:http://localhost/ghost-guid',
        sizeBytes: 500,
      };

      const dataUrlAsset: AssetRef = {
        id: 'asset-data-uri-id',
        name: 'inline_icon.png',
        type: 'image',
        storageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk',
        sizeBytes: 32,
      };

      const project = createMockProject({
        assets: [missingBlobAsset, dataUrlAsset],
      });

      const getAssetBlob = vi.fn().mockResolvedValue(null);

      const { bundle, warnings, zip } = await buildPublishedGameZip({
        project,
        program: [],
        getAssetBlob,
      });

      // missing blob: asset must be pruned from bundle.assets
      expect(bundle.assets.find(a => a.id === missingBlobAsset.id)).toBeUndefined();

      // warnings must report missing asset id
      expect(warnings.some(w => w.includes(missingBlobAsset.id))).toBe(true);

      // data: URL asset must be preserved intact
      const preservedDataAsset = bundle.assets.find(a => a.id === dataUrlAsset.id);
      expect(preservedDataAsset).toBeDefined();
      expect(preservedDataAsset?.storageUrl).toBe(dataUrlAsset.storageUrl);

      // No files packed into assets/
      const unzipped = unzipSync(zip);
      const assetKeys = Object.keys(unzipped).filter(k => k.startsWith('assets/'));
      expect(assetKeys).toHaveLength(0);
    });
  });
});
