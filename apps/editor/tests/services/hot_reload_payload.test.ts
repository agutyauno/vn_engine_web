import { describe, it, expect } from 'vitest';
import type { Project, Instruction } from '@vn-engine/shared-types';
import { buildHotReloadPayload } from '../../src/core/services/hotReloadPayload';

describe('buildHotReloadPayload (TASK-editor-title-branding E5)', () => {
  const sampleProgram: Instruction[] = [{ type: 'HIDE_DIALOGUE' }];

  const baseProject: Project = {
    id: 'proj-branding-test',
    title: 'Echoes of the Sea',
    version: 1,
    ownerId: 'user-123',
    defaultLanguage: 'en',
    entryScene: 'main.vns',
    files: [
      {
        id: 'file-1',
        name: 'main.vns',
        content: 'scene start {\n  "Hello world!"\n}\n',
        order: 0,
        version: 1,
      },
    ],
    assets: [
      {
        id: 'asset-bg-1',
        name: 'ocean_bg.png',
        type: 'image',
        storageUrl: 'https://cdn.example.com/ocean_bg.png',
        sizeBytes: 2048,
      },
      {
        id: 'asset-logo-1',
        name: 'sea_logo.png',
        type: 'image',
        storageUrl: 'https://cdn.example.com/sea_logo.png',
        sizeBytes: 1024,
      },
    ],
    variables: [],
    uiScreens: [],
    customScripts: [],
  };

  it('always includes program, projectId, assets, and project title', () => {
    const payload = buildHotReloadPayload(baseProject, sampleProgram);

    expect(payload.program).toBe(sampleProgram);
    expect(payload.projectId).toBe(baseProject.id);
    expect(payload.assets).toBe(baseProject.assets);
    expect(payload.title).toBe('Echoes of the Sea');
  });

  it('includes titleSettings when present on project, and preserves exact contents', () => {
    const projectWithTitleSettings: Project = {
      ...baseProject,
      titleSettings: {
        logoAssetId: 'asset-logo-1',
        backgroundAssetId: 'asset-bg-1',
        bgmAssetId: 'asset-bgm-1',
      },
    };

    const payload = buildHotReloadPayload(projectWithTitleSettings, sampleProgram);

    expect(payload).toHaveProperty('titleSettings');
    expect(payload.titleSettings).toEqual({
      logoAssetId: 'asset-logo-1',
      backgroundAssetId: 'asset-bg-1',
      bgmAssetId: 'asset-bgm-1',
    });
  });

  it('omits titleSettings key entirely when project does not have titleSettings', () => {
    const payload = buildHotReloadPayload(baseProject, sampleProgram);

    expect(payload).not.toHaveProperty('titleSettings');
  });

  it('omits optional extra fields (scene, line, preserveState, startMode) when extra is not provided', () => {
    const payload = buildHotReloadPayload(baseProject, sampleProgram);

    expect(payload).not.toHaveProperty('scene');
    expect(payload).not.toHaveProperty('line');
    expect(payload).not.toHaveProperty('preserveState');
    expect(payload).not.toHaveProperty('startMode');
  });

  it('only includes provided extra fields and leaves out unpassed ones without undefined keys', () => {
    const payloadWithSceneAndLine = buildHotReloadPayload(baseProject, sampleProgram, {
      scene: 'chapter1.vns',
      line: 42,
    });

    expect(payloadWithSceneAndLine.scene).toBe('chapter1.vns');
    expect(payloadWithSceneAndLine.line).toBe(42);
    expect(payloadWithSceneAndLine).not.toHaveProperty('preserveState');
    expect(payloadWithSceneAndLine).not.toHaveProperty('startMode');

    const payloadWithStartMode = buildHotReloadPayload(baseProject, sampleProgram, {
      startMode: 'title',
      preserveState: true,
    });

    expect(payloadWithStartMode.startMode).toBe('title');
    expect(payloadWithStartMode.preserveState).toBe(true);
    expect(payloadWithStartMode).not.toHaveProperty('scene');
    expect(payloadWithStartMode).not.toHaveProperty('line');
  });

  it('does not produce undefined keys when extra fields are explicitly set to undefined', () => {
    const payload = buildHotReloadPayload(baseProject, sampleProgram, {
      scene: undefined,
      line: undefined,
      preserveState: undefined,
      startMode: undefined,
    });

    expect(payload).not.toHaveProperty('scene');
    expect(payload).not.toHaveProperty('line');
    expect(payload).not.toHaveProperty('preserveState');
    expect(payload).not.toHaveProperty('startMode');
  });
});
