// ============================================================================
// TASK-title-branding-and-saveload-system, Phase T1 / TC-T1-05 (§3.1)
// ProjectMetadata.titleSettings là optional nên project cũ không cần migrate.
// Phần expectTypeOf chỉ fail khi typecheck file này (tsconfig của package loại trừ tests/).
// ============================================================================
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ProjectMetadata, ProjectTitleSettings } from '../src';

describe('[TC-T1-05] ProjectTitleSettings & ProjectMetadata.titleSettings', () => {
  it('titleSettings is optional and typed ProjectTitleSettings | undefined', () => {
    expectTypeOf<ProjectMetadata['titleSettings']>().toEqualTypeOf<
      ProjectTitleSettings | undefined
    >();
    expectTypeOf<undefined>().toMatchTypeOf<ProjectMetadata['titleSettings']>();
  });

  it('a ProjectMetadata literal without titleSettings still compiles (no migration)', () => {
    const legacy: ProjectMetadata = {
      id: '11111111-2222-3333-4444-555555555555',
      title: 'Legacy Project',
      version: 1,
      ownerId: 'user-1',
      defaultLanguage: 'en',
    };
    expect(legacy.titleSettings).toBeUndefined();
    expect(JSON.parse(JSON.stringify(legacy))).toEqual(legacy);
  });

  it('all three ProjectTitleSettings fields are optional strings', () => {
    expectTypeOf<ProjectTitleSettings>().toEqualTypeOf<{
      backgroundAssetId?: string;
      logoAssetId?: string;
      bgmAssetId?: string;
    }>();
    expectTypeOf<ProjectTitleSettings['backgroundAssetId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ProjectTitleSettings['logoAssetId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ProjectTitleSettings['bgmAssetId']>().toEqualTypeOf<string | undefined>();

    const empty: ProjectTitleSettings = {};
    expect(empty).toEqual({});
  });

  it('a ProjectMetadata with titleSettings round-trips through JSON', () => {
    const meta: ProjectMetadata = {
      id: 'p1',
      title: 'Branded',
      version: 2,
      ownerId: 'user-1',
      defaultLanguage: 'en',
      titleSettings: { backgroundAssetId: 'bg-1', logoAssetId: 'logo-1', bgmAssetId: 'bgm-1' },
    };
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
  });
});
