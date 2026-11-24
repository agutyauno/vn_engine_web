import type { Project, Instruction } from '@vn-engine/shared-types';
import type { HotReloadPayload } from '../stores/livePreviewStore';
import { resolveEntrySceneName } from './publishedBundle';

export interface HotReloadPayloadExtra {
  scene?: string;
  line?: number;
  preserveState?: boolean;
  startMode?: 'title' | 'scene';
}

export function buildHotReloadPayload(
  project: Project,
  program: Instruction[],
  extra?: HotReloadPayloadExtra,
): HotReloadPayload {
  const payload: HotReloadPayload = {
    program,
    projectId: project.id,
    assets: project.assets,
    title: project.title,
  };

  if (project.titleSettings !== undefined) {
    payload.titleSettings = project.titleSettings;
  }

  const entryScene = resolveEntrySceneName(project, program);
  if (entryScene !== undefined) {
    payload.entryScene = entryScene;
  }

  if (extra?.scene !== undefined) {
    payload.scene = extra.scene;
  }

  if (extra?.line !== undefined) {
    payload.line = extra.line;
  }

  if (extra?.preserveState !== undefined) {
    payload.preserveState = extra.preserveState;
  }

  if (extra?.startMode !== undefined) {
    payload.startMode = extra.startMode;
  }

  return payload;
}
