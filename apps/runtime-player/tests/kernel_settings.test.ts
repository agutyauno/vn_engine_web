// ============================================================================
// TASK-player-settings-modal, phase S2 (Kernel hydration, persistence & wiring)
// Spec: docs/tasks/TASK-player-settings-modal.md §2.1 (master volume bug),
//       §3.2 (PlayerViewState.settings + PlayerUIActions), §3.3 (context wiring),
//       §3.5 (boot hydration + mutation handlers), §7 items 3-5.
//
// Dùng StorageAdapter THẬT trên localStorage của jsdom (cài bởi tests/setup.ts).
// Không stub localStorage. Audio adapter là vi.fn() để assert setVolume/setMute.
// File .ts (không JSX): phần PlayerUIContext dựng cây bằng h() của Preact.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h } from 'preact';
import { render, cleanup, act } from '@testing-library/preact';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import { StorageAdapter } from '../src/adapters/StorageAdapter';
import {
  DEFAULT_PLAYER_SETTINGS,
  type KernelAdapters,
  type PlayerSettingsData,
  type PlayerUIActions,
  type PlayerViewState,
} from '../src/core/contracts';
import {
  PlayerUIProvider,
  usePlayerActions,
  usePlayerState,
} from '../src/ui/context/PlayerUIContext';

const PROGRAM: Instruction[] = [
  { type: 'SCENE', name: 'intro' },
  { type: 'DIALOGUE', character: null, speaker: null, text: 'Dòng thoại đầu tiên.' },
];

const STORAGE_OPTIONS = { projectId: 'p1' } as const;

const DEFAULT_VIEW_SETTINGS: PlayerViewState['settings'] = {
  textSpeed: 40,
  autoDelayMs: 1500,
  fontSize: 'medium',
  boxOpacity: 0.85,
};

const STORED: PlayerSettingsData = {
  masterVolume: 0.5,
  musicVolume: 0.3,
  sfxVolume: 0.4,
  voiceVolume: 0.6,
  isMuted: true,
  textSpeed: 70,
  autoDelayMs: 3000,
  fontSize: 'large',
  boxOpacity: 0.7,
  stageScaleMode: 'auto',
};

type AudioMock = NonNullable<KernelAdapters['audio']> & {
  setVolume: ReturnType<typeof vi.fn>;
  setMute: ReturnType<typeof vi.fn>;
};

function createAudio(): AudioMock {
  return {
    applySideEffect: vi.fn(),
    syncStateCatchUp: vi.fn(),
    stopVoice: vi.fn(),
    stopAll: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
    playVoice: vi.fn(),
  };
}

function createRenderer(): NonNullable<KernelAdapters['renderer']> {
  return {
    applySideEffect: vi.fn().mockResolvedValue(undefined),
    syncStateCatchUp: vi.fn().mockResolvedValue(undefined),
  };
}

function newStorage(): StorageAdapter {
  return new StorageAdapter(STORAGE_OPTIONS);
}

function newKernel(
  storage: StorageAdapter | undefined,
  audio: AudioMock = createAudio(),
): { kernel: VNRuntimeKernel; audio: AudioMock } {
  const adapters: KernelAdapters = { renderer: createRenderer(), audio };
  if (storage) adapters.storage = storage;
  return { kernel: new VNRuntimeKernel(PROGRAM, adapters), audio };
}

/** Đọc settings đã ghi xuống localStorage qua một StorageAdapter mới (không có pending). */
function readPersisted(): PlayerSettingsData {
  return newStorage().getSettings();
}

function seedStored(settings: PlayerSettingsData): void {
  const seeder = newStorage();
  seeder.saveSettings(settings);
  seeder.flushSettings();
}

describe('VNRuntimeKernel settings (TASK-player-settings-modal S2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // §3.5.1 Boot hydration, §7.3 (defaults từ DEFAULT_PLAYER_SETTINGS), §7.4 (ambience)
  // --------------------------------------------------------------------------
  describe('boot hydration', () => {
    it('boots with DEFAULT_PLAYER_SETTINGS when storage is empty', () => {
      const { kernel } = newKernel(newStorage());
      const state = kernel.getState();

      expect(state.settings).toEqual(DEFAULT_VIEW_SETTINGS);
      expect(state.settings.textSpeed).toBe(DEFAULT_PLAYER_SETTINGS.textSpeed);
      expect(state.audio.masterVolume).toBe(1.0);
      expect(state.audio.isMuted).toBe(false);
      expect(state.audio.channelVolumes).toEqual({
        music: 0.8,
        sound: 0.8,
        voice: 1.0,
        ambience: 1.0,
      });
    });

    it('syncs the audio adapter with default volumes and mute at construction when storage is empty', () => {
      const { audio } = newKernel(newStorage());

      expect(audio.setVolume).toHaveBeenCalledWith('master', 1.0);
      expect(audio.setVolume).toHaveBeenCalledWith('music', 0.8);
      expect(audio.setVolume).toHaveBeenCalledWith('sound', 0.8);
      expect(audio.setVolume).toHaveBeenCalledWith('voice', 1.0);
      expect(audio.setMute).toHaveBeenCalledWith(false);
    });

    it('boots with the same defaults when no storage adapter is provided', () => {
      const { kernel } = newKernel(undefined);
      const state = kernel.getState();

      expect(state.settings).toEqual(DEFAULT_VIEW_SETTINGS);
      expect(state.audio.masterVolume).toBe(1.0);
      expect(state.audio.isMuted).toBe(false);
      expect(state.audio.channelVolumes).toEqual({
        music: 0.8,
        sound: 0.8,
        voice: 1.0,
        ambience: 1.0,
      });
    });

    it('mutations do not throw without a storage adapter', () => {
      const { kernel } = newKernel(undefined);

      expect(() => {
        kernel.setAudioVolume('master', 0.2);
        kernel.setAudioVolume('music', 0.2);
        kernel.toggleMute();
        kernel.setTextSpeed(10);
        kernel.setAutoDelay(800);
        kernel.setFontSize('small');
        kernel.setBoxOpacity(0.9);
        kernel.restoreDefaultSettings();
      }).not.toThrow();
      expect(kernel.getState().settings).toEqual(DEFAULT_VIEW_SETTINGS);
    });

    it('hydrates every field from stored settings', () => {
      seedStored(STORED);
      const { kernel } = newKernel(newStorage());
      const state = kernel.getState();

      expect(state.settings).toEqual({
        textSpeed: 70,
        autoDelayMs: 3000,
        fontSize: 'large',
        boxOpacity: 0.7,
      });
      expect(state.audio.masterVolume).toBe(0.5);
      expect(state.audio.isMuted).toBe(true);
      expect(state.audio.channelVolumes).toEqual({
        music: 0.3,
        sound: 0.4,
        voice: 0.6,
        ambience: 1.0,
      });
    });

    it('pushes stored volumes and mute to the audio adapter at construction', () => {
      seedStored(STORED);
      const { audio } = newKernel(newStorage());

      expect(audio.setVolume).toHaveBeenCalledWith('master', 0.5);
      expect(audio.setVolume).toHaveBeenCalledWith('music', 0.3);
      expect(audio.setVolume).toHaveBeenCalledWith('sound', 0.4);
      expect(audio.setVolume).toHaveBeenCalledWith('voice', 0.6);
      expect(audio.setMute).toHaveBeenCalledWith(true);
    });
  });

  // --------------------------------------------------------------------------
  // §2.1 master volume bug, §3.5.2 setAudioVolume
  // --------------------------------------------------------------------------
  describe('setAudioVolume', () => {
    it("'master' updates audio.masterVolume, not channelVolumes (bug fix §2.1)", () => {
      const storage = newStorage();
      const { kernel, audio } = newKernel(storage);
      audio.setVolume.mockClear();

      kernel.setAudioVolume('master', 0.3);
      const state = kernel.getState();

      expect(state.audio.masterVolume).toBe(0.3);
      expect(state.audio.channelVolumes).not.toHaveProperty('master');
      expect(audio.setVolume).toHaveBeenCalledWith('master', 0.3);

      storage.flushSettings();
      expect(readPersisted().masterVolume).toBe(0.3);
    });

    it.each([
      ['music', 'musicVolume'],
      ['sound', 'sfxVolume'],
      ['voice', 'voiceVolume'],
    ] as const)("'%s' updates state, the adapter and persists %s", (channel, field) => {
      const storage = newStorage();
      const { kernel, audio } = newKernel(storage);
      audio.setVolume.mockClear();

      kernel.setAudioVolume(channel, 0.25);

      expect(kernel.getState().audio.channelVolumes[channel]).toBe(0.25);
      expect(audio.setVolume).toHaveBeenCalledWith(channel, 0.25);

      vi.advanceTimersByTime(200);
      expect(readPersisted()[field]).toBe(0.25);
    });

    it.each([
      ['sfx', 'sound', 'sfxVolume'],
      ['bgm', 'music', 'musicVolume'],
    ] as const)(
      "alias '%s' canonicalizes to '%s' in state and adapter and persists %s",
      (alias, canonical, field) => {
        const storage = newStorage();
        const { kernel, audio } = newKernel(storage);
        audio.setVolume.mockClear();

        kernel.setAudioVolume(alias, 0.35);
        const volumes = kernel.getState().audio.channelVolumes;

        expect(volumes[canonical]).toBe(0.35);
        expect(volumes).not.toHaveProperty(alias);
        expect(audio.setVolume).toHaveBeenCalledWith(canonical, 0.35);
        expect(audio.setVolume).not.toHaveBeenCalledWith(alias, expect.anything());

        storage.flushSettings();
        expect(readPersisted()[field]).toBe(0.35);
      },
    );

    it("'ambience' is applied in state but never persisted (§7.4)", () => {
      const storage = newStorage();
      const { kernel } = newKernel(storage);

      kernel.setAudioVolume('ambience', 0.4);
      expect(kernel.getState().audio.channelVolumes['ambience']).toBe(0.4);

      storage.flushSettings();
      expect(localStorage.getItem('vn_engine_player_p1_settings')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // §3.5.2 toggleMute / setTextSpeed / setAutoDelay / setFontSize / setBoxOpacity
  // --------------------------------------------------------------------------
  describe('other mutations persist', () => {
    it('toggleMute updates state, the adapter and persists isMuted', () => {
      const storage = newStorage();
      const { kernel, audio } = newKernel(storage);
      audio.setMute.mockClear();

      kernel.toggleMute();

      expect(kernel.getState().audio.isMuted).toBe(true);
      expect(audio.setMute).toHaveBeenCalledWith(true);
      storage.flushSettings();
      expect(readPersisted().isMuted).toBe(true);
    });

    it('setTextSpeed updates state and persists textSpeed', () => {
      const storage = newStorage();
      const { kernel } = newKernel(storage);

      kernel.setTextSpeed(75);

      expect(kernel.getState().settings.textSpeed).toBe(75);
      vi.advanceTimersByTime(200);
      expect(readPersisted().textSpeed).toBe(75);
    });

    it('setAutoDelay updates state and persists autoDelayMs', () => {
      const storage = newStorage();
      const { kernel } = newKernel(storage);

      kernel.setAutoDelay(4200);

      expect(kernel.getState().settings.autoDelayMs).toBe(4200);
      storage.flushSettings();
      expect(readPersisted().autoDelayMs).toBe(4200);
    });

    it('setFontSize updates state and persists fontSize', () => {
      const storage = newStorage();
      const { kernel } = newKernel(storage);

      kernel.setFontSize('small');

      expect(kernel.getState().settings.fontSize).toBe('small');
      storage.flushSettings();
      expect(readPersisted().fontSize).toBe('small');
    });

    it('setBoxOpacity updates state and persists boxOpacity', () => {
      const storage = newStorage();
      const { kernel } = newKernel(storage);

      kernel.setBoxOpacity(0.65);

      expect(kernel.getState().settings.boxOpacity).toBe(0.65);
      vi.advanceTimersByTime(200);
      expect(readPersisted().boxOpacity).toBe(0.65);
    });
  });

  // --------------------------------------------------------------------------
  // §3.5.2 restoreDefaultSettings, §2.2.1 goal 3
  // --------------------------------------------------------------------------
  describe('restoreDefaultSettings', () => {
    it('returns state, adapter and storage to DEFAULT_PLAYER_SETTINGS, leaving ambience untouched', () => {
      const storage = newStorage();
      const { kernel, audio } = newKernel(storage);

      kernel.setAudioVolume('master', 0.1);
      kernel.setAudioVolume('music', 0.2);
      kernel.setAudioVolume('sound', 0.3);
      kernel.setAudioVolume('voice', 0.4);
      kernel.setAudioVolume('ambience', 0.5);
      kernel.toggleMute();
      kernel.setTextSpeed(90);
      kernel.setAutoDelay(4500);
      kernel.setFontSize('large');
      kernel.setBoxOpacity(0.6);
      storage.flushSettings();
      audio.setVolume.mockClear();
      audio.setMute.mockClear();

      kernel.restoreDefaultSettings();
      const state = kernel.getState();

      expect(state.settings).toEqual(DEFAULT_VIEW_SETTINGS);
      expect(state.audio.masterVolume).toBe(DEFAULT_PLAYER_SETTINGS.masterVolume);
      expect(state.audio.isMuted).toBe(false);
      expect(state.audio.channelVolumes).toEqual({
        music: DEFAULT_PLAYER_SETTINGS.musicVolume,
        sound: DEFAULT_PLAYER_SETTINGS.sfxVolume,
        voice: DEFAULT_PLAYER_SETTINGS.voiceVolume,
        ambience: 0.5,
      });

      expect(audio.setVolume).toHaveBeenCalledTimes(4);
      expect(audio.setVolume).toHaveBeenCalledWith('master', 1.0);
      expect(audio.setVolume).toHaveBeenCalledWith('music', 0.8);
      expect(audio.setVolume).toHaveBeenCalledWith('sound', 0.8);
      expect(audio.setVolume).toHaveBeenCalledWith('voice', 1.0);
      expect(audio.setMute).toHaveBeenCalledWith(false);

      storage.flushSettings();
      expect(readPersisted()).toEqual(DEFAULT_PLAYER_SETTINGS);
    });
  });

  // --------------------------------------------------------------------------
  // §2.2.1 goal 4: persist rồi khôi phục khi kernel boot lại
  // --------------------------------------------------------------------------
  describe('persistence round trip', () => {
    it('settings changed in kernel A are seen by a new kernel B on the same storage options', () => {
      const storageA = newStorage();
      const { kernel: kernelA } = newKernel(storageA);

      kernelA.setAudioVolume('master', 0.45);
      kernelA.setAudioVolume('sfx', 0.55);
      kernelA.setAudioVolume('bgm', 0.65);
      kernelA.setAudioVolume('voice', 0.75);
      kernelA.toggleMute();
      kernelA.setTextSpeed(15);
      kernelA.setAutoDelay(2500);
      kernelA.setFontSize('small');
      kernelA.setBoxOpacity(0.95);
      storageA.flushSettings();

      const { kernel: kernelB, audio: audioB } = newKernel(newStorage());
      const state = kernelB.getState();

      expect(state.settings).toEqual({
        textSpeed: 15,
        autoDelayMs: 2500,
        fontSize: 'small',
        boxOpacity: 0.95,
      });
      expect(state.audio.masterVolume).toBe(0.45);
      expect(state.audio.isMuted).toBe(true);
      expect(state.audio.channelVolumes).toMatchObject({ music: 0.65, sound: 0.55, voice: 0.75 });
      expect(audioB.setVolume).toHaveBeenCalledWith('master', 0.45);
      expect(audioB.setMute).toHaveBeenCalledWith(true);
    });
  });

  // --------------------------------------------------------------------------
  // Immutable snapshots: getState()/subscriber snapshot không bị mutate sau đó
  // --------------------------------------------------------------------------
  describe('immutable snapshots', () => {
    it.each([
      ['setFontSize', (k: VNRuntimeKernel) => k.setFontSize('large'), 'fontSize', 'medium'],
      ['setBoxOpacity', (k: VNRuntimeKernel) => k.setBoxOpacity(0.6), 'boxOpacity', 0.85],
      ['setTextSpeed', (k: VNRuntimeKernel) => k.setTextSpeed(99), 'textSpeed', 40],
    ] as const)(
      'a getState() snapshot keeps its old settings after %s',
      (_name, mutate, field, oldValue) => {
        const { kernel } = newKernel(newStorage());
        const before = kernel.getState();

        mutate(kernel);

        expect(before.settings[field]).toBe(oldValue);
        expect(kernel.getState().settings[field]).not.toBe(oldValue);
      },
    );

    it('a subscriber snapshot keeps its old settings after later mutations', () => {
      const { kernel } = newKernel(newStorage());
      const received: PlayerViewState[] = [];
      kernel.subscribe(s => received.push(s));

      kernel.setFontSize('small');
      kernel.setBoxOpacity(0.7);
      kernel.setTextSpeed(12);

      expect(received).toHaveLength(3);
      expect(received[0]?.settings).toEqual({ ...DEFAULT_VIEW_SETTINGS, fontSize: 'small' });
      expect(received[1]?.settings).toEqual({
        ...DEFAULT_VIEW_SETTINGS,
        fontSize: 'small',
        boxOpacity: 0.7,
      });
      expect(received[2]?.settings).toEqual({
        textSpeed: 12,
        autoDelayMs: 1500,
        fontSize: 'small',
        boxOpacity: 0.7,
      });
    });

    it("an old snapshot's audio.masterVolume is unchanged after setAudioVolume('master')", () => {
      const { kernel } = newKernel(newStorage());
      const before = kernel.getState();
      const received: PlayerViewState[] = [];
      kernel.subscribe(s => received.push(s));

      kernel.setAudioVolume('master', 0.2);
      kernel.setAudioVolume('master', 0.6);

      expect(before.audio.masterVolume).toBe(1.0);
      expect(received[0]?.audio.masterVolume).toBe(0.2);
      expect(received[1]?.audio.masterVolume).toBe(0.6);
      expect(kernel.getState().audio.masterVolume).toBe(0.6);
    });
  });

  // --------------------------------------------------------------------------
  // Mỗi mutation phải emit tới subscribers
  // --------------------------------------------------------------------------
  describe('emits to subscribers', () => {
    it.each([
      ['setAudioVolume master', (k: VNRuntimeKernel) => k.setAudioVolume('master', 0.5)],
      ['setAudioVolume music', (k: VNRuntimeKernel) => k.setAudioVolume('music', 0.5)],
      ['toggleMute', (k: VNRuntimeKernel) => k.toggleMute()],
      ['setTextSpeed', (k: VNRuntimeKernel) => k.setTextSpeed(60)],
      ['setAutoDelay', (k: VNRuntimeKernel) => k.setAutoDelay(900)],
      ['setFontSize', (k: VNRuntimeKernel) => k.setFontSize('large')],
      ['setBoxOpacity', (k: VNRuntimeKernel) => k.setBoxOpacity(0.75)],
      ['restoreDefaultSettings', (k: VNRuntimeKernel) => k.restoreDefaultSettings()],
    ] as const)('%s emits a new state', (_name, mutate) => {
      const { kernel } = newKernel(newStorage());
      const listener = vi.fn();
      kernel.subscribe(listener);

      mutate(kernel);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // §3.3 PlayerUIContext wiring
  // --------------------------------------------------------------------------
  describe('PlayerUIContext wiring', () => {
    function renderWithKernel(kernel: VNRuntimeKernel): {
      getActions: () => PlayerUIActions;
      getByTestId: (id: string) => HTMLElement;
    } {
      let captured: PlayerUIActions | null = null;
      const Consumer = () => {
        const state = usePlayerState();
        captured = usePlayerActions();
        return h(
          'div',
          null,
          h('span', { 'data-testid': 'font-size' }, state.settings.fontSize),
          h('span', { 'data-testid': 'box-opacity' }, String(state.settings.boxOpacity)),
        );
      };
      const { getByTestId } = render(h(PlayerUIProvider, { kernel }, h(Consumer, null)));
      return {
        getActions: () => {
          if (!captured) throw new Error('actions not captured');
          return captured;
        },
        getByTestId,
      };
    }

    it('actions.setFontSize calls through to the kernel', () => {
      const { kernel } = newKernel(newStorage());
      const { getActions, getByTestId } = renderWithKernel(kernel);

      act(() => getActions().setFontSize('large'));

      expect(kernel.getState().settings.fontSize).toBe('large');
      expect(getByTestId('font-size').textContent).toBe('large');
    });

    it('actions.setBoxOpacity calls through to the kernel', () => {
      const { kernel } = newKernel(newStorage());
      const { getActions, getByTestId } = renderWithKernel(kernel);

      act(() => getActions().setBoxOpacity(0.65));

      expect(kernel.getState().settings.boxOpacity).toBe(0.65);
      expect(getByTestId('box-opacity').textContent).toBe('0.65');
    });

    it('actions.restoreDefaultSettings calls through to the kernel', () => {
      seedStored(STORED);
      const { kernel } = newKernel(newStorage());
      const spy = vi.spyOn(kernel, 'restoreDefaultSettings');
      const { getActions, getByTestId } = renderWithKernel(kernel);

      act(() => getActions().restoreDefaultSettings());

      expect(spy).toHaveBeenCalledTimes(1);
      expect(kernel.getState().settings).toEqual(DEFAULT_VIEW_SETTINGS);
      expect(getByTestId('font-size').textContent).toBe('medium');
    });
  });
});
