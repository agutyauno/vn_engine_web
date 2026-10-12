// ==========================================
// TẦNG HIỂN THỊ ĐỒ HỌA 2D (PIXIJS - ADR-018)
// ==========================================

import { Application, Container, Sprite, Texture, Assets } from 'pixi.js';
import type { ShowInstruction, BackgroundInstruction } from '@vn-engine/shared-types';
import {
  resolveCharacterPlacement,
  EASING_FUNCTIONS,
  type EasingFunction,
  type AssetGraphicResolver,
  type CatchUpVisualState,
  type RendererOptions,
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

interface ManagedCharacter {
  characterId: string;
  currentSpriteId: string;
  container: Container;
  sprite: Sprite;
  targetX: number;
  targetY: number;
  targetScaleX: number;
  targetScaleY: number;
  targetRotation: number;
  targetAlpha: number;
  animating: boolean;
  cancelAnimation?: () => void;
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

  private backgroundContainer: Container;
  private characterContainer: Container;
  private activeCharacters: Map<string, ManagedCharacter> = new Map();
  private currentBackgroundId: string | null = null;
  private currentBackgroundSprite: Sprite | null = null;
  private placeholderTextures: Map<string, Texture> = new Map();

  private isInitialized = false;

  constructor(options?: RendererOptions) {
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

    await this.app.init({
      width: this.baseWidth,
      height: this.baseHeight,
      backgroundColor: options?.backgroundColor ?? 0xffffff, // Trắng chuẩn Swiss Wireframe
      antialias: options?.antialias ?? true,
      autoDensity: true,
      resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      preserveDrawingBuffer: true,
    });

    // Thêm các tầng theo đúng thứ tự hiển thị: Nền -> Nhân vật
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
    const texWidth = texture.width || this.baseWidth;
    const texHeight = texture.height || this.baseHeight;
    const baseCoverScale = Math.max(this.baseWidth / texWidth, this.baseHeight / texHeight);
    const finalScaleX = baseCoverScale * targetScaleX;
    const finalScaleY = baseCoverScale * targetScaleY;

    const newSprite = new Sprite(texture);
    newSprite.anchor.set(0.5, 0.5);
    newSprite.x = targetX;
    newSprite.y = targetY;
    newSprite.scale.x = finalScaleX;
    newSprite.scale.y = finalScaleY;
    newSprite.rotation = targetRotation;
    newSprite.alpha = targetAlpha;

    const oldSprite = this.currentBackgroundSprite;
    this.currentBackgroundId = assetId;
    this.currentBackgroundSprite = newSprite;

    if (oldSprite && duration > 0) {
      newSprite.alpha = 0;
      this.backgroundContainer.addChild(newSprite);

      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease = easingFn(progress);

        if (trans === 'zoom') {
          newSprite.alpha = targetAlpha * progress;
          oldSprite.alpha = 1 - progress;
          const currentZoom = 1.1 - 0.1 * ease;
          newSprite.scale.x = finalScaleX * currentZoom;
          newSprite.scale.y = finalScaleY * currentZoom;
        } else if (trans === 'slide' || trans === 'slide_left') {
          newSprite.alpha = targetAlpha;
          oldSprite.x = targetX - this.baseWidth * ease;
          newSprite.x = targetX + this.baseWidth * (1 - ease);
        } else if (trans === 'slide_right') {
          newSprite.alpha = targetAlpha;
          oldSprite.x = targetX + this.baseWidth * ease;
          newSprite.x = targetX - this.baseWidth * (1 - ease);
        } else if (trans === 'slide_up') {
          newSprite.alpha = targetAlpha;
          oldSprite.y = targetY - this.baseHeight * ease;
          newSprite.y = targetY + this.baseHeight * (1 - ease);
        } else if (trans === 'slide_down') {
          newSprite.alpha = targetAlpha;
          oldSprite.y = targetY + this.baseHeight * ease;
          newSprite.y = targetY - this.baseHeight * (1 - ease);
        } else if (trans === 'shake') {
          newSprite.alpha = targetAlpha * progress;
          oldSprite.alpha = 1 - progress;
          newSprite.x = targetX + Math.sin(progress * Math.PI * 10) * (1 - progress) * 25;
        } else {
          // fade / dissolve / default
          if (trans && trans !== 'fade' && trans !== 'dissolve') {
            console.warn(
              `[Renderer] Unknown background transition "${trans}", falling back to fade.`,
            );
          }
          newSprite.alpha = targetAlpha * progress;
          oldSprite.alpha = 1 - progress;
        }

        if (progress < 1) {
          safeRequestAnimationFrame(animate);
        } else {
          newSprite.x = targetX;
          newSprite.y = targetY;
          newSprite.scale.x = finalScaleX;
          newSprite.scale.y = finalScaleY;
          newSprite.alpha = targetAlpha;
          this.backgroundContainer.removeChild(oldSprite);
          oldSprite.destroy();
        }
      };
      safeRequestAnimationFrame(animate);
    } else {
      this.backgroundContainer.removeChildren();
      if (oldSprite) oldSprite.destroy();
      this.backgroundContainer.addChild(newSprite);
    }
  }

  /**
   * Hiển thị nhân vật (SHOW Statement - ADR-018):
   * - Hỗ trợ đầy đủ phóng to/thu nhỏ (scale, scaleX, scaleY), xoay (rotate), lật (flipX, flipY),
   *   tọa độ số x/y, offset pixel, độ trong suốt (alpha).
   * - Hỗ trợ nhiều dạng animation phong phú: slide, fade, shake, hop, bounce, wobble, pop, zoom
   *   kết hợp các hàm easing (linear, ease_in, ease_out, ease_in_out, bounce, elastic).
   */
  public async showCharacter(
    instr: ShowInstruction,
    assetResolver?: AssetGraphicResolver,
    isProp = false,
  ): Promise<void> {
    const coords = resolveCharacterPlacement(instr, this.baseWidth, this.baseHeight, isProp);
    const { scaleX: targetScaleX, scaleY: targetScaleY } = computeTargetScale(
      instr.scale,
      instr.scaleX,
      instr.scaleY,
      instr.flipX,
      instr.flipY,
    );
    const targetRotation = computeTargetRotation(instr.rotate);
    const targetAlpha = instr.alpha ?? 1.0;
    const duration = instr.duration !== undefined ? instr.duration * 1000 : 350;
    const transition = instr.transition;
    const easingKey = (instr.easing ?? 'ease_out').toLowerCase();
    const easingFn: EasingFunction = EASING_FUNCTIONS[easingKey] ?? defaultEaseOut;

    const existing = this.activeCharacters.get(instr.character);
    const texture = await this.resolveOrGenerateCharacterTexture(
      instr.character,
      instr.sprite,
      assetResolver,
      isProp,
    );

    if (existing) {
      if (existing.cancelAnimation) {
        existing.cancelAnimation();
        existing.cancelAnimation = undefined;
      }

      existing.sprite.texture = texture;
      existing.sprite.anchor.set(0.5, isProp ? 0.5 : 1.0);
      existing.currentSpriteId = instr.sprite;

      const startX = existing.container.x;
      const startY = existing.container.y;
      const startScaleX = existing.container.scale.x;
      const startScaleY = existing.container.scale.y;
      const startRot = existing.container.rotation;
      const startAlpha = existing.container.alpha;

      const deltaX = coords.x - startX;
      const deltaY = coords.y - startY;
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
            existing.container.x = coords.x;
            existing.container.y = coords.y;
            existing.container.scale.x = targetScaleX;
            existing.container.scale.y = targetScaleY;
            existing.container.rotation = targetRotation;
            existing.container.alpha = targetAlpha;
            existing.targetX = coords.x;
            existing.targetY = coords.y;
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
        existing.container.x = coords.x;
        existing.container.y = coords.y;
        existing.container.scale.x = targetScaleX;
        existing.container.scale.y = targetScaleY;
        existing.container.rotation = targetRotation;
        existing.container.alpha = targetAlpha;
        existing.targetX = coords.x;
        existing.targetY = coords.y;
        existing.targetScaleX = targetScaleX;
        existing.targetScaleY = targetScaleY;
        existing.targetRotation = targetRotation;
        existing.targetAlpha = targetAlpha;
        existing.animating = false;
      }
    } else {
      // Nhân vật mới: Xuất hiện
      const container = new Container();
      container.x = coords.x;
      container.y = coords.y;
      container.scale.x = targetScaleX;
      container.scale.y = targetScaleY;
      container.rotation = targetRotation;
      container.alpha = 0;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, isProp ? 0.5 : 1.0); // Neo tại đáy giữa (chân nhân vật) hoặc tâm (đạo cụ)
      container.addChild(sprite);

      this.characterContainer.addChild(container);

      const managed: ManagedCharacter = {
        characterId: instr.character,
        currentSpriteId: instr.sprite,
        container,
        sprite,
        targetX: coords.x,
        targetY: coords.y,
        targetScaleX,
        targetScaleY,
        targetRotation,
        targetAlpha,
        animating: true,
      };
      this.activeCharacters.set(instr.character, managed);

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

          let curX = coords.x;
          let curY = coords.y;
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
            container.x = coords.x;
            container.y = coords.y;
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
   * Ẩn nhân vật (HIDE Statement): Fade-out mượt mà
   */
  public hideCharacter(characterId: string, durationSec = 0.25): void {
    const managed = this.activeCharacters.get(characterId);
    if (!managed) return;

    this.activeCharacters.delete(characterId);
    const container = managed.container;

    const startTime = performance.now();
    const duration = durationSec * 1000;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      container.alpha = 1 - progress;

      if (progress < 1) {
        safeRequestAnimationFrame(animate);
      } else {
        this.characterContainer.removeChild(container);
        container.destroy({ children: true });
      }
    };
    safeRequestAnimationFrame(animate);
  }

  public getCurrentBackgroundId(): string | null {
    return this.currentBackgroundId;
  }

  public hasCharacter(characterId: string): boolean {
    return this.activeCharacters.has(characterId.toLowerCase());
  }

  /**
   * Đồng bộ hóa tức thì trạng thái đồ họa (State Catch-up khi Rollback hoặc Load game)
   */
  public async syncStateCatchUp(
    catchUp: CatchUpVisualState,
    assetResolver?: AssetGraphicResolver,
    isPropChecker?: (characterId: string) => boolean,
  ): Promise<void> {
    // 1. Đồng bộ Background tức thì
    if (catchUp.background) {
      await this.setBackground({ ...catchUp.background, duration: 0 }, undefined, assetResolver);
    } else {
      this.backgroundContainer.removeChildren();
      this.currentBackgroundId = null;
      this.currentBackgroundSprite = null;
    }

    // 2. Xóa bỏ những nhân vật không còn trong danh sách catch-up
    for (const [charId, managed] of this.activeCharacters.entries()) {
      if (!catchUp.sprites.has(charId)) {
        if (managed.cancelAnimation) managed.cancelAnimation();
        this.characterContainer.removeChild(managed.container);
        managed.container.destroy({ children: true });
        this.activeCharacters.delete(charId);
      }
    }

    // 3. Đặt lại vị trí và texture của những nhân vật cần hiển thị
    for (const [charId, showInstr] of catchUp.sprites.entries()) {
      const isProp = isPropChecker?.(charId) ?? false;
      const coords = resolveCharacterPlacement(showInstr, this.baseWidth, this.baseHeight, isProp);
      const { scaleX: targetScaleX, scaleY: targetScaleY } = computeTargetScale(
        showInstr.scale,
        showInstr.scaleX,
        showInstr.scaleY,
        showInstr.flipX,
        showInstr.flipY,
      );
      const targetRotation = computeTargetRotation(showInstr.rotate);
      const targetAlpha = showInstr.alpha ?? 1.0;

      const texture = await this.resolveOrGenerateCharacterTexture(
        charId,
        showInstr.sprite,
        assetResolver,
        isProp,
      );

      const existing = this.activeCharacters.get(charId);
      if (existing) {
        if (existing.cancelAnimation) existing.cancelAnimation();
        existing.sprite.texture = texture;
        existing.sprite.anchor.set(0.5, isProp ? 0.5 : 1.0);
        existing.currentSpriteId = showInstr.sprite;
        existing.container.x = coords.x;
        existing.container.y = coords.y;
        existing.container.scale.x = targetScaleX;
        existing.container.scale.y = targetScaleY;
        existing.container.rotation = targetRotation;
        existing.container.alpha = targetAlpha;
        existing.targetX = coords.x;
        existing.targetY = coords.y;
        existing.targetScaleX = targetScaleX;
        existing.targetScaleY = targetScaleY;
        existing.targetRotation = targetRotation;
        existing.targetAlpha = targetAlpha;
        existing.animating = false;
        existing.cancelAnimation = undefined;
      } else {
        const container = new Container();
        container.x = coords.x;
        container.y = coords.y;
        container.scale.x = targetScaleX;
        container.scale.y = targetScaleY;
        container.rotation = targetRotation;
        container.alpha = targetAlpha;

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, isProp ? 0.5 : 1.0);
        container.addChild(sprite);

        this.characterContainer.addChild(container);
        this.activeCharacters.set(charId, {
          characterId: charId,
          currentSpriteId: showInstr.sprite,
          container,
          sprite,
          targetX: coords.x,
          targetY: coords.y,
          targetScaleX,
          targetScaleY,
          targetRotation,
          targetAlpha,
          animating: false,
        });
      }
    }
  }

  /**
   * Chụp ảnh màn hình thu nhỏ (Thumbnail Base64) cho màn hình Save / Load
   */
  public async captureThumbnail(targetWidth = 320, targetHeight = 180): Promise<string> {
    const canvas = this.app.canvas;
    if (!canvas) return '';

    // Tạo canvas phụ để resize xuống kích thước thumbnail tiết kiệm dung lượng
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
        const tex = await Assets.load<Texture>(url);
        return tex;
      } catch {
        // Fallback về phác thảo nếu tải ảnh thất bại
      }
    }

    const cacheKey = `bg_${assetId}_${this.baseWidth}_${this.baseHeight}`;
    const cached = this.placeholderTextures.get(cacheKey);
    if (cached) return cached;

    // Sinh Texture Canvas Wireframe đơn sắc chuẩn Swiss
    if (typeof document === 'undefined') {
      return Texture.WHITE;
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
   * Tạo Texture nhân vật phác thảo Wireframe (Character Silhouette Card)
   * Phong cách Swiss tối giản: Đen - Trắng, không bo góc, không viền neon.
   */
  private async resolveOrGenerateCharacterTexture(
    characterId: string,
    spriteId: string,
    assetResolver?: AssetGraphicResolver,
    isProp = false,
  ): Promise<Texture> {
    const fullAssetId = `${characterId}_${spriteId}`;
    const url = assetResolver?.(fullAssetId) ?? assetResolver?.(characterId);
    if (url) {
      try {
        const tex = await Assets.load<Texture>(url);
        return tex;
      } catch {
        // Fallback về wireframe silhouette
      }
    }

    const cacheKey = `char_${characterId}_${spriteId}_${isProp}`;
    const cached = this.placeholderTextures.get(cacheKey);
    if (cached) return cached;

    if (typeof document === 'undefined') {
      return Texture.WHITE;
    }

    if (isProp) {
      const w = 400;
      const h = 400;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 8, w - 16, h - 16);

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, w - 16, h - 16);

      ctx.fillStyle = '#000000';
      ctx.fillRect(8, 8, w - 16, 42);

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(characterId.toUpperCase(), w / 2, 29);

      ctx.fillStyle = '#000000';
      ctx.font = '700 12px monospace';
      ctx.fillText('[ PROP / ITEM ]', w / 2, 70);

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 100, w - 80, h - 140);

      ctx.fillStyle = '#555555';
      ctx.font = '500 14px monospace';
      ctx.fillText('// ASSET IMAGE', w / 2, h / 2 + 10);

      const propTex = Texture.from(canvas);
      this.placeholderTextures.set(cacheKey, propTex);
      return propTex;
    }

    const w = 320;
    const h = 560;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Khung card nhân vật: Nền trắng, viền đen rõ nét đồng bộ với Background trắng
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 8, w - 16, h - 16);

    // Viền đen 2px sắc nét (Swiss architectural outline)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // Header thẻ nhân vật (Khối đen với chữ trắng tương phản cao)
    ctx.fillStyle = '#000000';
    ctx.fillRect(8, 8, w - 16, 42);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(characterId.toUpperCase(), w / 2, 29);

    // Nhãn biểu cảm bên dưới header (chữ đen sắc nét)
    ctx.fillStyle = '#000000';
    ctx.font = '700 12px monospace';
    ctx.fillText(`[ SPRITE // ${spriteId.toUpperCase()} ]`, w / 2, 68);

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

    // Đầu (Head - Mannequin Silhouette phẳng tối giản)
    ctx.beginPath();
    ctx.arc(w / 2, 142, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Thân (Torso)
    ctx.fillStyle = '#e8e8e8';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 38, 192);
    ctx.lineTo(w / 2 + 38, 192);
    ctx.lineTo(w / 2 + 62, 365);
    ctx.lineTo(w / 2 - 62, 365);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chi tiết áo / đường kẻ giữa ngực
    ctx.beginPath();
    ctx.moveTo(w / 2, 192);
    ctx.lineTo(w / 2, 270);
    ctx.stroke();

    // Chân (Legs)
    ctx.fillRect(w / 2 - 42, 375, 34, 140);
    ctx.strokeRect(w / 2 - 42, 375, 34, 140);
    ctx.fillRect(w / 2 + 8, 375, 34, 140);
    ctx.strokeRect(w / 2 + 8, 375, 34, 140);

    // Chú thích kỹ thuật Wireframe dưới đáy
    ctx.fillStyle = '#888888';
    ctx.font = '500 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CHAR // WIREFRAME MANNEQUIN', w / 2, h - 20);

    const charTex = Texture.from(canvas);
    this.placeholderTextures.set(cacheKey, charTex);
    return charTex;
  }

  /**
   * Dọn dẹp tài nguyên
   */
  public destroy(): void {
    this.activeCharacters.clear();
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
