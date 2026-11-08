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

export function normalizeCategoryTab(_cat?: string | null): ConsolidatedCategory {
  return undefined as any;
}
