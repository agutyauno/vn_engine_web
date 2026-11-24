import type { Instruction } from './instruction';
import type { AssetRef, ProjectTitleSettings } from './project';

export const PUBLISHED_BUNDLE_FORMAT_VERSION = 1 as const;

/**
 * Định dạng gói game đã xuất bản (Published Game Bundle - ADR-019 / TASK-PLY-LOADER).
 * Chứa toàn bộ bytecode program, asset metadata và cấu hình cần thiết để player chạy độc lập.
 */
export interface PublishedGameBundle {
  formatVersion: 1;
  projectId: string;
  title: string;
  titleSettings?: ProjectTitleSettings;
  entryScene?: string;
  program: Instruction[];
  assets: AssetRef[];
  publishedAt: number;
}
