// ==========================================
// KIỂU DỮ LIỆU CƠ SỞ (COMMON PRIMITIVES)
// ==========================================

export type NamedPosition = 'left' | 'center' | 'right';

export interface CoordinatePosition {
  x: number; // Tỷ lệ màn hình 0.0 - 1.0
  y?: number; // Tỷ lệ màn hình 0.0 - 1.0 (mặc định chân nhân vật ở đáy màn hình)
}

export interface SourceLocation {
  fileId: string;
  line: number;
  col?: number;
}
