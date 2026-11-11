// ==========================================
// KIỂU DỮ LIỆU TẦNG HIỂN THỊ ĐỒ HỌA (RENDERER TYPES)
// ==========================================

import type { Container, Sprite } from 'pixi.js';
import type {
  BackgroundInstruction,
  ShowInstruction,
  NamedPosition,
  CoordinatePosition,
} from '@vn-engine/shared-types';

export interface RendererOptions {
  width?: number; // Mặc định 1920 (16:9)
  height?: number; // Mặc định 1080
  backgroundColor?: number; // Mặc định trắng 0xffffff (Swiss White Grid style)
  antialias?: boolean;
  placeholderMode?: 'procedural' | 'transparent';
}

export type AssetGraphicResolver = (
  assetIdOrTag: string,
  variant?: string,
) => any;

export interface CatchUpVisualState {
  background?: BackgroundInstruction;
  sprites: Map<string, ShowInstruction>;
}

export interface CharacterPlacement {
  x: number;
  y: number;
}

export interface SpritePlacement {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}

export interface ManagedSprite {
  targetId: string;
  currentVariant?: string;
  container: Container;
  sprite: Sprite;
  cancelAnimation?: () => void;

  // Quản lý tween & animation tracking fields
  targetX?: number;
  targetY?: number;
  targetScaleX?: number;
  targetScaleY?: number;
  targetRotation?: number;
  targetAlpha?: number;
  animating?: boolean;

  /** @deprecated Backward compatibility for legacy tests */
  characterId?: string;
  currentSpriteId?: string;
}

export type EasingFunction = (t: number) => number;

export const EASING_FUNCTIONS: Record<string, EasingFunction> = {
  linear: t => t,
  ease_in: t => t * t * t,
  ease_out: t => 1 - Math.pow(1 - t, 3),
  ease_in_out: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  bounce: t => {
    const n1 = 7.5625;
    const d1 = 2.75;
    let curr = t;
    if (curr < 1 / d1) {
      return n1 * curr * curr;
    } else if (curr < 2 / d1) {
      return n1 * (curr -= 1.5 / d1) * curr + 0.75;
    } else if (curr < 2.5 / d1) {
      return n1 * (curr -= 2.25 / d1) * curr + 0.9375;
    } else {
      return n1 * (curr -= 2.625 / d1) * curr + 0.984375;
    }
  },
  elastic: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

export function resolveCharacterCoordinates(
  pos: NamedPosition | CoordinatePosition | undefined,
  baseWidth = 1920,
  baseHeight = 1080,
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
    x: pos.x >= 0 && pos.x <= 1 ? pos.x * baseWidth : pos.x,
    y: pos.y !== undefined ? (pos.y >= 0 && pos.y <= 1 ? pos.y * baseHeight : pos.y) : baseHeight,
  };
}

export function resolveSpritePlacement(
  instr: {
    type?: string;
    targetId?: string;
    character?: string;
    position?: NamedPosition | CoordinatePosition;
    x?: number;
    y?: number;
    offsetX?: number;
    offsetY?: number;
    anchorX?: number;
    anchorY?: number;
  },
  baseWidth = 1920,
  baseHeight = 1080,
): SpritePlacement {
  const anchorX = instr.anchorX !== undefined ? instr.anchorX : 0.5;
  const anchorY = instr.anchorY !== undefined ? instr.anchorY : 1.0;

  let x: number;
  let y: number;

  if (instr.x !== undefined) {
    x = instr.x >= 0 && instr.x <= 1 ? instr.x * baseWidth : instr.x;
  } else if (instr.position) {
    x = resolveCharacterCoordinates(instr.position, baseWidth, baseHeight).x;
  } else {
    x = baseWidth * 0.5;
  }

  if (instr.y !== undefined) {
    y = instr.y >= 0 && instr.y <= 1 ? instr.y * baseHeight : instr.y;
  } else if (
    instr.position &&
    typeof instr.position === 'object' &&
    instr.position.y !== undefined
  ) {
    y =
      instr.position.y >= 0 && instr.position.y <= 1
        ? instr.position.y * baseHeight
        : instr.position.y;
  } else {
    y = baseHeight;
  }

  if (instr.offsetX !== undefined) {
    x += instr.offsetX;
  }
  if (instr.offsetY !== undefined) {
    y += instr.offsetY;
  }

  return { x, y, anchorX, anchorY };
}

export function resolveCharacterPlacement(
  instr: {
    position?: NamedPosition | CoordinatePosition;
    x?: number;
    y?: number;
    offsetX?: number;
    offsetY?: number;
    anchorX?: number;
    anchorY?: number;
  },
  baseWidth = 1920,
  baseHeight = 1080,
  _isProp = false,
): CharacterPlacement {
  const p = resolveSpritePlacement(instr, baseWidth, baseHeight);
  return { x: p.x, y: p.y };
}
