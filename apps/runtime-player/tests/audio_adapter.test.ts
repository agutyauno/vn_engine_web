import { describe, it, expect, vi, beforeEach, expectTypeOf } from 'vitest';
import { AudioAdapter } from '../src/adapters/AudioAdapter';
import type { AudioManager } from '@vn-engine/audio';
import type { PlayInstruction, StopInstruction, Instruction } from '@vn-engine/shared-types';
import type { AudioAdapterContract } from '../src/core/contracts';

describe('AudioAdapter', () => {
  let mockAudioManager: AudioManager;
  const mockAssetResolver = vi.fn((key: string) => {
    if (key === 'bgm_theme') return 'https://cdn.example.com/theme.mp3';
    if (key === 'bgm_intro') return 'https://cdn.example.com/intro.mp3';
    if (key === 'v_alice_01') return 'https://cdn.example.com/v_alice_01.mp3';
    if (key === 'se_click') return 'https://cdn.example.com/click.wav';
    if (key === 'amb_rain') return 'https://cdn.example.com/rain.ogg';
    return undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioManager = {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setChannelVolume: vi.fn(),
      getChannelVolume: vi.fn(() => 1.0),
      setMasterVolume: vi.fn(),
      getMasterVolume: vi.fn(() => 1.0),
      mute: vi.fn(),
      unmute: vi.fn(),
      isMuted: vi.fn(() => false),
      syncStateCatchUp: vi.fn(),
      stopAll: vi.fn(),
      getChannelsState: vi.fn(() => []),
    } as unknown as AudioManager;
  });

  describe('ADR-017 Open Channels & Volume Controls', () => {
    it('should set channel volumes for open channels (music, sound, voice, ambience)', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.setVolume('music', 0.8);
      expect(mockAudioManager.setChannelVolume).toHaveBeenCalledWith('music', 0.8);

      adapter.setVolume('sound', 0.6);
      expect(mockAudioManager.setChannelVolume).toHaveBeenCalledWith('sound', 0.6);

      adapter.setVolume('voice', 0.9);
      expect(mockAudioManager.setChannelVolume).toHaveBeenCalledWith('voice', 0.9);

      adapter.setVolume('ambience', 0.7);
      expect(mockAudioManager.setChannelVolume).toHaveBeenCalledWith('ambience', 0.7);
    });

    it('should set master volume when channel is "master"', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.setVolume('master', 0.5);
      expect(mockAudioManager.setMasterVolume).toHaveBeenCalledWith(0.5);
    });

    it('should mute and unmute via AudioManager', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.setMute(true);
      expect(mockAudioManager.mute).toHaveBeenCalledTimes(1);

      adapter.setMute(false);
      expect(mockAudioManager.unmute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deterministic Voice Auto-Cut', () => {
    it('should synchronously stop the "voice" channel on stopVoice()', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.stopVoice();
      expect(mockAudioManager.stop).toHaveBeenCalledWith('voice');
      expect(mockAudioManager.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('Voice Replay', () => {
    it('should resolve asset and play on voice channel with loop: false', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.playVoice('v_alice_01');
      expect(mockAssetResolver).toHaveBeenCalledWith('v_alice_01');
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'voice',
        'v_alice_01',
        'https://cdn.example.com/v_alice_01.mp3',
        expect.objectContaining({ loop: false }),
      );
    });

    it('should not play voice if asset cannot be resolved', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.playVoice('non_existent_voice');
      expect(mockAudioManager.play).not.toHaveBeenCalled();
    });
  });

  describe('Side Effect Audio Execution (applySideEffect)', () => {
    it('should dispatch PLAY instruction to AudioManager.play with resolved URL', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });
      const playInstr: PlayInstruction = {
        type: 'PLAY',
        channel: 'music',
        assetId: 'bgm_theme',
        volume: 0.85,
        loop: true,
        fadeIn: 1.5,
      };

      adapter.applySideEffect(playInstr);
      expect(mockAssetResolver).toHaveBeenCalledWith('bgm_theme');
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'bgm_theme',
        'https://cdn.example.com/theme.mp3',
        expect.objectContaining({
          volume: 0.85,
          loop: true,
          fadeIn: 1.5,
        }),
      );
    });

    it('TC-ADAPT-INTRO-01: should resolve intro URL and pass introAssetId & introUrl to AudioManager.play', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });
      const playInstr: PlayInstruction = {
        type: 'PLAY',
        channel: 'music',
        assetId: 'bgm_theme',
        intro: 'bgm_intro',
        volume: 0.8,
        loop: true,
      };

      adapter.applySideEffect(playInstr);
      expect(mockAssetResolver).toHaveBeenCalledWith('bgm_theme');
      expect(mockAssetResolver).toHaveBeenCalledWith('bgm_intro');
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'bgm_theme',
        'https://cdn.example.com/theme.mp3',
        expect.objectContaining({
          volume: 0.8,
          loop: true,
          introAssetId: 'bgm_intro',
          introUrl: 'https://cdn.example.com/intro.mp3',
        }),
      );
    });

    it('should dispatch STOP instruction to AudioManager.stop with fadeOut', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });
      const stopInstr: StopInstruction = {
        type: 'STOP',
        channel: 'ambience',
        fadeOut: 2.0,
      };

      adapter.applySideEffect(stopInstr);
      expect(mockAudioManager.stop).toHaveBeenCalledWith(
        'ambience',
        expect.objectContaining({ fadeOut: 2.0 }),
      );
    });

    it('should ignore non-audio instructions gracefully', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });
      const nonAudioInstr: Instruction = {
        type: 'SHOW',
        targetId: 'alice',
        variant: 'happy',
      };

      expect(() => adapter.applySideEffect(nonAudioInstr)).not.toThrow();
      expect(mockAudioManager.play).not.toHaveBeenCalled();
      expect(mockAudioManager.stop).not.toHaveBeenCalled();
    });
  });

  describe('Audio State Catch-Up (syncStateCatchUp)', () => {
    it('should forward active audio map to AudioManager.syncStateCatchUp', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });
      const activeAudio = new Map<string, PlayInstruction>([
        ['music', { type: 'PLAY', channel: 'music', assetId: 'bgm_theme', loop: true }],
      ]);

      adapter.syncStateCatchUp(activeAudio);
      expect(mockAudioManager.syncStateCatchUp).toHaveBeenCalledWith(
        activeAudio,
        expect.any(Function),
      );
    });
  });

  describe('Phase 1: Audio Lifecycle & Player Settings Contracts (TASK-player-ui-and-scaler)', () => {
    it('TEST-AUD-02: should terminate all active channels and fade outs on stopAll()', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.stopAll();

      expect(mockAudioManager.stopAll).toHaveBeenCalledTimes(1);
    });

    it('should verify DEFAULT_PLAYER_SETTINGS structure and default values per contract', async () => {
      // Dynamic import to cleanly verify contract export without module resolution crash
      const { DEFAULT_PLAYER_SETTINGS } = await import('../src/core/contracts');

      expect(DEFAULT_PLAYER_SETTINGS).toBeDefined();
      const settings = DEFAULT_PLAYER_SETTINGS;

      // TASK-player-settings-modal §3.1/§7.1: autoDelay -> autoDelayMs, thêm isMuted/fontSize/boxOpacity.
      expect(settings).toStrictEqual({
        masterVolume: 1.0,
        musicVolume: 0.8,
        sfxVolume: 0.8,
        voiceVolume: 1.0,
        isMuted: false,
        textSpeed: 40,
        autoDelayMs: 1500,
        fontSize: 'medium',
        boxOpacity: 0.85,
        stageScaleMode: 'auto',
      });
      expect(settings).not.toHaveProperty('autoDelay');
    });
  });

  describe('TEST-AUD-01: Phase 3 Audio Channel Aliasing & Routing', () => {
    it('aliases "bgm" -> "music" and "sfx" -> "sound" in applySideEffect PLAY', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      const bgmInstr: PlayInstruction = {
        type: 'PLAY',
        channel: 'bgm',
        assetId: 'bgm_theme',
        volume: 0.9,
        loop: true,
      };
      adapter.applySideEffect(bgmInstr);
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'bgm_theme',
        'https://cdn.example.com/theme.mp3',
        expect.objectContaining({ volume: 0.9, loop: true }),
      );

      const sfxInstr: PlayInstruction = {
        type: 'PLAY',
        channel: 'sfx',
        assetId: 'se_click',
        volume: 0.7,
        loop: false,
      };
      adapter.applySideEffect(sfxInstr);
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'sound',
        'se_click',
        'https://cdn.example.com/click.wav',
        expect.objectContaining({ volume: 0.7, loop: false }),
      );
    });

    it('aliases "bgm" -> "music" and "sfx" -> "sound" in applySideEffect STOP', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      const stopBgm: StopInstruction = {
        type: 'STOP',
        channel: 'bgm',
        fadeOut: 1.0,
      };
      adapter.applySideEffect(stopBgm);
      expect(mockAudioManager.stop).toHaveBeenCalledWith(
        'music',
        expect.objectContaining({ fadeOut: 1.0 }),
      );

      const stopSfx: StopInstruction = {
        type: 'STOP',
        channel: 'sfx',
      };
      adapter.applySideEffect(stopSfx);
      expect(mockAudioManager.stop).toHaveBeenCalledWith('sound', expect.anything());
    });

    it('aliases "bgm" -> "music" and "sfx" -> "sound" in setVolume', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      adapter.setVolume('bgm', 0.85);
      expect(mockAudioManager.setChannelVolume).toHaveBeenCalledWith('music', 0.85);

      adapter.setVolume('sfx', 0.65);
      expect(mockAudioManager.setChannelVolume).toHaveBeenCalledWith('sound', 0.65);
    });

    it('canonicalizes channels in syncStateCatchUp before delegating to AudioManager', () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });
      const rawMap = new Map<string, PlayInstruction>([
        ['bgm', { type: 'PLAY', channel: 'bgm', assetId: 'bgm_theme', loop: true }],
        ['sfx', { type: 'PLAY', channel: 'sfx', assetId: 'se_click', loop: false }],
      ]);

      adapter.syncStateCatchUp(rawMap);
      expect(mockAudioManager.syncStateCatchUp).toHaveBeenCalledWith(
        expect.any(Map),
        expect.any(Function),
      );

      const syncCalls = vi.mocked(mockAudioManager.syncStateCatchUp).mock.calls;
      const passedMap = syncCalls[0]?.[0] as Map<string, PlayInstruction>;
      expect(passedMap.has('music')).toBe(true);
      expect(passedMap.has('sound')).toBe(true);
      expect(passedMap.has('bgm')).toBe(false);
      expect(passedMap.has('sfx')).toBe(false);
      expect(passedMap.get('music')?.channel).toBe('music');
      expect(passedMap.get('sound')?.channel).toBe('sound');
    });
  });

  describe('T2: playMusic / stopMusic (title BGM)', () => {
    it('plays music on "music" channel with loop: true by default and resolves undefined', async () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      const result = await adapter.playMusic('bgm_theme');

      expect(result).toBeUndefined();
      expect(mockAssetResolver).toHaveBeenCalledWith('bgm_theme');
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'bgm_theme',
        'https://cdn.example.com/theme.mp3',
        expect.objectContaining({ loop: true }),
      );
    });

    it('converts fadeInMs to seconds and respects loop: false', async () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      await adapter.playMusic('bgm_theme', { loop: false, fadeInMs: 1500 });

      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'bgm_theme',
        'https://cdn.example.com/theme.mp3',
        expect.objectContaining({
          loop: false,
          fadeIn: 1.5,
        }),
      );
    });

    it('passes format resolved from audioFormatResolver if provided', async () => {
      const mockAudioFormatResolver = vi.fn((key: string) =>
        key === 'bgm_theme' ? 'mp3' : undefined,
      );
      const adapter = new AudioAdapter(mockAudioManager, {
        assetResolver: mockAssetResolver,
        audioFormatResolver: mockAudioFormatResolver,
      });

      await adapter.playMusic('bgm_theme');

      expect(mockAudioFormatResolver).toHaveBeenCalledWith('bgm_theme');
      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'bgm_theme',
        'https://cdn.example.com/theme.mp3',
        expect.objectContaining({
          format: 'mp3',
        }),
      );
    });

    it('resolves without playing when track cannot be resolved or is empty/whitespace', async () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      await expect(adapter.playMusic('missing_track')).resolves.toBeUndefined();
      await expect(adapter.playMusic('')).resolves.toBeUndefined();
      await expect(adapter.playMusic('   ')).resolves.toBeUndefined();

      expect(mockAudioManager.play).not.toHaveBeenCalled();
    });

    it('uses track directly as URL when assetResolver is not provided', async () => {
      const adapter = new AudioAdapter(mockAudioManager);

      await adapter.playMusic('https://cdn.example.com/direct-music.mp3');

      expect(mockAudioManager.play).toHaveBeenCalledWith(
        'music',
        'https://cdn.example.com/direct-music.mp3',
        'https://cdn.example.com/direct-music.mp3',
        expect.objectContaining({ loop: true }),
      );
    });

    it('stops music channel with converted fadeOut in seconds or no positive fade when omitted', async () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      await adapter.stopMusic(800);
      expect(mockAudioManager.stop).toHaveBeenCalledWith(
        'music',
        expect.objectContaining({ fadeOut: 0.8 }),
      );

      vi.clearAllMocks();

      await adapter.stopMusic();
      expect(mockAudioManager.stop).toHaveBeenCalledTimes(1);
      const [stopChannel, stopOptions] = vi.mocked(mockAudioManager.stop).mock.lastCall ?? [];
      expect(stopChannel).toBe('music');
      const fadeOutVal = stopOptions?.fadeOut;
      expect(fadeOutVal === undefined || fadeOutVal <= 0).toBe(true);
    });

    it('does not stop music channel between consecutive playMusic calls of the same track', async () => {
      const adapter = new AudioAdapter(mockAudioManager, { assetResolver: mockAssetResolver });

      await adapter.playMusic('bgm_theme');
      await adapter.playMusic('bgm_theme');

      expect(mockAudioManager.stop).not.toHaveBeenCalled();
      expect(mockAudioManager.play).toHaveBeenCalledTimes(2);
      expect(vi.mocked(mockAudioManager.play).mock.calls[0]?.[1]).toBe('bgm_theme');
      expect(vi.mocked(mockAudioManager.play).mock.calls[1]?.[1]).toBe('bgm_theme');
    });

    it('satisfies Pick<Required<AudioAdapterContract>, "playMusic" | "stopMusic"> at type level', () => {
      expectTypeOf<AudioAdapter>().toMatchTypeOf<
        Pick<Required<AudioAdapterContract>, 'playMusic' | 'stopMusic'>
      >();

      const _contractCheck: Pick<
        Required<AudioAdapterContract>,
        'playMusic' | 'stopMusic'
      > = new AudioAdapter(mockAudioManager);
      expect(_contractCheck).toBeDefined();
    });
  });
});
