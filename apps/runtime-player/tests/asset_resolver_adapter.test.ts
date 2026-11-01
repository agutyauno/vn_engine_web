import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetResolverAdapter } from '../src/adapters/AssetResolverAdapter';
import type { DiagnosticBus } from '../src/services/diagnosticBus';

describe('AssetResolverAdapter', () => {
  let mockDiagnosticBus: DiagnosticBus;
  let reportedDiagnostics: unknown[];

  const sampleProjectData = {
    id: 'proj_test_01',
    name: 'Test Project',
    characters: [
      {
        id: 'alice',
        name: 'Alice',
        sprites: {
          happy: 'https://cdn.example.com/alice_happy.png',
          sad: 'ref_alice_sad_asset',
          default: 'https://cdn.example.com/alice_default.png',
        },
      },
      {
        id: 'bob',
        name: 'Bob',
        sprites: {
          neutral: 'data:image/png;base64,bobneutral',
        },
      },
    ],
    assets: [
      {
        id: 'bg_classroom',
        name: 'Classroom',
        storageUrl: 'https://cdn.example.com/bg_classroom.jpg',
        type: 'image',
      },
      {
        id: 'prop_sword',
        name: 'Sword',
        storageUrl: 'https://cdn.example.com/prop_sword.png',
        type: 'image',
      },
      {
        id: 'ref_alice_sad_asset',
        name: 'alice_sad_ref',
        storageUrl: 'https://cdn.example.com/alice_sad.png',
        type: 'image',
      },
      {
        id: 'bgm_peaceful',
        name: 'Peaceful Day',
        storageUrl: 'https://cdn.example.com/bgm_peaceful.mp3',
        type: 'audio',
      },
    ],
  };

  beforeEach(() => {
    reportedDiagnostics = [];
    mockDiagnosticBus = {
      report: vi.fn((diag) => {
        reportedDiagnostics.push(diag);
      }),
      clear: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      onClear: vi.fn(() => () => {}),
      getHistory: vi.fn(() => []),
      setEditorOrigin: vi.fn(),
      setTargetWindow: vi.fn(),
    } as unknown as DiagnosticBus;
  });

  describe('Graphic Asset Resolution', () => {
    it('should resolve asset directly by id or name to its storageUrl', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('bg_classroom')).toBe('https://cdn.example.com/bg_classroom.jpg');
      expect(resolver('Classroom')).toBe('https://cdn.example.com/bg_classroom.jpg');
      expect(resolver('prop_sword')).toBe('https://cdn.example.com/prop_sword.png');
    });

    it('should resolve character expression with dot notation (e.g. alice.happy)', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('alice.happy')).toBe('https://cdn.example.com/alice_happy.png');
    });

    it('should resolve character expression with underscore notation (e.g. alice_happy)', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('alice_happy')).toBe('https://cdn.example.com/alice_happy.png');
    });

    it('should resolve referenced asset id for character sprites (e.g. ref_alice_sad_asset)', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('alice.sad')).toBe('https://cdn.example.com/alice_sad.png');
    });

    it('should fallback to default sprite if requested expression is missing', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      // "alice.angry" does not exist, should fallback to "default"
      expect(resolver('alice.angry')).toBe('https://cdn.example.com/alice_default.png');
    });

    it('should fallback to the first available sprite when no default exists', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      // "bob.excited" does not exist, bob has no "default", should fallback to "neutral"
      expect(resolver('bob.excited')).toBe('data:image/png;base64,bobneutral');
    });

    it('should resolve plain character name to default or first sprite', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('alice')).toBe('https://cdn.example.com/alice_default.png');
      expect(resolver('bob')).toBe('data:image/png;base64,bobneutral');
    });

    it('should report missing graphic warning via DiagnosticBus when asset is not found', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      const result = resolver('non_existent_asset');
      expect(result).toBeUndefined();
      expect(mockDiagnosticBus.report).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'asset',
          severity: 'warning',
          code: 'ERR_MISSING_GRAPHIC',
          assetKey: 'non_existent_asset',
        }),
      );
    });

    it('should not report missing asset warning for empty or blank keys', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('')).toBeUndefined();
      expect(resolver('   ')).toBeUndefined();
      expect(mockDiagnosticBus.report).not.toHaveBeenCalled();
    });
  });

  describe('Prop Differentiation (checkIsProp)', () => {
    it('should return false for characters defined in project characters list', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);

      expect(adapter.checkIsProp('alice')).toBe(false);
      expect(adapter.checkIsProp('Alice')).toBe(false);
      expect(adapter.checkIsProp('bob')).toBe(false);
    });

    it('should return true for items defined in assets list that are not characters', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);

      expect(adapter.checkIsProp('prop_sword')).toBe(true);
      expect(adapter.checkIsProp('Sword')).toBe(true);
      expect(adapter.checkIsProp('bg_classroom')).toBe(true);
    });

    it('should return false for unknown IDs not in characters or assets', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);

      expect(adapter.checkIsProp('unknown_entity')).toBe(false);
    });
  });

  describe('Audio Asset Resolution', () => {
    it('should resolve audio asset by id or name from project assets', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetAudioResolver();

      expect(resolver('bgm_peaceful')).toBe('https://cdn.example.com/bgm_peaceful.mp3');
      expect(resolver('Peaceful Day')).toBe('https://cdn.example.com/bgm_peaceful.mp3');
    });

    it('should return direct URLs or audio file paths unchanged', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetAudioResolver();

      expect(resolver('https://cdn.example.com/track.mp3')).toBe('https://cdn.example.com/track.mp3');
      expect(resolver('http://localhost:3000/sfx/click.ogg')).toBe('http://localhost:3000/sfx/click.ogg');
      expect(resolver('data:audio/mp3;base64,sounddata')).toBe('data:audio/mp3;base64,sounddata');
      expect(resolver('blob:http://localhost/uuid-1234')).toBe('blob:http://localhost/uuid-1234');
      expect(resolver('/sounds/fanfare.wav')).toBe('/sounds/fanfare.wav');
      expect(resolver('./sfx/step.ogg')).toBe('./sfx/step.ogg');
    });

    it('should report missing audio warning via DiagnosticBus when asset is not found', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetAudioResolver();

      const result = resolver('missing_bgm');
      expect(result).toBeUndefined();
      expect(mockDiagnosticBus.report).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'asset',
          severity: 'warning',
          code: 'ERR_MISSING_AUDIO',
          assetKey: 'missing_bgm',
        }),
      );
    });

    it('should reset warned assets cache via resetWarnedAssets()', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData);
      expect(() => adapter.resetWarnedAssets()).not.toThrow();
    });
  });
});

