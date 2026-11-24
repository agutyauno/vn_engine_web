import { describe, it, expect, vi } from 'vitest';
import {
  resolveCharacterCoordinates,
  resolveCharacterPlacement,
  resolveSpritePlacement,
  EASING_FUNCTIONS,
  type ManagedSprite,
} from '../src/types';
import { GameRenderer, computeTargetScale, computeTargetRotation } from '../src/renderer';
import type { ShowInstruction } from '@vn-engine/shared-types';

describe('@vn-engine/renderer - Coordinate Resolution & GameRenderer Setup', () => {
  it('nên phân giải chính xác các vị trí định danh (Named Positions: left, center, right)', () => {
    const baseW = 1280;
    const baseH = 720;

    const left = resolveCharacterCoordinates('left', baseW, baseH);
    expect(left.x).toBeCloseTo(baseW * 0.22);
    expect(left.y).toBe(baseH);

    const center = resolveCharacterCoordinates('center', baseW, baseH);
    expect(center.x).toBeCloseTo(baseW * 0.5);
    expect(center.y).toBe(baseH);

    const right = resolveCharacterCoordinates('right', baseW, baseH);
    expect(right.x).toBeCloseTo(baseW * 0.78);
    expect(right.y).toBe(baseH);

    const fallback = resolveCharacterCoordinates(undefined, baseW, baseH);
    expect(fallback.x).toBeCloseTo(baseW * 0.5);
    expect(fallback.y).toBe(baseH);
  });

  it('nên hỗ trợ tọa độ số cụ thể { x, y } (ADR-018)', () => {
    const baseW = 1280;
    const baseH = 720;

    const custom = resolveCharacterCoordinates({ x: 350, y: 600 }, baseW, baseH);
    expect(custom.x).toBe(350);
    expect(custom.y).toBe(600);

    const defaultY = resolveCharacterCoordinates({ x: 400 }, baseW, baseH);
    expect(defaultY.x).toBe(400);
    expect(defaultY.y).toBe(baseH);
  });

  it('nên khởi tạo GameRenderer với kích thước cơ sở 1280x720 chuẩn 16:9', () => {
    const renderer = new GameRenderer({ width: 1280, height: 720 });
    expect(renderer.baseWidth).toBe(1280);
    expect(renderer.baseHeight).toBe(720);
    expect(renderer.app).toBeDefined();
  });

  it('nên phân giải chính xác tọa độ tỉ lệ và pixel offset trong resolveCharacterPlacement', () => {
    const baseW = 1280;
    const baseH = 720;

    // Tọa độ tỉ lệ 0.0 - 1.0
    const ratioPos = resolveCharacterPlacement({ x: 0.3, y: 0.8 }, baseW, baseH);
    expect(ratioPos.x).toBeCloseTo(1280 * 0.3);
    expect(ratioPos.y).toBeCloseTo(720 * 0.8);

    // Kèm offset pixel
    const withOffset = resolveCharacterPlacement(
      { position: 'center', offsetX: 25, offsetY: -50 },
      baseW,
      baseH,
    );
    expect(withOffset.x).toBeCloseTo(baseW * 0.5 + 25);
    expect(withOffset.y).toBe(baseH - 50);
  });

  it('nên tính toán chính xác scale và lật gương flipX/flipY trong computeTargetScale', () => {
    expect(computeTargetScale(undefined, undefined, undefined, undefined, undefined)).toEqual({
      scaleX: 1,
      scaleY: 1,
    });

    expect(computeTargetScale(1.5, undefined, undefined, undefined, undefined)).toEqual({
      scaleX: 1.5,
      scaleY: 1.5,
    });

    expect(computeTargetScale(undefined, 1.2, 0.8, undefined, undefined)).toEqual({
      scaleX: 1.2,
      scaleY: 0.8,
    });

    expect(computeTargetScale(1.5, undefined, undefined, true, false)).toEqual({
      scaleX: -1.5,
      scaleY: 1.5,
    });

    expect(computeTargetScale(2, undefined, undefined, true, true)).toEqual({
      scaleX: -2,
      scaleY: -2,
    });
  });

  it('nên đổi góc xoay độ sang radian chính xác trong computeTargetRotation', () => {
    expect(computeTargetRotation(0)).toBe(0);
    expect(computeTargetRotation(90)).toBeCloseTo(Math.PI / 2);
    expect(computeTargetRotation(180)).toBeCloseTo(Math.PI);
    expect(computeTargetRotation(-45)).toBeCloseTo(-Math.PI / 4);
  });

  it('nên tính toán đúng giá trị biên cho các hàm easing (linear, ease_out, bounce, elastic)', () => {
    expect(EASING_FUNCTIONS.linear!(0)).toBe(0);
    expect(EASING_FUNCTIONS.linear!(1)).toBe(1);

    expect(EASING_FUNCTIONS.ease_out!(0)).toBe(0);
    expect(EASING_FUNCTIONS.ease_out!(1)).toBe(1);

    expect(EASING_FUNCTIONS.bounce!(0)).toBe(0);
    expect(EASING_FUNCTIONS.bounce!(1)).toBe(1);

    expect(EASING_FUNCTIONS.elastic!(0)).toBe(0);
    expect(EASING_FUNCTIONS.elastic!(1)).toBe(1);
  });

  it('nên hỗ trợ các transition mở rộng (slide, bounce, wobble, zoom, shake, pop) trên GameRenderer', async () => {
    const renderer = new GameRenderer({ width: 1280, height: 720 });

    await renderer.setBackground({
      type: 'BACKGROUND',
      assetId: 'bg_test',
      transition: 'zoom',
      duration: 0.1,
    });
    expect(renderer.getCurrentBackgroundId()).toBe('bg_test');

    await renderer.setBackground({
      type: 'BACKGROUND',
      assetId: 'bg_test2',
      transition: 'slide_left',
      duration: 0.1,
    });
    expect(renderer.getCurrentBackgroundId()).toBe('bg_test2');

    await renderer.showCharacter({
      type: 'SHOW',
      targetId: 'amiya',
      variant: 'normal',
      position: 'center',
      transition: 'bounce',
      duration: 0.1,
    });
    expect(renderer.hasCharacter('amiya')).toBe(true);

    await renderer.showCharacter({
      type: 'SHOW',
      targetId: 'amiya',
      variant: 'happy',
      position: 'right',
      transition: 'wobble',
      duration: 0.1,
    });
    expect(renderer.hasCharacter('amiya')).toBe(true);

    renderer.destroy();
  });

  // =========================================================================
  // BỘ KIỂM THỬ MICRO-PHASE 4: UNIFIED SPRITE LAYER & PLACEMENT
  // =========================================================================
  describe('Unified Sprite Layer (Micro-Phase 4)', () => {
    it('[TC-SPRITE-REND-01] resolveSpritePlacement() định vị chuẩn xác với neo đáy mặc định (0.5, 1.0) và y = baseHeight', () => {
      const baseW = 1920;
      const baseH = 1080;

      // 1. Mặc định không có tham số x/y/position/anchor
      const defaultPlacement = resolveSpritePlacement(
        { type: 'SHOW', targetId: 'alice' },
        baseW,
        baseH,
      );
      expect(defaultPlacement.x).toBeCloseTo(baseW * 0.5);
      expect(defaultPlacement.y).toBe(baseH);
      expect(defaultPlacement.anchorX).toBe(0.5);
      expect(defaultPlacement.anchorY).toBe(1.0);

      // 2. Named position 'left'
      const leftPlacement = resolveSpritePlacement(
        { type: 'SHOW', targetId: 'alice', position: 'left' },
        baseW,
        baseH,
      );
      expect(leftPlacement.x).toBeCloseTo(baseW * 0.22);
      expect(leftPlacement.y).toBe(baseH);
      expect(leftPlacement.anchorX).toBe(0.5);
      expect(leftPlacement.anchorY).toBe(1.0);

      // 3. Named position 'right'
      const rightPlacement = resolveSpritePlacement(
        { type: 'SHOW', targetId: 'alice', position: 'right' },
        baseW,
        baseH,
      );
      expect(rightPlacement.x).toBeCloseTo(baseW * 0.78);
      expect(rightPlacement.y).toBe(baseH);
      expect(rightPlacement.anchorX).toBe(0.5);
      expect(rightPlacement.anchorY).toBe(1.0);
    });

    it('[TC-SPRITE-REND-02] resolveSpritePlacement() hỗ trợ ghi đè anchorX, anchorY và tọa độ tùy biến', () => {
      const baseW = 1920;
      const baseH = 1080;

      const customPlacement = resolveSpritePlacement(
        {
          type: 'SHOW',
          targetId: 'key_gold',
          x: 0.5,
          y: 0.4,
          anchorX: 0.5,
          anchorY: 0.5,
          offsetX: 15,
          offsetY: -30,
        },
        baseW,
        baseH,
      );

      expect(customPlacement.x).toBeCloseTo(baseW * 0.5 + 15);
      expect(customPlacement.y).toBeCloseTo(baseH * 0.4 - 30);
      expect(customPlacement.anchorX).toBe(0.5);
      expect(customPlacement.anchorY).toBe(0.5);

      // Top-left anchor (0, 0)
      const topLeft = resolveSpritePlacement(
        { type: 'SHOW', targetId: 'hud_item', x: 100, y: 100, anchorX: 0, anchorY: 0 },
        baseW,
        baseH,
      );
      expect(topLeft.x).toBe(100);
      expect(topLeft.y).toBe(100);
      expect(topLeft.anchorX).toBe(0);
      expect(topLeft.anchorY).toBe(0);
    });

    it('[TC-SPRITE-REND-03] renderer.showSprite() hiển thị sprite với đầy đủ thuộc tính chuyển động và tween tracking', async () => {
      const baseW = 1920;
      const baseH = 1080;
      const renderer = new GameRenderer({ width: baseW, height: baseH });

      const resolverCalls: Array<{ targetId: string; variant?: string }> = [];
      const mockResolver = (targetId: string, variant?: string) => {
        resolverCalls.push({ targetId, variant });
        return undefined; // fallback wireframe
      };

      const instr: ShowInstruction = {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'happy',
        position: 'center',
        scale: 1.5,
        rotate: 30,
        flipX: true,
        alpha: 0.85,
        offsetX: 20,
        offsetY: -10,
        duration: 0,
      };

      await renderer.showSprite(instr, mockResolver);

      expect(renderer.hasSprite('alice')).toBe(true);
      expect(resolverCalls).toEqual([{ targetId: 'alice', variant: 'happy' }]);

      interface TestableGameRenderer {
        activeSprites: {
          get(id: string): ManagedSprite;
          has(id: string): boolean;
        };
      }
      const priv = renderer as unknown as TestableGameRenderer;
      const managed = priv.activeSprites.get('alice');

      expect(managed).toBeDefined();
      expect(managed.targetId).toBe('alice');
      expect(managed.currentVariant).toBe('happy');
      expect(managed.container.x).toBeCloseTo(baseW * 0.5 + 20);
      expect(managed.container.y).toBeCloseTo(baseH - 10);
      expect(managed.container.rotation).toBeCloseTo((30 * Math.PI) / 180);
      expect(managed.container.alpha).toBeCloseTo(0.85);
      expect(managed.container.scale.x).toBeCloseTo(-1.5); // flipX = true
      expect(managed.container.scale.y).toBeCloseTo(1.5);
      expect(managed.sprite.anchor.x).toBe(0.5);
      expect(managed.sprite.anchor.y).toBe(1.0);
      expect(managed.animating).toBe(false);

      renderer.destroy();
    });

    it('[TC-SPRITE-REND-04] renderer.showSprite() tự động tạo wireframe placeholder 360x600 khi không tìm thấy asset', async () => {
      const renderer = new GameRenderer({
        width: 1920,
        height: 1080,
        placeholderMode: 'procedural',
      });

      await renderer.showSprite({
        type: 'SHOW',
        targetId: 'mystery_item',
        variant: 'shiny',
        duration: 0,
      });

      expect(renderer.hasSprite('mystery_item')).toBe(true);

      interface TestableGameRenderer {
        activeSprites: {
          get(id: string): ManagedSprite;
          has(id: string): boolean;
        };
      }
      const priv = renderer as unknown as TestableGameRenderer;
      const managed = priv.activeSprites.get('mystery_item');

      expect(managed).toBeDefined();
      expect(managed.sprite.texture.width).toBe(360);
      expect(managed.sprite.texture.height).toBe(600);
      expect(managed.sprite.anchor.x).toBe(0.5);
      expect(managed.sprite.anchor.y).toBe(1.0);

      renderer.destroy();
    });

    it('[TC-SPRITE-REND-05] renderer.hideSprite() ẩn và dọn dẹp sprite khỏi activeSprites', async () => {
      const renderer = new GameRenderer({ width: 1920, height: 1080 });

      await renderer.showSprite({
        type: 'SHOW',
        targetId: 'alice',
        variant: 'smile',
        duration: 0,
      });
      expect(renderer.hasSprite('alice')).toBe(true);

      renderer.hideSprite('alice', 0);
      expect(renderer.hasSprite('alice')).toBe(false);

      interface TestableGameRenderer {
        activeSprites: {
          get(id: string): ManagedSprite;
          has(id: string): boolean;
        };
      }
      const priv = renderer as unknown as TestableGameRenderer;
      expect(priv.activeSprites.has('alice')).toBe(false);

      renderer.destroy();
    });

    it('[TC-SPRITE-REND-06] Tương thích ngược: showCharacter, hideCharacter, hasCharacter hoạt động trơn tru qua Sprite API', async () => {
      const renderer = new GameRenderer({ width: 1920, height: 1080 });

      await renderer.showCharacter({
        type: 'SHOW',
        targetId: 'bob',
        variant: 'default',
        duration: 0,
      });

      expect(renderer.hasCharacter('bob')).toBe(true);
      expect(renderer.hasSprite('bob')).toBe(true);

      renderer.hideCharacter('bob', 0);
      expect(renderer.hasCharacter('bob')).toBe(false);
      expect(renderer.hasSprite('bob')).toBe(false);

      renderer.destroy();
    });

    it('[TC-SPRITE-REND-07] Xóa bỏ phân mảnh isProp (y = 0.5 * H), mọi sprite neo chân chạm đáy (0.5, 1.0) và syncStateCatchUp không cần isPropChecker', async () => {
      const baseW = 1920;
      const baseH = 1080;

      // 1. Không còn ép y = baseH * 0.5 cho prop; mọi sprite mặc định y = baseH và anchorY = 1.0
      const propPlacement = resolveSpritePlacement(
        { type: 'SHOW', targetId: 'key_gold' },
        baseW,
        baseH,
      );
      expect(propPlacement.x).toBeCloseTo(baseW * 0.5);
      expect(propPlacement.y).toBe(baseH);
      expect(propPlacement.anchorX).toBe(0.5);
      expect(propPlacement.anchorY).toBe(1.0);

      // 2. Nếu script chủ động muốn căn giữa, truyền y: 0.5 và anchorY: 0.5
      const centeredProp = resolveSpritePlacement(
        { type: 'SHOW', targetId: 'key_gold', y: 0.5, anchorY: 0.5 },
        baseW,
        baseH,
      );
      expect(centeredProp.y).toBeCloseTo(baseH * 0.5);
      expect(centeredProp.anchorY).toBe(0.5);

      // 3. syncStateCatchUp đồng bộ danh sách sprites sạch sẽ mà không cần isPropChecker
      const renderer = new GameRenderer({ width: baseW, height: baseH });
      const spritesMap = new Map<string, ShowInstruction>([
        [
          'key_gold',
          {
            type: 'SHOW',
            targetId: 'key_gold',
            variant: 'default',
            anchorY: 0.5,
          },
        ],
      ]);

      await renderer.syncStateCatchUp({ sprites: spritesMap });
      expect(renderer.hasSprite('key_gold')).toBe(true);

      interface TestableGameRenderer {
        activeSprites: {
          get(id: string): ManagedSprite;
          has(id: string): boolean;
        };
      }
      const priv = renderer as unknown as TestableGameRenderer;
      const managed = priv.activeSprites.get('key_gold');
      expect(managed.sprite.anchor.y).toBe(0.5);

      renderer.destroy();
    });
  });

  describe('Phase 1: Transparent Fallbacks & Placeholder Modes (TASK-player-ui-and-scaler)', () => {
    interface TestableRenderer {
      currentBackgroundSprite?: { texture: { width: number } };
      placeholderTextures?: Map<string, unknown>;
      placeholderMode?: string;
      options?: { placeholderMode?: string };
      activeCharacters: Map<string, { sprite: { texture: { width: number } } }>;
    }

    it('TEST-REND-01: placeholderMode: "transparent" (or default) should safely render missing background without procedural grid', async () => {
      const renderer = new GameRenderer({
        width: 1280,
        height: 720,
        placeholderMode: 'transparent',
      });
      await renderer.setBackground('missing_bg_asset_01');
      expect(renderer.getCurrentBackgroundId()).toBe('missing_bg_asset_01');

      const priv = renderer as unknown as TestableRenderer;
      const currentSprite = priv.currentBackgroundSprite;
      expect(currentSprite).toBeDefined();
      const placeholderMap = priv.placeholderTextures;
      expect(!placeholderMap?.has('bg_missing_bg_asset_01')).toBe(true);
      expect(priv.options?.placeholderMode ?? priv.placeholderMode).toBe('transparent');
      renderer.destroy();
    });

    it('TEST-REND-02: placeholderMode: "transparent" should render empty container for missing character sprite without mannequin card', async () => {
      const renderer = new GameRenderer({
        width: 1280,
        height: 720,
        placeholderMode: 'transparent',
      });
      await renderer.showCharacter({
        type: 'SHOW',
        targetId: 'bob_ghost',
        variant: 'disappeared',
      });
      expect(renderer.hasCharacter('bob_ghost')).toBe(true);

      const priv = renderer as unknown as TestableRenderer;
      const charManaged = priv.activeCharacters.get('bob_ghost');
      expect(charManaged).toBeDefined();
      const placeholderMap = priv.placeholderTextures;
      expect(!placeholderMap?.has('char_bob_ghost_disappeared_false')).toBe(true);
      renderer.destroy();
    });

    it('TEST-REND-03: placeholderMode: "procedural" should preserve wireframe fallback with standardized 360x600 dimensions', async () => {
      const renderer = new GameRenderer({
        width: 1280,
        height: 720,
        placeholderMode: 'procedural',
      });
      const priv = renderer as unknown as TestableRenderer;
      expect(priv.options?.placeholderMode ?? priv.placeholderMode).toBe('procedural');

      await renderer.setBackground('legacy_bg');
      await renderer.showCharacter({
        type: 'SHOW',
        targetId: 'legacy_hero',
        variant: 'normal',
      });

      const bgSprite = priv.currentBackgroundSprite;
      expect(bgSprite).toBeDefined();
      expect(bgSprite?.texture.width).toBe(1280);

      const char = priv.activeCharacters.get('legacy_hero');
      expect(char).toBeDefined();
      expect(char?.sprite.texture.width).toBe(360);
      renderer.destroy();
    });
  });
});

describe('legacy SHOW fields are ignored (TASK-LEGACY-SPRITE)', () => {
  it('does not read the removed sprite field as the variant', async () => {
    const renderer = new GameRenderer({ width: 1280, height: 720, placeholderMode: 'transparent' });
    const resolver = vi.fn((_key: string, _variant?: string): string | undefined => undefined);
    const legacyShow: ShowInstruction & { sprite: string } = {
      type: 'SHOW',
      targetId: 'alice',
      sprite: 'happy',
    };

    await renderer.showSprite(legacyShow, resolver);

    expect(resolver).toHaveBeenCalled();
    for (const call of resolver.mock.calls) {
      expect(call[1]).toBeUndefined();
    }
    renderer.destroy();
  });

  it('passes the contract variant to the resolver', async () => {
    const renderer = new GameRenderer({ width: 1280, height: 720, placeholderMode: 'transparent' });
    const resolver = vi.fn((_key: string, _variant?: string): string | undefined => undefined);

    await renderer.showSprite({ type: 'SHOW', targetId: 'alice', variant: 'sad' }, resolver);

    expect(resolver.mock.calls.some(call => call[0] === 'alice' && call[1] === 'sad')).toBe(true);
    renderer.destroy();
  });
});
