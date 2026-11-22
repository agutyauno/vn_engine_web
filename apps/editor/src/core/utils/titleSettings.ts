import type { Project, ProjectTitleSettings } from '@vn-engine/shared-types';

export type TitleAssetRole = 'logo' | 'background' | 'bgm';

export const TITLE_ROLE_LABELS: Record<TitleAssetRole, string> = {
  logo: 'Logo',
  background: 'Background',
  bgm: 'Title Music',
};

export function getTitleRoleLabel(role: TitleAssetRole): string {
  return TITLE_ROLE_LABELS[role];
}

export function getTitleAssetRoles(project: Project, assetId: string): TitleAssetRole[] {
  const titleSettings = project.titleSettings;
  if (!titleSettings) {
    return [];
  }

  const roles: TitleAssetRole[] = [];
  if (titleSettings.logoAssetId === assetId) {
    roles.push('logo');
  }
  if (titleSettings.backgroundAssetId === assetId) {
    roles.push('background');
  }
  if (titleSettings.bgmAssetId === assetId) {
    roles.push('bgm');
  }

  return roles;
}

export function formatTitleAssetRoles(roles: TitleAssetRole[]): string {
  return roles.map(getTitleRoleLabel).join(', ');
}

export function normalizeProjectTitleSettings(
  project: Project,
  titleSettings?: ProjectTitleSettings,
): Project {
  const { titleSettings: _omitted, ...rest } = project;
  void _omitted;

  if (!titleSettings) {
    return rest;
  }

  const cleaned: ProjectTitleSettings = {};
  if (titleSettings.logoAssetId !== undefined) {
    cleaned.logoAssetId = titleSettings.logoAssetId;
  }
  if (titleSettings.backgroundAssetId !== undefined) {
    cleaned.backgroundAssetId = titleSettings.backgroundAssetId;
  }
  if (titleSettings.bgmAssetId !== undefined) {
    cleaned.bgmAssetId = titleSettings.bgmAssetId;
  }

  if (Object.keys(cleaned).length === 0) {
    return rest;
  }

  return {
    ...rest,
    titleSettings: cleaned,
  };
}

export function removeAssetFromTitleSettings(project: Project, assetId: string): Project {
  const current = project.titleSettings;
  if (!current) {
    return normalizeProjectTitleSettings(project, undefined);
  }

  const next: ProjectTitleSettings = {};
  if (current.logoAssetId !== undefined && current.logoAssetId !== assetId) {
    next.logoAssetId = current.logoAssetId;
  }
  if (current.backgroundAssetId !== undefined && current.backgroundAssetId !== assetId) {
    next.backgroundAssetId = current.backgroundAssetId;
  }
  if (current.bgmAssetId !== undefined && current.bgmAssetId !== assetId) {
    next.bgmAssetId = current.bgmAssetId;
  }

  return normalizeProjectTitleSettings(project, next);
}
