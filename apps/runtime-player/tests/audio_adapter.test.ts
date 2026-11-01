import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioAdapter } from '../src/adapters/AudioAdapter';
import type { AudioManager } from '@vn-engine/audio';
import type { PlayInstruction, StopInstruction, Instruction } from '@vn-engine/shared-types';

describe('AudioAdapter', () => {
  let mockAudioManager: AudioManager;
  const mockAssetResolver = vi.fn((key: string) => {
    if (key === 'bgm_theme') return 'https://cdn.example.com/theme.mp3';
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
        character: 'alice',
        sprite: 'happy',
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
});

