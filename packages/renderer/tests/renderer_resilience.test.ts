import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Assets, Texture } from 'pixi.js';
import { GameRenderer } from '../src/renderer';

describe('Renderer Resilience & Asset Fallback (TASK-renderer-null-texture-and-blob-hydration)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('TC-REND-RESIL-01: setBackground gracefully falls back when Assets.load resolves to null (does not crash on texture.width)', async () => {
    vi.spyOn(Assets, 'load').mockResolvedValue(null as unknown as Texture);

    const renderer = new GameRenderer({
      width: 1280,
      height: 720,
      placeholderMode: 'procedural',
    });

    // Asset resolver returns a blob URL which Pixi fails to parse (resolves to null)
    await expect(
      renderer.setBackground('bg_corrupted', undefined, () => 'blob:http://localhost:3001/dead-uuid'),
    ).resolves.not.toThrow();

    expect(renderer.getCurrentBackgroundId()).toBe('bg_corrupted');

    interface TestableRenderer {
      currentBackgroundSprite?: { texture: { width: number } };
    }
    const priv = renderer as unknown as TestableRenderer;
    expect(priv.currentBackgroundSprite).toBeDefined();
    expect(priv.currentBackgroundSprite?.texture.width).toBe(1280);

    renderer.destroy();
  });

  it('TC-REND-RESIL-02: showCharacter gracefully falls back when Assets.load resolves to null', async () => {
    vi.spyOn(Assets, 'load').mockResolvedValue(null as unknown as Texture);

    const renderer = new GameRenderer({
      width: 1280,
      height: 720,
      placeholderMode: 'procedural',
    });

    await expect(
      renderer.showCharacter(
        { type: 'SHOW', character: 'alice', sprite: 'smile' },
        () => 'blob:http://localhost:3001/dead-uuid',
      ),
    ).resolves.not.toThrow();

    expect(renderer.hasCharacter('alice')).toBe(true);

    interface TestableRenderer {
      activeCharacters: Map<string, { sprite: { texture: { width: number } } }>;
    }
    const priv = renderer as unknown as TestableRenderer;
    const char = priv.activeCharacters.get('alice');
    expect(char).toBeDefined();
    expect(char?.sprite.texture.width).toBe(320);

    renderer.destroy();
  });

  it("TC-REND-RESIL-03: resolveOrGenerateBackgroundTexture wraps blob URLs with parser: 'loadTextures'", async () => {
    const fakeTexture = {
      width: 1920,
      height: 1080,
      source: {} as any,
      destroy: vi.fn(),
    } as unknown as Texture;

    const loadSpy = vi.spyOn(Assets, 'load').mockResolvedValue(fakeTexture);

    const renderer = new GameRenderer({
      width: 1280,
      height: 720,
      placeholderMode: 'procedural',
    });

    await renderer.setBackground('bg_blob', undefined, () => 'blob:http://localhost:3001/good-uuid');

    expect(loadSpy).toHaveBeenCalledWith({
      src: 'blob:http://localhost:3001/good-uuid',
      parser: 'loadTextures',
    });

    renderer.destroy();
  });

  it("TC-REND-RESIL-04: resolveOrGenerateCharacterTexture wraps blob URLs with parser: 'loadTextures'", async () => {
    const fakeTexture = {
      width: 320,
      height: 560,
      source: {} as any,
      destroy: vi.fn(),
    } as unknown as Texture;

    const loadSpy = vi.spyOn(Assets, 'load').mockResolvedValue(fakeTexture);

    const renderer = new GameRenderer({
      width: 1280,
      height: 720,
      placeholderMode: 'procedural',
    });

    await renderer.showCharacter(
      { type: 'SHOW', character: 'alice', sprite: 'smile' },
      () => 'blob:http://localhost:3001/alice-uuid',
    );

    expect(loadSpy).toHaveBeenCalledWith({
      src: 'blob:http://localhost:3001/alice-uuid',
      parser: 'loadTextures',
    });

    renderer.destroy();
  });
});
