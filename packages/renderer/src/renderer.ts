// ==========================================
// TẦNG HIỂN THỊ ĐỒ HỌA 2D (PIXIJS - ADR-018)
// ==========================================

import { Application, Container, Sprite, Texture, Assets, Rectangle } from 'pixi.js';
import type { ShowInstruction, BackgroundInstruction } from '@vn-engine/shared-types';
import {
  resolveSpritePlacement,
  EASING_FUNCTIONS,
  type EasingFunction,
  type AssetGraphicResolver,
  type CatchUpVisualState,
  type RendererOptions,
  type ManagedSprite,
} from './types';

export function computeTargetScale(
  scale: number | undefined,
  scaleX: number | undefined,
  scaleY: number | undefined,
  flipX: boolean | undefined,
  flipY: boolean | undefined,
): { scaleX: number; scaleY: number } {
  const baseScale = scale ?? 1.0;
  const rawX = scaleX ?? baseScale;
  const rawY = scaleY ?? baseScale;
  const finalX = flipX ? -Math.abs(rawX) : rawX;
  const finalY = flipY ? -Math.abs(rawY) : rawY;
  return { scaleX: finalX, scaleY: finalY };
}

export function computeTargetRotation(rotateDeg: number | undefined): number {
  if (rotateDeg === undefined) return 0;
  return (rotateDeg * Math.PI) / 180;
}

const defaultEaseOut: EasingFunction = (t: number): number => 1 - Math.pow(1 - t, 3);

function safeRequestAnimationFrame(callback: (now: number) => void): number {
  if (typeof requestAnimationFrame !== 'undefined') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(performance.now()), 16) as unknown as number;
}

export class GameRenderer {
  public app: Application;
  public baseWidth: number;
  public baseHeight: number;
  public options: RendererOptions;
  public placeholderMode: 'procedural' | 'transparent';

  private backgroundContainer: Container;
  private characterContainer: Container;
  public activeSprites: Map<string, ManagedSprite> = new Map();
  public activeCharacters: Map<string, ManagedSprite> = this.activeSprites;
  private currentBackgroundId: string | null = null;
  private currentBackgroundSprite: Sprite | null = null;
  private placeholderTextures: Map<string, Texture> = new Map();

  private isInitialized = false;

  constructor(options?: RendererOptions) {
    this.options = options ?? {};
    this.placeholderMode = options?.placeholderMode ?? 'transparent';
    this.baseWidth = options?.width ?? 1920;
    this.baseHeight = options?.height ?? 1080;

    this.app = new Application();
    this.backgroundContainer = new Container();
    this.characterContainer = new Container();
  }

  /**
   * Khởi tạo WebGL Application và cấu trúc các tầng hiển thị (Stage Layers)
   */
  public async init(containerElement?: HTMLElement, options?: RendererOptions): Promise<void> {
    if (this.isInitialized) return;

    if (options?.placeholderMode) {
      this.placeholderMode = options.placeholderMode;
      this.options.placeholderMode = options.placeholderMode;
    }

    await this.app.init({
      width: this.baseWidth,
      height: this.baseHeight,
      backgroundColor: options?.backgroundColor ?? 0xffffff, // Trắng chuẩn Swiss Wireframe
      antialias: options?.antialias ?? true,
      autoDensity: true,
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      preserveDrawingBuffer: true,
    });

    // Thêm các tầng theo đúng thứ tự hiển thị: Nền -> Sprite nhân vật/vật thể
    this.app.stage.addChild(this.backgroundContainer);
    this.app.stage.addChild(this.characterContainer);

    if (containerElement && this.app.canvas) {
      containerElement.appendChild(this.app.canvas);
      this.resizeToContainer(containerElement);
    }

    this.isInitialized = true;
  }

  /**
   * Co giãn canvas theo tỷ lệ 16:9 để vừa vặn container cha (Responsive Letterboxing)
   */
  public resizeToContainer(container: HTMLElement): void {
    const canvas = this.app.canvas;
    if (!canvas) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const targetRatio = this.baseWidth / this.baseHeight;
    const containerRatio = containerWidth / containerHeight;

    let finalWidth: number;
    let finalHeight: number;

    if (containerRatio > targetRatio) {
      // Container rộng hơn -> giới hạn theo chiều cao (Pillarbox)
      finalHeight = containerHeight;
      finalWidth = containerHeight * targetRatio;
    } else {
      // Container hẹp hơn -> giới hạn theo chiều rộng (Letterbox)
      finalWidth = containerWidth;
      finalHeight = containerWidth / targetRatio;
    }

    canvas.style.width = `${Math.floor(finalWidth)}px`;
    canvas.style.height = `${Math.floor(finalHeight)}px`;
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
  }

  /**
   * Đặt hình nền (Background). Nếu chưa có asset ảnh thật, tự động sinh phông nền Wireframe Blueprint.
   * Hỗ trợ đầy đủ biến đổi: phóng to/thu nhỏ (scale), xoay (rotate), lật (flipX/flipY), tọa độ (x, y, offset) và chuyển cảnh.
   */
  public async setBackground(
    assetIdOrInstr: string | BackgroundInstruction,
    transition?: string,
    assetResolver?: AssetGraphicResolver,
  ): Promise<void> {
    const isInstr = typeof assetIdOrInstr === 'object';
    const assetId = isInstr ? assetIdOrInstr.assetId : assetIdOrInstr;
    const trans = (isInstr ? assetIdOrInstr.transition : undefined) ?? transition;
    const duration =
      isInstr && assetIdOrInstr.duration !== undefined ? assetIdOrInstr.duration * 1000 : 400;
    const easingKey = (
      isInstr && assetIdOrInstr.easing ? assetIdOrInstr.easing : 'ease_out'
    ).toLowerCase();
    const easingFn: EasingFunction = EASING_FUNCTIONS[easingKey] ?? defaultEaseOut;

    const { scaleX: targetScaleX, scaleY: targetScaleY } = computeTargetScale(
      isInstr ? assetIdOrInstr.scale : undefined,
      isInstr ? assetIdOrInstr.scaleX : undefined,
      isInstr ? assetIdOrInstr.scaleY : undefined,
      isInstr ? assetIdOrInstr.flipX : undefined,
      isInstr ? assetIdOrInstr.flipY : undefined,
    );
    const targetRotation = computeTargetRotation(isInstr ? assetIdOrInstr.rotate : undefined);
    const targetAlpha = isInstr && assetIdOrInstr.alpha !== undefined ? assetIdOrInstr.alpha : 1.0;

    let targetX = this.baseWidth * 0.5;
    let targetY = this.baseHeight * 0.5;
    if (isInstr) {
      if (assetIdOrInstr.x !== undefined) {
        targetX =
          assetIdOrInstr.x >= 0 && assetIdOrInstr.x <= 1
            ? assetIdOrInstr.x * this.baseWidth
            : assetIdOrInstr.x;
      }
      if (assetIdOrInstr.y !== undefined) {
        targetY =
          assetIdOrInstr.y >= 0 && assetIdOrInstr.y <= 1
            ? assetIdOrInstr.y * this.baseHeight
            : assetIdOrInstr.y;
      }
      if (assetIdOrInstr.offsetX !== undefined) targetX += assetIdOrInstr.offsetX;
      if (assetIdOrInstr.offsetY !== undefined) targetY += assetIdOrInstr.offsetY;
    }

    if (this.currentBackgroundId === assetId && this.currentBackgroundSprite) {
      // Cùng ảnh nền: nếu có yêu cầu biến đổi (zoom/pan/rotate), thực hiện chuyển đổi mượt mà
      const sprite = this.currentBackgroundSprite;
      const texWidth = sprite.texture.width || this.baseWidth;
      const texHeight = sprite.texture.height || this.baseHeight;
      const baseCoverScale = Math.max(this.baseWidth / texWidth, this.baseHeight / texHeight);
      const destScaleX = baseCoverScale * targetScaleX;
      const destScaleY = baseCoverScale * targetScaleY;

      const startX = sprite.x;
      const startY = sprite.y;
      const startScaleX = sprite.scale.x;
      const startScaleY = sprite.scale.y;
      const startRot = sprite.rotation;
      const startAlpha = sprite.alpha;

      const deltaX = targetX - startX;
      const deltaY = targetY - startY;
      const deltaScaleX = destScaleX - startScaleX;
      const deltaScaleY = destScaleY - startScaleY;
      const deltaRot = targetRotation - startRot;
      const deltaAlpha = targetAlpha - startAlpha;

      if (duration > 0) {
        const startTime = performance.now();
        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const ease = easingFn(progress);

          sprite.x = startX + deltaX * ease;
          sprite.y = startY + deltaY * ease;
          sprite.scale.x = startScaleX + deltaScaleX * ease;
          sprite.scale.y = startScaleY + deltaScaleY * ease;
          sprite.rotation = startRot + deltaRot * ease;
          sprite.alpha = startAlpha + deltaAlpha * ease;

          if (progress < 1) {
            safeRequestAnimationFrame(animate);
          } else {
            sprite.x = targetX;
            sprite.y = targetY;
            sprite.scale.x = destScaleX;
            sprite.scale.y = destScaleY;
            sprite.rotation = targetRotation;
            sprite.alpha = targetAlpha;
          }
        };
        safeRequestAnimationFrame(animate);
      } else {
        sprite.x = targetX;
        sprite.y = targetY;
        sprite.scale.x = destScaleX;
        sprite.scale.y = destScaleY;
        sprite.rotation = targetRotation;
        sprite.alpha = targetAlpha;
      }
      return;
    }

    const texture = await this.resolveOrGenerateBackgroundTexture(assetId, assetResolver);
    const newSprite = new Sprite(texture);
    newSprite.anchor.set(0.5, 0.5);

    const texWidth = texture.width || this.baseWidth;
    const texHeight = texture.height || this.baseHeight;
    const baseCoverScale = Math.max(this.baseWidth / texWidth, this.baseHeight / texHeight);

    newSprite.scale.set(baseCoverScale * targetScaleX, baseCoverScale * targetScaleY);
    newSprite.rotation = targetRotation;
    newSprite.x = targetX;
    newSprite.y = targetY;

    const oldSprite = this.currentBackgroundSprite;
    this.currentBackgroundId = assetId;
    this.currentBackgroundSprite = newSprite;

    this.backgroundContainer.addChild(newSprite);

    if (trans && oldSprite && duration > 0) {
      newSprite.alpha = 0;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease = easingFn(progress);

        newSprite.alpha = targetAlpha * ease;
        oldSprite.alpha = 1 - ease;

        if (trans === 'slide' || trans === 'slide_left') {
          newSprite.x = targetX + this.baseWidth * 0.25 * (1 - ease);
          oldSprite.x = targetX - this.baseWidth * 0.25 * ease;
        } else if (trans === 'zoom') {
          newSprite.scale.set(
            baseCoverScale * targetScaleX * (0.85 + 0.15 * ease),
            baseCoverScale * targetScaleY * (0.85 + 0.15 * ease),
          );
        }

        if (progress < 1) {
          safeRequestAnimationFrame(animate);
        } else {
          newSprite.alpha = targetAlpha;
          newSprite.x = targetX;
          newSprite.scale.set(baseCoverScale * targetScaleX, baseCoverScale * targetScaleY);
          this.backgroundContainer.removeChild(oldSprite);
          oldSprite.destroy();
        }
      };
      safeRequestAnimationFrame(animate);
    } else {
      newSprite.alpha = targetAlpha;
      if (oldSprite) {
        this.backgroundContainer.removeChild(oldSprite);
        oldSprite.destroy();
      }
    }
  }

  /**
   * Hiển thị hoặc cập nhật Sprite (Nhân vật hoặc Đạo cụ) trên sân khấu PixiJS
   * Hỗ trợ đầy đủ: biến đổi tọa độ, anchor neo đáy (0.5, 1.0) hoặc tùy chỉnh, scale, xoay, lật, alpha và animation transitions.
   */
  public async showSprite(
    instr: ShowInstruction,
    assetResolver?: AssetGraphicResolver,
  ): Promise<void> {
    const targetId = instr.targetId || (instr as { character?: string }).character || '';
    const variant = instr.variant || (instr as { sprite?: string }).sprite;
    const duration = instr.duration !== undefined ? instr.duration * 1000 : 300;
    const easingKey = (instr.easing ? instr.easing : 'ease_out').toLowerCase();
    const easingFn: EasingFunction = EASING_FUNCTIONS[easingKey] ?? defaultEaseOut;
    const transition = instr.transition;

    const placement = resolveSpritePlacement(instr, this.baseWidth, this.baseHeight);
    const { scaleX: targetScaleX, scaleY: targetScaleY } = computeTargetScale(
      instr.scale,
      instr.scaleX,
      instr.scaleY,
      instr.flipX,
      instr.flipY,
    );
    const targetRotation = computeTargetRotation(instr.rotate);
    const targetAlpha = instr.alpha !== undefined ? instr.alpha : 1.0;

    const texture =
      (await this.resolveOrGenerateSpriteTexture(targetId, variant, assetResolver)) || Texture.EMPTY;

    const existing = this.activeSprites.get(targetId);

    if (existing) {
      if (existing.cancelAnimation) {
        existing.cancelAnimation();
        existing.cancelAnimation = undefined;
      }
      existing.sprite.texture = texture;
      existing.sprite.anchor.set(placement.anchorX, placement.anchorY);
      existing.currentVariant = variant;
      existing.currentSpriteId = variant;

      const startX = existing.container.x;
      const startY = existing.container.y;
      const startScaleX = existing.container.scale.x;
      const startScaleY = existing.container.scale.y;
      const startRot = existing.container.rotation;
      const startAlpha = existing.container.alpha;

      const deltaX = placement.x - startX;
      const deltaY = placement.y - startY;
      const deltaScaleX = targetScaleX - startScaleX;
      const deltaScaleY = targetScaleY - startScaleY;
      const deltaRot = targetRotation - startRot;
      const deltaAlpha = targetAlpha - startAlpha;

      const hasChange =
        Math.abs(deltaX) > 0.5 ||
        Math.abs(deltaY) > 0.5 ||
        Math.abs(deltaScaleX) > 0.001 ||
        Math.abs(deltaScaleY) > 0.001 ||
        Math.abs(deltaRot) > 0.001 ||
        Math.abs(deltaAlpha) > 0.01 ||
        Boolean(transition);

      if (hasChange && duration > 0) {
        existing.animating = true;
        let cancelled = false;
        existing.cancelAnimation = () => {
          cancelled = true;
          existing.animating = false;
        };

        const startTime = performance.now();

        const animate = (now: number) => {
          if (cancelled) return;
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const ease = easingFn(progress);

          let curX = startX + deltaX * ease;
          let curY = startY + deltaY * ease;
          let curScaleX = startScaleX + deltaScaleX * ease;
          let curScaleY = startScaleY + deltaScaleY * ease;
          let curRot = startRot + deltaRot * ease;
          const curAlpha = startAlpha + deltaAlpha * ease;

          // Animation Presets
          if (transition === 'shake') {
            const shakeOffset = Math.sin(progress * Math.PI * 10) * (1 - progress) * 20;
            curX += shakeOffset;
          } else if (transition === 'hop') {
            const hopOffset = -Math.sin(progress * Math.PI) * 45;
            curY += hopOffset;
          } else if (transition === 'bounce') {
            const bounceOffset = -Math.abs(Math.sin(progress * Math.PI * 3)) * (1 - progress) * 35;
            curY += bounceOffset;
          } else if (transition === 'wobble') {
            const wobbleOffset =
              Math.sin(progress * Math.PI * 6) * (1 - progress) * ((10 * Math.PI) / 180);
            curRot += wobbleOffset;
          } else if (transition === 'pop') {
            const popScaleFactor = 1 + Math.sin(progress * Math.PI) * 0.15;
            curScaleX *= popScaleFactor;
            curScaleY *= popScaleFactor;
          } else if (transition === 'zoom') {
            const zoomScaleFactor = 1 + Math.sin(progress * Math.PI) * 0.15;
            curScaleX *= zoomScaleFactor;
            curScaleY *= zoomScaleFactor;
          }

          existing.container.x = curX;
          existing.container.y = curY;
          existing.container.scale.x = curScaleX;
          existing.container.scale.y = curScaleY;
          existing.container.rotation = curRot;
          existing.container.alpha = curAlpha;

          if (progress < 1) {
            safeRequestAnimationFrame(animate);
          } else {
            existing.container.x = placement.x;
            existing.container.y = placement.y;
            existing.container.scale.x = targetScaleX;
            existing.container.scale.y = targetScaleY;
            existing.container.rotation = targetRotation;
            existing.container.alpha = targetAlpha;
            existing.targetX = placement.x;
            existing.targetY = placement.y;
            existing.targetScaleX = targetScaleX;
            existing.targetScaleY = targetScaleY;
            existing.targetRotation = targetRotation;
            existing.targetAlpha = targetAlpha;
            existing.animating = false;
            existing.cancelAnimation = undefined;
          }
        };
        safeRequestAnimationFrame(animate);
      } else {
        existing.container.x = placement.x;
        existing.container.y = placement.y;
        existing.container.scale.x = targetScaleX;
        existing.container.scale.y = targetScaleY;
        existing.container.rotation = targetRotation;
        existing.container.alpha = targetAlpha;
        existing.targetX = placement.x;
        existing.targetY = placement.y;
        existing.targetScaleX = targetScaleX;
        existing.targetScaleY = targetScaleY;
        existing.targetRotation = targetRotation;
        existing.targetAlpha = targetAlpha;
        existing.animating = false;
      }
    } else {
      // Sprite mới: xuất hiện
      const container = new Container();
      container.x = placement.x;
      container.y = placement.y;
      container.scale.x = targetScaleX;
      container.scale.y = targetScaleY;
      container.rotation = targetRotation;
      container.alpha = duration > 0 ? 0 : targetAlpha;

      const sprite = new Sprite(texture);
      sprite.anchor.set(placement.anchorX, placement.anchorY);
      container.addChild(sprite);

      this.characterContainer.addChild(container);

      const managed: ManagedSprite = {
        targetId,
        currentVariant: variant,
        characterId: targetId,
        currentSpriteId: variant,
        container,
        sprite,
        targetX: placement.x,
        targetY: placement.y,
        targetScaleX,
        targetScaleY,
        targetRotation,
        targetAlpha,
        animating: duration > 0,
      };
      this.activeSprites.set(targetId, managed);

      if (duration > 0) {
        let cancelled = false;
        managed.cancelAnimation = () => {
          cancelled = true;
          managed.animating = false;
        };

        const startTime = performance.now();

        const animate = (now: number) => {
          if (cancelled) return;
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          const ease = easingFn(progress);

          container.alpha = targetAlpha * ease;

          let curX = placement.x;
          let curY = placement.y;
          let curScaleX = targetScaleX;
          let curScaleY = targetScaleY;
          let curRot = targetRotation;

          if (transition === 'shake') {
            curX += Math.sin(progress * Math.PI * 10) * (1 - progress) * 20;
          } else if (transition === 'hop') {
            curY += -Math.sin(progress * Math.PI) * 45;
          } else if (transition === 'bounce') {
            const bounceFall = (1 - ease) * 100;
            const bounceRebound = Math.abs(Math.sin(progress * Math.PI * 3)) * (1 - progress) * 30;
            curY -= bounceFall - bounceRebound;
          } else if (transition === 'wobble') {
            curRot += Math.sin(progress * Math.PI * 6) * (1 - progress) * ((15 * Math.PI) / 180);
          } else if (transition === 'pop') {
            const popScaleFactor = ease * (1 + Math.sin(progress * Math.PI) * 0.2);
            curScaleX = targetScaleX * popScaleFactor;
            curScaleY = targetScaleY * popScaleFactor;
          } else if (transition === 'zoom') {
            curScaleX = targetScaleX * ease;
            curScaleY = targetScaleY * ease;
          } else if (transition === 'slide' || transition === 'slide_left') {
            curX -= this.baseWidth * 0.2 * (1 - ease);
          } else if (transition === 'slide_right') {
            curX += this.baseWidth * 0.2 * (1 - ease);
          } else if (transition === 'slide_up') {
            curY += this.baseHeight * 0.2 * (1 - ease);
          } else if (transition === 'slide_down') {
            curY -= this.baseHeight * 0.2 * (1 - ease);
          } else if (transition && transition !== 'fade' && transition !== 'dissolve') {
            console.warn(`[Renderer] Unknown transition "${transition}", falling back to fade.`);
          }

          container.x = curX;
          container.y = curY;
          container.scale.x = curScaleX;
          container.scale.y = curScaleY;
          container.rotation = curRot;

          if (progress < 1) {
            safeRequestAnimationFrame(animate);
          } else {
            container.alpha = targetAlpha;
            container.x = placement.x;
            container.y = placement.y;
            container.scale.x = targetScaleX;
            container.scale.y = targetScaleY;
            container.rotation = targetRotation;
            managed.animating = false;
            managed.cancelAnimation = undefined;
          }
        };
        safeRequestAnimationFrame(animate);
      } else {
        container.alpha = targetAlpha;
        managed.animating = false;
      }
    }
  }

  /**
   * Ẩn sprite khỏi sân khấu: Fade-out mượt mà
   */
  public hideSprite(
    targetId: string,
    durationSec = 0.25,
    _transition?: string,
    _easing?: string,
  ): void {
    const key = this.activeSprites.has(targetId)
      ? targetId
      : this.activeSprites.has(targetId.toLowerCase())
        ? targetId.toLowerCase()
        : targetId;
    const managed = this.activeSprites.get(key);
    if (!managed) return;

    if (managed.cancelAnimation) {
      managed.cancelAnimation();
      managed.cancelAnimation = undefined;
    }
    this.activeSprites.delete(key);
    const container = managed.container;

    if (durationSec <= 0) {
      this.characterContainer.removeChild(container);
      container.destroy({ children: true });
      return;
    }

    const startTime = performance.now();
    const duration = durationSec * 1000;
    const initialAlpha = container.alpha;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      container.alpha = initialAlpha * (1 - progress);

      if (progress < 1) {
        safeRequestAnimationFrame(animate);
      } else {
        this.characterContainer.removeChild(container);
        container.destroy({ children: true });
      }
    };
    safeRequestAnimationFrame(animate);
  }

  public hasSprite(targetId: string): boolean {
    return this.activeSprites.has(targetId) || this.activeSprites.has(targetId.toLowerCase());
  }

  /**
   * @deprecated Dùng showSprite thay thế
   */
  public async showCharacter(
    instr: ShowInstruction,
    assetResolver?: AssetGraphicResolver,
    _isProp = false,
  ): Promise<void> {
    return this.showSprite(instr, assetResolver);
  }

  /**
   * @deprecated Dùng hideSprite thay thế
   */
  public hideCharacter(characterId: string, durationSec = 0.25): void {
    this.hideSprite(characterId, durationSec);
  }

  /**
   * @deprecated Dùng hasSprite thay thế
   */
  public hasCharacter(characterId: string): boolean {
    return this.hasSprite(characterId);
  }

  public getCurrentBackgroundId(): string | null {
    return this.currentBackgroundId;
  }

  /**
   * Đồng bộ hóa tức thì trạng thái đồ họa (State Catch-up khi Rollback hoặc Load game)
   */
  public async syncStateCatchUp(
    catchUp: CatchUpVisualState,
    assetResolver?: AssetGraphicResolver,
    _isPropChecker?: unknown,
  ): Promise<void> {
    // 1. Đồng bộ Background tức thì
    if (catchUp.background) {
      await this.setBackground({ ...catchUp.background, duration: 0 }, undefined, assetResolver);
    } else {
      this.backgroundContainer.removeChildren();
      this.currentBackgroundId = null;
      this.currentBackgroundSprite = null;
    }

    // 2. Xóa bỏ những sprite không còn trong danh sách catch-up
    for (const [id, managed] of this.activeSprites.entries()) {
      if (!catchUp.sprites.has(id) && (!managed.targetId || !catchUp.sprites.has(managed.targetId))) {
        if (managed.cancelAnimation) {
          managed.cancelAnimation();
          managed.cancelAnimation = undefined;
        }
        this.characterContainer.removeChild(managed.container);
        managed.container.destroy({ children: true });
        this.activeSprites.delete(id);
      }
    }

    // 3. Đặt lại vị trí và texture của những sprite cần hiển thị
    for (const [key, showInstr] of catchUp.sprites.entries()) {
      const targetId = showInstr.targetId || (showInstr as { character?: string }).character || key;
      await this.showSprite({ ...showInstr, targetId, duration: 0 }, assetResolver);
    }
  }

  /**
   * Chụp ảnh màn hình thu nhỏ (Thumbnail Base64) cho màn hình Save / Load
   */
  public async captureThumbnail(targetWidth = 320, targetHeight = 180): Promise<string> {
    const canvas = this.app.canvas;
    if (!canvas) return '';

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = targetWidth;
    thumbCanvas.height = targetHeight;
    const ctx = thumbCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
      return thumbCanvas.toDataURL('image/jpeg', 0.8);
    }
    return '';
  }

  /**
   * Tạo Texture phông nền phác thảo Wireframe (Blueprint Canvas)
   */
  private async resolveOrGenerateBackgroundTexture(
    assetId: string,
    assetResolver?: AssetGraphicResolver,
  ): Promise<Texture> {
    const url = assetResolver?.(assetId);
    if (url) {
      try {
        const loadParam = url.startsWith('blob:')
          ? { src: url, parser: 'loadTextures' }
          : url;
        const tex = await Assets.load<Texture>(loadParam);
        if (tex) {
          return tex;
        }
      } catch {
        // Fallback về phác thảo nếu tải ảnh thất bại
      }
    }

    if (this.placeholderMode === 'transparent') {
      return Texture.EMPTY;
    }

    const cacheKey = `bg_${assetId}_${this.baseWidth}_${this.baseHeight}`;
    const cached = this.placeholderTextures.get(cacheKey);
    if (cached) return cached;

    // Sinh Texture Canvas Wireframe đơn sắc chuẩn Swiss
    if (typeof document === 'undefined') {
      const tex = new Texture({
        source: Texture.WHITE.source,
        orig: new Rectangle(0, 0, this.baseWidth, this.baseHeight),
      });
      this.placeholderTextures.set(cacheKey, tex);
      return tex;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.baseWidth;
    canvas.height = this.baseHeight;
    const ctx = canvas.getContext('2d')!;

    // Nền trắng
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.baseWidth, this.baseHeight);

    // Lưới kỹ thuật màu đen (Swiss Architectural Grid - 40px)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < this.baseWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.baseHeight);
      ctx.stroke();
    }
    for (let y = 0; y < this.baseHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.baseWidth, y);
      ctx.stroke();
    }

    // Lưới kỹ thuật phân đoạn lớn (Major Grid - 160px) màu đen rõ nét hơn
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    const majorGridSize = 160;
    for (let x = 0; x < this.baseWidth; x += majorGridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.baseHeight);
      ctx.stroke();
    }
    for (let y = 0; y < this.baseHeight; y += majorGridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.baseWidth, y);
      ctx.stroke();
    }

    // Khung viền kỹ thuật màu đen bao quanh
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, 20, this.baseWidth - 40, this.baseHeight - 40);

    // Hộp nhãn tên cảnh (Trắng viền đen 2px, chữ đen)
    const badgeW = 460;
    const badgeH = 74;
    const badgeX = this.baseWidth / 2 - badgeW / 2;
    const badgeY = this.baseHeight / 2 - badgeH / 2 - 20;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = '#000000';
    ctx.font = '700 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`[ SCENE // ${assetId.toUpperCase()} ]`, this.baseWidth / 2, badgeY + 26);

    ctx.fillStyle = '#555555';
    ctx.font = '500 12px monospace';
    ctx.fillText(
      '// WIREFRAME BACKGROUND (WHITE WITH BLACK GRID)',
      this.baseWidth / 2,
      badgeY + 52,
    );

    const generated = Texture.from(canvas);
    this.placeholderTextures.set(cacheKey, generated);
    return generated;
  }

  /**
   * Tạo Texture Sprite phác thảo Wireframe chuẩn hóa kích thước 360x600 (Swiss Minimalist Card)
   */
  private async resolveOrGenerateSpriteTexture(
    targetId: string,
    variant?: string,
    assetResolver?: AssetGraphicResolver,
  ): Promise<Texture> {
    let url: string | undefined;
    if (assetResolver) {
      try {
        url = assetResolver(targetId, variant);
      } catch {
        // ignore
      }
    }

    if (url) {
      try {
        const loadParam = url.startsWith('blob:')
          ? { src: url, parser: 'loadTextures' }
          : url;
        const tex = await Assets.load<Texture>(loadParam);
        if (tex) {
          return tex;
        }
      } catch {
        // Fallback về phác thảo
      }
    }

    if (this.placeholderMode === 'transparent') {
      return Texture.EMPTY;
    }

    const cacheKey = `sprite_${targetId}_${variant || 'default'}`;
    const cached = this.placeholderTextures.get(cacheKey);
    if (cached) return cached;

    const w = 360;
    const h = 600;

    if (typeof document === 'undefined') {
      const tex = new Texture({
        source: Texture.WHITE.source,
        orig: new Rectangle(0, 0, w, h),
      });
      this.placeholderTextures.set(cacheKey, tex);
      return tex;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Khung card nhân vật / đạo cụ: Nền trắng, viền đen 2px sắc nét
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 8, w - 16, h - 16);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // Header thẻ (Khối đen chữ trắng tương phản cao)
    ctx.fillStyle = '#000000';
    ctx.fillRect(8, 8, w - 16, 42);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(targetId.toUpperCase(), w / 2, 29);

    // Nhãn biểu cảm / variant bên dưới header
    ctx.fillStyle = '#000000';
    ctx.font = '700 12px monospace';
    ctx.fillText(`[ SPRITE // ${(variant || 'default').toUpperCase()} ]`, w / 2, 68);

    // Đường kẻ phân cách kỹ thuật
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 86);
    ctx.lineTo(w - 20, 86);
    ctx.stroke();

    // Hình bóng nhân vật phác thảo: Khối xám nhạt viền đen sắc nét
    ctx.fillStyle = '#e8e8e8';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;

    // Đầu (Head)
    ctx.beginPath();
    ctx.arc(w / 2, 142, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Thân (Torso)
    ctx.beginPath();
    ctx.moveTo(w / 2 - 38, 192);
    ctx.lineTo(w / 2 + 38, 192);
    ctx.lineTo(w / 2 + 62, 385);
    ctx.lineTo(w / 2 - 62, 385);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Đường kẻ giữa ngực
    ctx.beginPath();
    ctx.moveTo(w / 2, 192);
    ctx.lineTo(w / 2, 280);
    ctx.stroke();

    // Chân (Legs)
    ctx.fillRect(w / 2 - 42, 395, 34, 160);
    ctx.strokeRect(w / 2 - 42, 395, 34, 160);
    ctx.fillRect(w / 2 + 8, 395, 34, 160);
    ctx.strokeRect(w / 2 + 8, 395, 34, 160);

    // Chú thích kỹ thuật Wireframe dưới đáy
    ctx.fillStyle = '#888888';
    ctx.font = '500 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPRITE // WIREFRAME MANNEQUIN', w / 2, h - 20);

    const spriteTex = Texture.from(canvas);
    this.placeholderTextures.set(cacheKey, spriteTex);
    return spriteTex;
  }

  /**
   * Dọn dẹp tài nguyên
   */
  public destroy(): void {
    this.activeSprites.clear();
    for (const tex of this.placeholderTextures.values()) {
      try {
        tex.destroy(true);
      } catch {
        // Bỏ qua lỗi destroy trên texture đã được giải phóng
      }
    }
    this.placeholderTextures.clear();
    try {
      this.app.destroy(true, { children: true, texture: true });
    } catch {
      // Bỏ qua lỗi destroy trên môi trường headless/node test không có window listener
    }
  }
}
