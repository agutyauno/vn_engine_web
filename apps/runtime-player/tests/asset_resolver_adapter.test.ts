import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetResolverAdapter } from '../src/adapters/AssetResolverAdapter';
import type { DiagnosticBus } from '../src/services/diagnosticBus';

describe('AssetResolverAdapter', () => {
  let mockDiagnosticBus: DiagnosticBus;
  let reportedDiagnostics: unknown[];

  // Project data mới theo chuẩn Unified Sprite Asset (không còn bảng characters)
  const sampleProjectData = {
    id: 'proj_test_01',
    name: 'Test Project',
    assets: [
      {
        id: 'asset_alice_happy',
        name: 'alice_happy.png',
        tag: 'alice',
        variant: 'happy',
        category: 'sprite',
        storageUrl: 'https://cdn.example.com/alice_happy.png',
        type: 'image',
      },
      {
        id: 'asset_alice_default',
        name: 'alice_default.png',
        tag: 'alice',
        variant: 'default',
        category: 'sprite',
        storageUrl: 'https://cdn.example.com/alice_default.png',
        type: 'image',
      },
      {
        id: 'asset_prop_sword',
        name: 'prop_sword.png',
        tag: 'sword',
        variant: 'default',
        category: 'sprite',
        storageUrl: 'https://cdn.example.com/prop_sword.png',
        type: 'image',
      },
      {
        id: 'bg_classroom',
        name: 'Classroom',
        category: 'background',
        storageUrl: 'https://cdn.example.com/bg_classroom.jpg',
        type: 'image',
      },
      {
        id: 'bgm_peaceful',
        name: 'Peaceful Day',
        category: 'audio',
        storageUrl: 'https://cdn.example.com/bgm_peaceful.mp3',
        type: 'audio',
      },
    ],
  };

  beforeEach(() => {
    reportedDiagnostics = [];
    mockDiagnosticBus = {
      report: vi.fn(diag => {
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

  describe('Graphic Asset Resolution (TC-SPRITE-PLAYER-01)', () => {
    it('[TC-SPRITE-PLAYER-01] should resolve sprite texture by tag and variant', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      // Khớp chính xác cả tag và variant
      expect(resolver('alice', 'happy')).toBe('https://cdn.example.com/alice_happy.png');
      expect(resolver('alice', 'default')).toBe('https://cdn.example.com/alice_default.png');
    });

    it('[TC-SPRITE-PLAYER-01] should fallback to default variant when requested variant is not specified or missing', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      // Không truyền variant -> fallback về variant 'default'
      expect(resolver('alice')).toBe('https://cdn.example.com/alice_default.png');

      // Variant không tồn tại -> fallback về variant 'default'
      expect(resolver('alice', 'excited')).toBe('https://cdn.example.com/alice_default.png');
    });

    it('[TC-SPRITE-PLAYER-01] should resolve prop sprite by tag', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('sword')).toBe('https://cdn.example.com/prop_sword.png');
      expect(resolver('sword', 'default')).toBe('https://cdn.example.com/prop_sword.png');
    });

    it('[TC-SPRITE-PLAYER-01] should resolve background and other assets directly by id or name', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('bg_classroom')).toBe('https://cdn.example.com/bg_classroom.jpg');
      expect(resolver('Classroom')).toBe('https://cdn.example.com/bg_classroom.jpg');
    });

    it('[TC-SPRITE-PLAYER-01] should fallback to filename without extension (basename match)', () => {
      const adapter = new AssetResolverAdapter(() => sampleProjectData, mockDiagnosticBus);
      const resolver = adapter.getAssetGraphicResolver();

      expect(resolver('prop_sword')).toBe('https://cdn.example.com/prop_sword.png');
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

      expect(resolver('https://cdn.example.com/track.mp3')).toBe(
        'https://cdn.example.com/track.mp3',
      );
      expect(resolver('http://localhost:3000/sfx/click.ogg')).toBe(
        'http://localhost:3000/sfx/click.ogg',
      );
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
