// ==========================================
// KIỂU DỮ LIỆU CƠ SỞ (COMMON PRIMITIVES)
// ==========================================

export type NamedPosition = 'left' | 'center' | 'right';

export const SUPPORTED_NAMED_POSITIONS = ['left', 'center', 'right'] as const;

export const SUPPORTED_TRANSITIONS = [
  'fade',
  'dissolve',
  'shake',
  'hop',
  'wobble',
  'pop',
  'zoom',
  'bounce',
  'slide',
  'slide_left',
  'slide_right',
  'slide_up',
  'slide_down',
] as const;

export type SupportedTransition = (typeof SUPPORTED_TRANSITIONS)[number];

export const SUPPORTED_EASINGS = [
  'linear',
  'ease_in',
  'ease_out',
  'ease_in_out',
  'bounce',
  'elastic',
] as const;

export type SupportedEasing = (typeof SUPPORTED_EASINGS)[number];

export interface CoordinatePosition {
  x: number; // Tỷ lệ màn hình 0.0 - 1.0
  y?: number; // Tỷ lệ màn hình 0.0 - 1.0 (mặc định chân nhân vật ở đáy màn hình)
}

export interface SourceLocation {
  fileId: string;
  line: number;
  col?: number;
}
