export type ConsolidatedCategory =
  | 'all'
  | 'backgrounds'
  | 'sprites'
  | 'audio'
  | 'bgm'
  | 'sfx'
  | 'voice'
  | 'ui'
  | 'other';

/**
 * Chuẩn hóa các category đầu vào (cả số ít và số nhiều) về canonical filter tab.
 * - 'background' | 'backgrounds' -> 'backgrounds'
 * - 'sprite' | 'sprites' -> 'sprites'
 * - undefined | null | '' -> 'all'
 * - các danh mục hợp lệ khác ('audio', 'bgm', 'sfx', 'voice', 'ui', 'other') giữ nguyên
 */
export function normalizeCategoryTab(cat?: string | null): ConsolidatedCategory {
  if (!cat) return 'all';
  if (cat === 'background' || cat === 'backgrounds') return 'backgrounds';
  if (cat === 'sprite' || cat === 'sprites') return 'sprites';
  return cat as ConsolidatedCategory;
}
