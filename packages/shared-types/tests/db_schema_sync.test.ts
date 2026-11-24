// ============================================================================
// TASK-DB-SYNC: db/schema.sql phải khớp với AssetRef và ProjectMetadata.
// Bảng ánh xạ dùng Record<keyof ...> nên thêm field vào contract mà quên ánh xạ
// sẽ làm typecheck fail (tsconfig của package loại trừ tests/, kiểm bằng
// `tsc --noEmit --strict` riêng file này khi review).
// ============================================================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { AssetCategory, AssetRef, Project, ProjectMetadata } from '../src';

const SCHEMA = readFileSync(resolve(__dirname, '../../../db/schema.sql'), 'utf8');

/** Field TS → cột DB. Thêm field mới vào AssetRef thì phải thêm vào đây. */
const ASSET_COLUMNS: Record<keyof AssetRef, string> = {
  id: 'id',
  name: 'name',
  type: 'type',
  category: 'category',
  storageUrl: 'storage_url',
  sizeBytes: 'size_bytes',
  version: 'version',
  tag: 'tag',
  variant: 'variant',
};

/** Field TS → cột DB của bảng projects (files/assets/uiScreens/customScripts nằm ở bảng riêng). */
const PROJECT_COLUMNS: Record<keyof ProjectMetadata | keyof Pick<Project, 'variables'>, string> = {
  id: 'id',
  title: 'title',
  description: 'description',
  version: 'version',
  ownerId: 'owner_id',
  defaultLanguage: 'default_language',
  entryScene: 'entry_scene',
  updatedAt: 'updated_at',
  displaySettings: 'display_settings',
  gameplaySettings: 'gameplay_settings',
  editorSettings: 'editor_settings',
  publishedGameId: 'published_game_id',
  titleSettings: 'title_settings',
  variables: 'variables',
};

const ASSET_CATEGORIES = [
  'background',
  'sprite',
  'bgm',
  'sfx',
  'voice',
  'ui',
  'other',
] as const satisfies readonly AssetCategory[];

/** Thân câu CREATE TABLE public.<table> (...); */
function tableBody(table: string): string {
  const match = new RegExp(
    `CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
  ).exec(SCHEMA);
  expect(match, `CREATE TABLE public.${table} not found`).not.toBeNull();
  return match?.[1] ?? '';
}

/** Tên cột của một bảng (bỏ comment, bỏ dòng ràng buộc cấp bảng). */
function columnsOf(table: string): string[] {
  return tableBody(table)
    .split('\n')
    .map(line => line.replace(/--.*$/, '').trim())
    .filter(line => line.length > 0 && !/^(UNIQUE|PRIMARY KEY|CHECK|CONSTRAINT)\b/i.test(line))
    .map(line => line.split(/\s+/)[0] ?? '');
}

/** Cột được thêm bằng ALTER TABLE public.<table> ADD COLUMN IF NOT EXISTS <col>. */
function migratedColumns(table: string): string[] {
  const re = new RegExp(
    `ALTER TABLE public\\.${table}\\s+ADD COLUMN IF NOT EXISTS\\s+([a-z_]+)`,
    'g',
  );
  return [...SCHEMA.matchAll(re)].map(m => m[1] ?? '');
}

describe('TASK-DB-SYNC: db/schema.sql matches shared-types contracts', () => {
  it('public.assets has a column for every AssetRef field', () => {
    const columns = columnsOf('assets');
    for (const [field, column] of Object.entries(ASSET_COLUMNS)) {
      expect(columns, `AssetRef.${field} -> assets.${column}`).toContain(column);
    }
  });

  it('public.projects has a column for every ProjectMetadata field and variables', () => {
    const columns = columnsOf('projects');
    for (const [field, column] of Object.entries(PROJECT_COLUMNS)) {
      expect(columns, `Project.${field} -> projects.${column}`).toContain(column);
    }
  });

  it('public.projects no longer declares the removed characters column', () => {
    expect(columnsOf('projects')).not.toContain('characters');
  });

  it('assets.category CHECK lists exactly the AssetCategory values and allows NULL', () => {
    const line = tableBody('assets')
      .split('\n')
      .find(l => /^\s*category\s/.test(l));
    expect(line, 'assets.category column definition').toBeDefined();
    const values = [...(line ?? '').matchAll(/'([a-z]+)'/g)].map(m => m[1]);
    expect([...values].sort()).toEqual([...ASSET_CATEGORIES].sort());
    expect(line).toMatch(/category IS NULL OR/);
    expect(line).not.toMatch(/NOT NULL/);
  });

  it('every new column has an idempotent ADD COLUMN IF NOT EXISTS migration', () => {
    const newAssetColumns = ['category', 'tag', 'variant'];
    const newProjectColumns = [
      'description',
      'entry_scene',
      'display_settings',
      'gameplay_settings',
      'editor_settings',
      'title_settings',
    ];
    expect(migratedColumns('assets').sort()).toEqual([...newAssetColumns].sort());
    expect(migratedColumns('projects').sort()).toEqual([...newProjectColumns].sort());
  });

  it('the migration block never drops columns automatically', () => {
    expect(SCHEMA).not.toMatch(/DROP COLUMN/i);
  });
});
