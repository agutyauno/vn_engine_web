// ============================================================================
// TASK-title-branding-and-saveload-system, Phase T1: runtime contracts (§3.2)
// Test mức type (expectTypeOf): chỉ fail ở `pnpm typecheck`, không fail lúc chạy vitest.
// ============================================================================
import { describe, it, expectTypeOf } from 'vitest';
import type { ProjectMetadata, ProjectTitleSettings } from '@vn-engine/shared-types';
import type {
  AudioAdapterContract,
  KernelAdapters,
  TitleScreenConfig,
  ToastTone,
  VNRuntimeKernelOptions,
} from '../src/core/contracts';

type PlayMusicFn = (
  track: string,
  options?: { loop?: boolean; fadeInMs?: number },
) => Promise<void>;
type StopMusicFn = (fadeOutMs?: number) => Promise<void>;

describe('[T1] TitleScreenConfig & ToastTone (§3.2)', () => {
  it('TitleScreenConfig has a required title and optional string fields', () => {
    expectTypeOf<TitleScreenConfig>().toEqualTypeOf<{
      title: string;
      version?: string;
      backgroundUrl?: string;
      logoUrl?: string;
      bgmTrack?: string;
    }>();
    expectTypeOf<TitleScreenConfig['title']>().toEqualTypeOf<string>();
    expectTypeOf<{ title: 'Visual Novel' }>().toMatchTypeOf<TitleScreenConfig>();
  });

  it("ToastTone is the union 'success' | 'info' | 'error'", () => {
    expectTypeOf<ToastTone>().toEqualTypeOf<'success' | 'info' | 'error'>();
  });
});

describe('[T1] VNRuntimeKernelOptions.titleConfig (§3.2)', () => {
  it('titleConfig is optional Partial<TitleScreenConfig>', () => {
    expectTypeOf<VNRuntimeKernelOptions['titleConfig']>().toEqualTypeOf<
      Partial<TitleScreenConfig> | undefined
    >();
    // Không truyền titleConfig vẫn hợp lệ (giữ tương thích).
    expectTypeOf<{ projectId: 'p1' }>().toMatchTypeOf<VNRuntimeKernelOptions>();
    expectTypeOf<{ titleConfig: { version: '1.0' } }>().toMatchTypeOf<VNRuntimeKernelOptions>();
  });
});

describe('[T1] audio music contracts (§3.2, ms units)', () => {
  type AudioContract = NonNullable<KernelAdapters['audio']>;

  it('KernelAdapters.audio declares optional playMusic/stopMusic', () => {
    expectTypeOf<NonNullable<AudioContract['playMusic']>>().toEqualTypeOf<PlayMusicFn>();
    expectTypeOf<NonNullable<AudioContract['stopMusic']>>().toEqualTypeOf<StopMusicFn>();
    expectTypeOf<undefined>().toMatchTypeOf<AudioContract['playMusic']>();
    expectTypeOf<undefined>().toMatchTypeOf<AudioContract['stopMusic']>();
  });

  it('AudioAdapterContract.playMusic/stopMusic use the same fadeInMs/fadeOutMs signatures', () => {
    expectTypeOf<NonNullable<AudioAdapterContract['playMusic']>>().toEqualTypeOf<PlayMusicFn>();
    expectTypeOf<NonNullable<AudioAdapterContract['stopMusic']>>().toEqualTypeOf<StopMusicFn>();
  });
});

describe('[T1] shared-types ProjectTitleSettings as seen by the player (§3.1)', () => {
  it('ProjectMetadata.titleSettings is optional ProjectTitleSettings', () => {
    expectTypeOf<ProjectMetadata['titleSettings']>().toEqualTypeOf<
      ProjectTitleSettings | undefined
    >();
    expectTypeOf<ProjectTitleSettings>().toEqualTypeOf<{
      backgroundAssetId?: string;
      logoAssetId?: string;
      bgmAssetId?: string;
    }>();
  });
});
