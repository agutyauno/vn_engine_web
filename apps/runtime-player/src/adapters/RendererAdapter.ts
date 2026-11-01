// ============================================================================
// RENDERER ADAPTER (ADR-018)
// Cầu nối điều khiển GameRenderer (PixiJS), quản lý visual side effects,
// catch-up visual state và snapshot thumbnail chống lỗi canvas taint
// ============================================================================

import type { GameRenderer, CatchUpVisualState, AssetGraphicResolver } from '@vn-engine/renderer';
import type { Instruction, BackgroundInstruction, ShowInstruction, HideInstruction } from '@vn-engine/shared-types';

export interface RendererAdapterOptions {
  isPropChecker?: (id: string) => boolean;
  assetGraphicResolver?: AssetGraphicResolver;
}

export class RendererAdapter {
  private gameRenderer: GameRenderer;
  private options: RendererAdapterOptions;

  constructor(gameRenderer: GameRenderer, options?: RendererAdapterOptions) {
    this.gameRenderer = gameRenderer;
    this.options = options ?? {};
  }

  public async applySideEffect(instr: Instruction): Promise<void> {
    const defaultResolver: AssetGraphicResolver = (id: string) => id;
    const resolver = this.options.assetGraphicResolver ?? defaultResolver;

    switch (instr.type) {
      case 'BACKGROUND': {
        const bgInstr = instr as BackgroundInstruction;
        await this.gameRenderer.setBackground(bgInstr, bgInstr.transition, resolver);
        break;
      }
      case 'SHOW': {
        const showInstr = instr as ShowInstruction;
        const isProp = this.options.isPropChecker ? this.options.isPropChecker(showInstr.character) : false;
        await this.gameRenderer.showCharacter(showInstr, resolver, isProp);
        break;
      }
      case 'HIDE': {
        const hideInstr = instr as HideInstruction;
        this.gameRenderer.hideCharacter(hideInstr.character);
        break;
      }
      default:
        // HIDE_DIALOGUE, ASSIGN, PLAY,... bỏ qua an toàn không throw
        break;
    }
  }

  public async syncStateCatchUp(catchUp: CatchUpVisualState): Promise<void> {
    const defaultResolver: AssetGraphicResolver = (id: string) => id;
    const resolver = this.options.assetGraphicResolver ?? defaultResolver;
    const defaultPropChecker = (_id: string): boolean => false;
    const propChecker = this.options.isPropChecker ?? defaultPropChecker;
    await this.gameRenderer.syncStateCatchUp(catchUp, resolver, propChecker);
  }

  public async captureThumbnail(width = 320, height = 180): Promise<string> {
    try {
      return await this.gameRenderer.captureThumbnail(width, height);
    } catch {
      // Fallback blank 16:9 SVG placeholder data URL khi canvas bị taint (SecurityError) hoặc context lỗi
      return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="%231a1a1a"/></svg>`;
    }
  }
}
