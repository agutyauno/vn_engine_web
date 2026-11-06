import { describe, it, expect, beforeEach } from 'vitest';
import type { HotReloadPayload } from '../../src/core/stores/livePreviewStore';
import { usePreviewStore, useLivePreviewStore } from '../../src/core/stores/livePreviewStore';
import { setupTestStore } from '../testStoreHelpers';

describe('livePreviewStore', () => {
  beforeEach(() => {
    setupTestStore();
  });

  const samplePayload1: HotReloadPayload = {
    program: [{ type: 'DIALOGUE', character: null, text: 'Hello 1' }],
    projectId: 'proj-1',
    characters: [],
    assets: [],
  };

  const samplePayload2: HotReloadPayload = {
    program: [{ type: 'DIALOGUE', character: null, text: 'Hello 2' }],
    projectId: 'proj-1',
    characters: [{ id: 'hero', name: 'Hero', defaultExpression: 'normal', sprites: {} }],
    assets: [],
  };

  it('exports both usePreviewStore and useLivePreviewStore as aliases', () => {
    expect(usePreviewStore).toBe(useLivePreviewStore);
  });

  it('initializes with default standby state and paused playback', () => {
    const state = usePreviewStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.connectionStatus).toBe('standby');
    expect(state.pendingProgram).toBeNull();
    expect(state.pendingVariableOverrides).toEqual({});
    expect(state.watchedVariables).toEqual({});
  });

  it('toggles and sets playback state', () => {
    usePreviewStore.getState().setIsPlaying(true);
    expect(usePreviewStore.getState().isPlaying).toBe(true);

    usePreviewStore.getState().togglePlay();
    expect(usePreviewStore.getState().isPlaying).toBe(false);

    usePreviewStore.getState().togglePlay();
    expect(usePreviewStore.getState().isPlaying).toBe(true);
  });

  it('transitions connectionStatus lifecycle', () => {
    usePreviewStore.getState().setConnectionStatus('connected');
    expect(usePreviewStore.getState().connectionStatus).toBe('connected');

    usePreviewStore.getState().setConnectionStatus('disconnected');
    expect(usePreviewStore.getState().connectionStatus).toBe('disconnected');
  });

  it('buffers pendingProgram with last-write-wins semantics', () => {
    usePreviewStore.getState().setPendingProgram(samplePayload1);
    expect(usePreviewStore.getState().pendingProgram).toEqual(samplePayload1);

    // Newer compilation overwrites pending payload
    usePreviewStore.getState().setPendingProgram(samplePayload2);
    expect(usePreviewStore.getState().pendingProgram).toEqual(samplePayload2);

    usePreviewStore.getState().clearPendingProgram();
    expect(usePreviewStore.getState().pendingProgram).toBeNull();
  });

  it('merges pendingVariableOverrides and clears on demand', () => {
    usePreviewStore.getState().setVariableOverride('gold', 100);
    usePreviewStore.getState().setVariableOverride('affinity', 5);

    expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({
      gold: 100,
      affinity: 5,
    });

    usePreviewStore.getState().setVariableOverride('gold', 150);
    expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({
      gold: 150,
      affinity: 5,
    });

    usePreviewStore.getState().clearVariableOverrides();
    expect(usePreviewStore.getState().pendingVariableOverrides).toEqual({});
  });

  it('ingests live preview state variables via syncVariables', () => {
    usePreviewStore.getState().syncVariables({ playerHealth: 80, currentChapter: 'intro' });
    expect(usePreviewStore.getState().watchedVariables).toEqual({
      playerHealth: 80,
      currentChapter: 'intro',
    });
  });
});
