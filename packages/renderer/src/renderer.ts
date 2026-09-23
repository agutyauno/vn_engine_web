// ==========================================
// TẦNG HIỂN THỊ ĐỒ HỌA 2D (PIXIJS - ADR-018)
// ==========================================

import { Application, Container, Sprite, Texture, Assets } from 'pixi.js';
import type { ShowInstruction } from '@vn-engine/shared-types';
import {
  resolveCharacterCoordinates,
  type AssetGraphicResolver,
  type CatchUpVisualState,
  type RendererOptions,
} from './types';

interface ManagedCharacter {
  characterId: string;
  currentSpriteId: string;
  container: Container;
  sprite: Sprite;
  targetX: number;
  targetY: number;
  animating: boolean;
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
   */
  public async setBackground(
    assetId: string,
    transition?: string,
    assetResolver?: AssetGraphicResolver,
  ): Promise<void> {
    if (this.currentBackgroundId === assetId && this.currentBackgroundSprite) {
      return;
    }

    const texture = await this.resolveOrGenerateBackgroundTexture(assetId, assetResolver);
    const newSprite = new Sprite(texture);
    newSprite.width = this.baseWidth;
    newSprite.height = this.baseHeight;

    const oldSprite = this.currentBackgroundSprite;
    this.currentBackgroundId = assetId;
    this.currentBackgroundSprite = newSprite;

    if (oldSprite && transition === 'fade') {
      newSprite.alpha = 0;
      this.backgroundContainer.addChild(newSprite);

      // Hiệu ứng Crossfade trong 400ms
      const startTime = performance.now();
      const duration = 400;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        newSprite.alpha = progress;
        oldSprite.alpha = 1 - progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.backgroundContainer.removeChild(oldSprite);
          oldSprite.destroy();
        }
      };
      requestAnimationFrame(animate);
    } else {
      this.backgroundContainer.removeChildren();
      if (oldSprite) oldSprite.destroy();
      newSprite.alpha = 1;
      this.backgroundContainer.addChild(newSprite);
    }
  }

  /**
   * Hiển thị nhân vật (SHOW Statement - ADR-018):
   * - Nếu chưa có trên màn hình: Áp dụng hiệu ứng xuất hiện (Fade-in).
   * - Nếu đã có trên màn hình: Áp dụng Tween trượt di chuyển (Slide).
   */
  public async showCharacter(
    instr: ShowInstruction,
    assetResolver?: AssetGraphicResolver,
  ): Promise<void> {
    const coords = resolveCharacterCoordinates(instr.position, this.baseWidth, this.baseHeight);
    const existing = this.activeCharacters.get(instr.character);

    const texture = await this.resolveOrGenerateCharacterTexture(
      instr.character,
      instr.sprite,
      assetResolver,
    );

    if (existing) {
      // Nhân vật đã có: Cập nhật biểu cảm và Tween Slide tới vị trí mới (ADR-018)
      existing.sprite.texture = texture;
      existing.currentSpriteId = instr.sprite;

      const startX = existing.container.x;
      const startY = existing.container.y;
      const deltaX = coords.x - startX;
      const deltaY = coords.y - startY;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        existing.animating = true;
        const startTime = performance.now();
        const duration = (instr.duration ?? 0.35) * 1000;

        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / duration);
          // Easing cubic out
          const ease = 1 - Math.pow(1 - progress, 3);

          existing.container.x = startX + deltaX * ease;
          existing.container.y = startY + deltaY * ease;

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            existing.container.x = coords.x;
            existing.container.y = coords.y;
            existing.animating = false;
          }
        };
        requestAnimationFrame(animate);
      } else {
        existing.container.x = coords.x;
        existing.container.y = coords.y;
      }
    } else {
      // Nhân vật mới: Xuất hiện với Fade-in
      const container = new Container();
      container.x = coords.x;
      container.y = coords.y;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1.0); // Neo tại đáy giữa (chân nhân vật)
      container.addChild(sprite);

      container.alpha = 0;
      this.characterContainer.addChild(container);

      const managed: ManagedCharacter = {
        characterId: instr.character,
        currentSpriteId: instr.sprite,
        container,
        sprite,
        targetX: coords.x,
        targetY: coords.y,
        animating: true,
      };
      this.activeCharacters.set(instr.character, managed);

      const startTime = performance.now();
      const duration = (instr.duration ?? 0.3) * 1000;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        container.alpha = progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          container.alpha = 1;
          managed.animating = false;
        }
      };
      requestAnimationFrame(animate);
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
        requestAnimationFrame(animate);
      } else {
        this.characterContainer.removeChild(container);
        container.destroy({ children: true });
      }
    };
    requestAnimationFrame(animate);
  }

  /**
   * Đồng bộ hóa tức thì trạng thái đồ họa (State Catch-up khi Rollback hoặc Load game)
   */
  public async syncStateCatchUp(
    catchUp: CatchUpVisualState,
    assetResolver?: AssetGraphicResolver,
  ): Promise<void> {
    // 1. Đồng bộ Background tức thì
    if (catchUp.background) {
      await this.setBackground(catchUp.background.assetId, undefined, assetResolver);
    } else {
      this.backgroundContainer.removeChildren();
      this.currentBackgroundId = null;
      this.currentBackgroundSprite = null;
    }

    // 2. Xóa bỏ những nhân vật không còn trong danh sách catch-up
    for (const [charId, managed] of this.activeCharacters.entries()) {
      if (!catchUp.sprites.has(charId)) {
        this.characterContainer.removeChild(managed.container);
        managed.container.destroy({ children: true });
        this.activeCharacters.delete(charId);
      }
    }

    // 3. Đặt lại vị trí và texture của những nhân vật cần hiển thị
    for (const [charId, showInstr] of catchUp.sprites.entries()) {
      const coords = resolveCharacterCoordinates(
        showInstr.position,
        this.baseWidth,
        this.baseHeight,
      );
      const texture = await this.resolveOrGenerateCharacterTexture(
        charId,
        showInstr.sprite,
        assetResolver,
      );

      const existing = this.activeCharacters.get(charId);
      if (existing) {
        existing.sprite.texture = texture;
        existing.currentSpriteId = showInstr.sprite;
        existing.container.x = coords.x;
        existing.container.y = coords.y;
        existing.container.alpha = 1;
        existing.animating = false;
      } else {
        const container = new Container();
        container.x = coords.x;
        container.y = coords.y;
        container.alpha = 1;

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 1.0);
        container.addChild(sprite);

        this.characterContainer.addChild(container);
        this.activeCharacters.set(charId, {
          characterId: charId,
          currentSpriteId: showInstr.sprite,
          container,
          sprite,
          targetX: coords.x,
          targetY: coords.y,
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

    return Texture.from(canvas);
  }

  /**
   * Tạo Texture nhân vật phác thảo Wireframe (Character Silhouette Card)
   * Phong cách Swiss tối giản: Đen - Trắng, không bo góc, không viền neon.
   */
  private async resolveOrGenerateCharacterTexture(
    characterId: string,
    spriteId: string,
    assetResolver?: AssetGraphicResolver,
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

    if (typeof document === 'undefined') {
      return Texture.WHITE;
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

    return Texture.from(canvas);
  }

  /**
   * Dọn dẹp tài nguyên
   */
  public destroy(): void {
    this.activeCharacters.clear();
    this.app.destroy(true, { children: true, texture: true });
  }
}
