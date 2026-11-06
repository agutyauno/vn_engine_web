// ============================================================================
// RENDERER ADAPTER (ADR-018)
// Cầu nối điều khiển GameRenderer (PixiJS), quản lý visual side effects,
// catch-up visual state và snapshot thumbnail chống lỗi canvas taint
// ============================================================================

import type { GameRenderer, CatchUpVisualState, AssetGraphicResolver } from '@vn-engine/renderer';
import type {
  Instruction,
  BackgroundInstruction,
  ShowInstruction,
  HideInstruction,
  SourceLocation,
} from '@vn-engine/shared-types';
import type { DiagnosticBus } from '../services/diagnosticBus';

export interface RendererAdapterOptions {
  isPropChecker?: (id: string) => boolean;
  assetGraphicResolver?: AssetGraphicResolver;
  diagnosticBus?: DiagnosticBus;
}

export class RendererAdapter {
  private gameRenderer: GameRenderer;
  private options: RendererAdapterOptions;
  private pendingAssetLocations = new Map<string, SourceLocation>();

  constructor(gameRenderer: GameRenderer, options?: RendererAdapterOptions) {
    this.gameRenderer = gameRenderer;
    this.options = options ?? {};
  }

  public handleAssetError(assetId: string, err: unknown): void {
    const loc = this.pendingAssetLocations.get(assetId);
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.options.diagnosticBus?.report({
      category: 'asset',
      code: 'ERR_ASSET_LOAD_FAILED',
      severity: 'error',
      message: `Failed to load asset "${assetId}": ${errorMessage}`,
      assetId,
      assetKey: assetId,
      fileId: loc?.fileId,
      line: loc?.line,
      col: loc?.col,
    });
  }

  public handleMissingGraphic(assetKey: string, loc?: SourceLocation): void {
    const resolvedLoc = loc ?? this.pendingAssetLocations.get(assetKey);
    this.options.diagnosticBus?.report({
      category: 'asset',
      code: 'ERR_MISSING_GRAPHIC',
      severity: 'error',
      message: `Graphic asset "${assetKey}" is missing in asset registry.`,
      assetId: assetKey,
      assetKey,
      fileId: resolvedLoc?.fileId,
      line: resolvedLoc?.line,
      col: resolvedLoc?.col,
    });
  }

  public async applySideEffect(instr: Instruction): Promise<void> {
    const defaultResolver: AssetGraphicResolver = (id: string) => id;
    const resolver = this.options.assetGraphicResolver ?? defaultResolver;

    switch (instr.type) {
      case 'BACKGROUND': {
        const bgInstr = instr as BackgroundInstruction;
        if (bgInstr.loc) {
          this.pendingAssetLocations.set(bgInstr.assetId, bgInstr.loc);
        }
        await this.gameRenderer.setBackground(bgInstr, bgInstr.transition, resolver);
        break;
      }
      case 'SHOW': {
        const showInstr = instr as ShowInstruction;
        if (showInstr.loc) {
          this.pendingAssetLocations.set(
            `${showInstr.character}_${showInstr.sprite}`,
            showInstr.loc,
          );
          this.pendingAssetLocations.set(showInstr.character, showInstr.loc);
        }
        const isProp = this.options.isPropChecker
          ? this.options.isPropChecker(showInstr.character)
          : false;
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
