// ==========================================
// KIỂU DỮ LIỆU TẦNG HIỂN THỊ ĐỒ HỌA (RENDERER TYPES)
// ==========================================

import type {
  BackgroundInstruction,
  ShowInstruction,
  NamedPosition,
  CoordinatePosition,
} from '@vn-engine/shared-types';

export interface RendererOptions {
  width?: number; // Mặc định 1280 (16:9)
  height?: number; // Mặc định 720
  backgroundColor?: number; // Mặc định trắng 0xffffff (Swiss White Grid style)
  antialias?: boolean;
}

export type AssetGraphicResolver = (assetId: string) => string | undefined;

export interface CatchUpVisualState {
  background?: BackgroundInstruction;
  sprites: Map<string, ShowInstruction>;
}

export interface CharacterPlacement {
  x: number;
  y: number;
}

export function resolveCharacterCoordinates(
  pos: NamedPosition | CoordinatePosition | undefined,
  baseWidth = 1280,
  baseHeight = 720,
): CharacterPlacement {
  if (!pos) {
    // Mặc định ở giữa màn hình
    return { x: baseWidth * 0.5, y: baseHeight };
  }

  if (typeof pos === 'string') {
    switch (pos) {
      case 'left':
        return { x: baseWidth * 0.22, y: baseHeight };
      case 'right':
        return { x: baseWidth * 0.78, y: baseHeight };
      case 'center':
      default:
        return { x: baseWidth * 0.5, y: baseHeight };
    }
  }

  // Tọa độ cụ thể { x, y }
  return {
    x: pos.x,
    y: pos.y ?? baseHeight,
  };
}
