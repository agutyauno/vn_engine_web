// ============================================================================
// TASK-title-branding-and-saveload-system: Phase T3 (RED Phase)
// Spec: docs/tasks/TASK-title-branding-and-saveload-system.md §3.2, §3.3, §4 (T3)
// Kernel lifecycle, title screen config, quick actions, audio unlock, toast tone
// Uses real StorageAdapter on jsdom localStorage, fake timers, Preact h()
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h } from 'preact';
import { render, cleanup, act } from '@testing-library/preact';
import type { Instruction } from '@vn-engine/shared-types';
import { VNRuntimeKernel } from '../src/core/VNRuntimeKernel';
import { StorageAdapter, StorageQuotaError } from '../src/adapters/StorageAdapter';
import type {
  KernelAdapters,
  PlayerViewState,
  PlayerUIActions,
} from '../src/core/contracts';
import {
  PlayerUIProvider,
  usePlayerActions,
  usePlayerState,
} from '../src/ui/context/PlayerUIContext';

const PROGRAM: Instruction[] = [
  { type: 'SCENE', name: 'intro' },
  { type: 'DIALOGUE', character: 'Alice', text: 'Line 1: Welcome to the novel.' },
  { type: 'DIALOGUE', character: 'Alice', text: 'Line 2: Continuing the story.' },
  { type: 'DIALOGUE', character: 'Alice', text: 'Line 3: The climax.' },
];

type AudioMock = NonNullable<KernelAdapters['audio']> & {
  playMusic: ReturnType<typeof vi.fn>;
  stopMusic: ReturnType<typeof vi.fn>;
  stopVoice: ReturnType<typeof vi.fn>;
  stopAll: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  setMute: ReturnType<typeof vi.fn>;
  playVoice: ReturnType<typeof vi.fn>;
};

function createAudio(): AudioMock {
  return {
    playMusic: vi.fn().mockResolvedValue(undefined),
    stopMusic: vi.fn().mockResolvedValue(undefined),
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
    captureThumbnail: vi.fn().mockResolvedValue('data:image/jpeg;base64,thumb'),
  };
}

function newStorage(projectId = 'test_project'): StorageAdapter {
  return new StorageAdapter({ projectId, isPreview: false });
}

describe('VNRuntimeKernel Phase T3: Lifecycle, Quick Actions & Toast Tone (RED)', () => {
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

  // ==========================================================================
  // 1. titleConfig handling & fallback
  // ==========================================================================
  describe('titleConfig handling', () => {
    it('boots with fallback titleConfig { title: "Visual Novel" } when options are omitted', () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      expect(kernel.getState().titleConfig).toEqual({ title: 'Visual Novel' });
    });

    it('merges custom titleConfig with fallback "Visual Novel"', () => {
      const kernel = new VNRuntimeKernel(
        PROGRAM,
        {
          renderer: createRenderer(),
          audio: createAudio(),
          storage: newStorage(),
        },
        {
          titleConfig: {
            title: 'My TaleForge Story',
            version: '1.0.0',
            bgmTrack: 'bgm_main_theme',
            backgroundUrl: 'https://cdn.example.com/bg.png',
            logoUrl: 'https://cdn.example.com/logo.png',
          },
        },
      );

      expect(kernel.getState().titleConfig).toEqual({
        title: 'My TaleForge Story',
        version: '1.0.0',
        bgmTrack: 'bgm_main_theme',
        backgroundUrl: 'https://cdn.example.com/bg.png',
        logoUrl: 'https://cdn.example.com/logo.png',
      });
    });

    it('falls back to "Visual Novel" when title is empty string or whitespace-only', () => {
      const emptyKernel = new VNRuntimeKernel(
        PROGRAM,
        { storage: newStorage() },
        { titleConfig: { title: '', version: '0.1.0' } },
      );
      expect(emptyKernel.getState().titleConfig.title).toBe('Visual Novel');

      const whitespaceKernel = new VNRuntimeKernel(
        PROGRAM,
        { storage: newStorage() },
        { titleConfig: { title: '   ', bgmTrack: 'theme' } },
      );
      expect(whitespaceKernel.getState().titleConfig.title).toBe('Visual Novel');
    });
  });

  // ==========================================================================
  // 2. hasSaveData computation and reactive updates
  // ==========================================================================
  describe('hasSaveData computation and reactive updates', () => {
    it('initializes hasSaveData as false when storage has no saves', () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      expect(kernel.getState().hasSaveData).toBe(false);
    });

    it('initializes hasSaveData as true when storage has an existing quick save', async () => {
      const storage = newStorage();
      await storage.saveQuickSave({
        slotIndex: 0,
        timestamp: 1000,
        thumbnailDataUrl: '',
        currentScene: 'intro',
        previewText: 'Existing Quick Save',
        dialogueCounter: 0,
        serializedState: '{}',
      });

      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      expect(kernel.getState().hasSaveData).toBe(true);
    });

    it('initializes hasSaveData as true when storage has a regular save in slot 1', async () => {
      const storage = newStorage();
      await storage.saveSlot({
        slotIndex: 1,
        timestamp: 1000,
        thumbnailDataUrl: '',
        currentScene: 'intro',
        previewText: 'Existing Slot 1 Save',
        dialogueCounter: 0,
        serializedState: '{}',
      });

      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      expect(kernel.getState().hasSaveData).toBe(true);
    });

    it('updates hasSaveData to true after quickSave() or saveSlot()', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      expect(kernel.getState().hasSaveData).toBe(false);

      await kernel.startNewGame();
      await kernel.quickSave();

      expect(kernel.getState().hasSaveData).toBe(true);
    });

    it('updates hasSaveData to false when deleting the last remaining save', async () => {
      const storage = newStorage();
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      await kernel.startNewGame();
      await kernel.saveSlot(1);
      expect(kernel.getState().hasSaveData).toBe(true);

      await kernel.deleteSlot(1);
      expect(kernel.getState().hasSaveData).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Title audio and autoplay policy
  // ==========================================================================
  describe('Title audio and autoplay policy', () => {
    it('[TC-T3-01] constructor does NOT call audio.playMusic even if titleConfig.bgmTrack is provided', () => {
      const audio = createAudio();
      new VNRuntimeKernel(
        PROGRAM,
        { renderer: createRenderer(), audio, storage: newStorage() },
        { titleConfig: { bgmTrack: 'bgm_title' } },
      );

      expect(audio.playMusic).not.toHaveBeenCalled();
    });

    it('[TC-T3-02] unlockAudio() in TITLE mode with bgmTrack calls audio.playMusic(bgmTrack, { loop: true }) exactly once', () => {
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(
        PROGRAM,
        { renderer: createRenderer(), audio, storage: newStorage() },
        { titleConfig: { bgmTrack: 'bgm_title' } },
      );

      expect(audio.playMusic).not.toHaveBeenCalled();

      // First unlockAudio call
      kernel.unlockAudio();
      expect(audio.playMusic).toHaveBeenCalledTimes(1);
      expect(audio.playMusic).toHaveBeenCalledWith('bgm_title', { loop: true });

      // Idempotent: subsequent unlockAudio calls must NOT re-trigger playMusic
      kernel.unlockAudio();
      kernel.unlockAudio();
      expect(audio.playMusic).toHaveBeenCalledTimes(1);
    });

    it('[TC-T3-02] unlockAudio() without bgmTrack does not call playMusic', () => {
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio,
        storage: newStorage(),
      });

      kernel.unlockAudio();
      expect(audio.playMusic).not.toHaveBeenCalled();
    });

    it('[TC-T3-02] unlockAudio() called in GAMEPLAY mode does not play title music', async () => {
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(
        PROGRAM,
        { renderer: createRenderer(), audio, storage: newStorage() },
        { titleConfig: { bgmTrack: 'bgm_title' } },
      );

      await kernel.startNewGame();
      audio.playMusic.mockClear();

      kernel.unlockAudio();
      expect(audio.playMusic).not.toHaveBeenCalled();
    });

    it('[TC-T3-09] returnToTitle() from GAMEPLAY calls playMusic(bgmTrack, { loop: true }) even if unlockAudio was never called', async () => {
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(
        PROGRAM,
        { renderer: createRenderer(), audio, storage: newStorage() },
        { titleConfig: { bgmTrack: 'bgm_title' } },
      );

      await kernel.startNewGame();
      audio.playMusic.mockClear();

      kernel.returnToTitle();

      expect(audio.playMusic).toHaveBeenCalledTimes(1);
      expect(audio.playMusic).toHaveBeenCalledWith('bgm_title', { loop: true });
    });

    it('startNewGame() calls audio.stopMusic() without arguments before running script', async () => {
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio,
        storage: newStorage(),
      });

      await kernel.startNewGame();

      expect(audio.stopMusic).toHaveBeenCalledTimes(1);
      expect(audio.stopMusic).toHaveBeenCalledWith();
    });
  });

  // ==========================================================================
  // 4. continueGame()
  // ==========================================================================
  describe('continueGame()', () => {
    it('[TC-T3-03] continueGame() loads save with largest timestamp, switches mode to GAMEPLAY, restores dialogue, and calls stopMusic()', async () => {
      const storage = newStorage('continue_test');
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio,
        storage,
      });

      // Save slot 1 at timestamp 1000 on Line 1
      vi.setSystemTime(1000);
      await kernel.startNewGame();
      expect(kernel.getState().dialogue.rawText).toContain('Line 1');
      await kernel.saveSlot(1);

      // Advance to Line 2 and quick save at timestamp 5000
      await kernel.advance();
      expect(kernel.getState().dialogue.rawText).toContain('Line 2');
      vi.setSystemTime(5000);
      await kernel.quickSave();

      // Return to TITLE
      kernel.returnToTitle();
      expect(kernel.getState().mode).toBe('TITLE');

      audio.stopMusic.mockClear();

      // continueGame must load the newest save (quick save at t=5000, Line 2)
      await kernel.continueGame();

      expect(kernel.getState().mode).toBe('GAMEPLAY');
      expect(kernel.getState().dialogue.rawText).toContain('Line 2');
      expect(audio.stopMusic).toHaveBeenCalledTimes(1);
      expect(audio.stopMusic).toHaveBeenCalledWith();
    });

    it('[TC-T3-04] continueGame() when no save exists: remains in TITLE, does not throw, does not call stopMusic()', async () => {
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio,
        storage: newStorage(),
      });

      expect(kernel.getState().mode).toBe('TITLE');
      audio.stopMusic.mockClear();

      await expect(kernel.continueGame()).resolves.toBeUndefined();

      expect(kernel.getState().mode).toBe('TITLE');
      expect(audio.stopMusic).not.toHaveBeenCalled();
    });

    it('loadSlot(n) when in TITLE mode also calls audio.stopMusic()', async () => {
      const storage = newStorage('load_slot_title');
      const audio = createAudio();
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio,
        storage,
      });

      await kernel.startNewGame();
      await kernel.saveSlot(1);
      kernel.returnToTitle();

      expect(kernel.getState().mode).toBe('TITLE');
      audio.stopMusic.mockClear();

      await kernel.loadSlot(1);

      expect(kernel.getState().mode).toBe('GAMEPLAY');
      expect(audio.stopMusic).toHaveBeenCalledTimes(1);
      expect(audio.stopMusic).toHaveBeenCalledWith();
    });
  });

  // ==========================================================================
  // 5. Quick save and load actions & pending confirmation
  // ==========================================================================
  describe('Quick save and load actions & pending confirmation', () => {
    it('[TC-T3-05] quickSave() success shows toast "Quick saved" with tone "success"', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      await kernel.startNewGame();
      await kernel.quickSave();

      const toast = kernel.getState().activeToast;
      expect(toast).not.toBeNull();
      expect(toast?.message).toBe('Quick saved');
      expect(toast?.tone).toBe('success');
    });

    it('[TC-T3-06] quickLoad() when no quick save exists shows toast "No quick save found" with tone "info"', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      await kernel.quickLoad();

      const toast = kernel.getState().activeToast;
      expect(toast).not.toBeNull();
      expect(toast?.message).toBe('No quick save found');
      expect(toast?.tone).toBe('info');
    });

    it('[TC-T3-07] quickLoad() in GAMEPLAY with backlog > 0 sets pendingConfirm = "quick_load_overwrite" without loading immediately', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage('pending_confirm_test'),
      });

      await kernel.startNewGame();
      expect(kernel.getState().dialogue.rawText).toContain('Line 1');
      await kernel.quickSave();

      // Advance to Line 2 so backlog is not empty
      await kernel.advance();
      expect(kernel.getState().dialogue.rawText).toContain('Line 2');
      expect(kernel.getState().backlog.length).toBeGreaterThan(0);

      // quickLoad should NOT load yet; it must request confirmation
      await kernel.quickLoad();

      expect(kernel.getState().pendingConfirm).toBe('quick_load_overwrite');
      expect(kernel.getState().dialogue.rawText).toContain('Line 2'); // Line has not changed yet

      // Confirm pending: should load quick save back to Line 1 and clear pendingConfirm
      await kernel.confirmPending();

      expect(kernel.getState().pendingConfirm).toBeNull();
      expect(kernel.getState().dialogue.rawText).toContain('Line 1');
    });

    it('[TC-T3-07] cancelPending() dismisses confirmation without loading', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage('cancel_pending_test'),
      });

      await kernel.startNewGame();
      await kernel.quickSave();
      await kernel.advance();
      expect(kernel.getState().dialogue.rawText).toContain('Line 2');

      await kernel.quickLoad();
      expect(kernel.getState().pendingConfirm).toBe('quick_load_overwrite');

      kernel.cancelPending();

      expect(kernel.getState().pendingConfirm).toBeNull();
      expect(kernel.getState().dialogue.rawText).toContain('Line 2'); // Remained on Line 2
    });

    it('[TC-T3-07] quickLoad() in TITLE mode loads immediately without setting pendingConfirm', async () => {
      const storage = newStorage('title_quick_load');
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      await kernel.startNewGame();
      await kernel.quickSave();
      kernel.returnToTitle();
      expect(kernel.getState().mode).toBe('TITLE');

      await kernel.quickLoad();

      expect(kernel.getState().pendingConfirm).toBeNull();
      expect(kernel.getState().mode).toBe('GAMEPLAY');
      expect(kernel.getState().dialogue.rawText).toContain('Line 1');
    });

    it('[TC-T3-07] quickLoad() with no quick save does not set pendingConfirm (only toasts info)', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage('no_qs_gameplay'),
      });

      await kernel.startNewGame();
      await kernel.advance();
      expect(kernel.getState().backlog.length).toBeGreaterThan(0);

      await kernel.quickLoad();

      expect(kernel.getState().pendingConfirm).toBeNull();
      const toast = kernel.getState().activeToast;
      expect(toast?.message).toBe('No quick save found');
      expect(toast?.tone).toBe('info');
    });
  });

  // ==========================================================================
  // 6. deleteSlot()
  // ==========================================================================
  describe('deleteSlot()', () => {
    it('[TC-T3-08] deleteSlot(2) clears regular slot 2, updates saveSlots[1] to null, and updates hasSaveData', async () => {
      const storage = newStorage('del_slot_2');
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      await kernel.startNewGame();
      await kernel.saveSlot(2);

      expect(kernel.getState().saveSlots[1]).not.toBeNull();
      expect(kernel.getState().hasSaveData).toBe(true);

      await kernel.deleteSlot(2);

      expect(kernel.getState().saveSlots[1]).toBeNull();
      expect(kernel.getState().hasSaveData).toBe(false);

      const freshStorage = newStorage('del_slot_2');
      expect(freshStorage.getSlots()[1]).toBeNull();
    });

    it('[TC-T3-08] deleteSlot(0) clears quick save, sets quickSaveSlot to null, and removes from storage', async () => {
      const storage = newStorage('del_slot_0');
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      await kernel.startNewGame();
      await kernel.quickSave();

      expect(kernel.getState().quickSaveSlot).not.toBeNull();
      expect(kernel.getState().hasSaveData).toBe(true);

      await kernel.deleteSlot(0);

      expect(kernel.getState().quickSaveSlot).toBeNull();
      expect(kernel.getState().hasSaveData).toBe(false);

      const freshStorage = newStorage('del_slot_0');
      expect(freshStorage.getQuickSave()).toBeNull();
    });

    it('[TC-T3-08] deleteSlot with out-of-range index (7 or -1) rejects with RangeError and leaves state intact', async () => {
      const storage = newStorage('del_slot_range');
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage,
      });

      await kernel.startNewGame();
      await kernel.saveSlot(1);

      await expect(kernel.deleteSlot(7)).rejects.toThrow(RangeError);
      await expect(kernel.deleteSlot(-1)).rejects.toThrow(RangeError);

      expect(kernel.getState().saveSlots[0]).not.toBeNull();
      expect(kernel.getState().hasSaveData).toBe(true);
    });
  });

  // ==========================================================================
  // 7. Toast tones and auto-dismiss timing
  // ==========================================================================
  describe('Toast tones and auto-dismiss timing', () => {
    it('showToast() defaults to tone "info" and accepts "success" and "error"', () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      kernel.showToast('Default info message');
      let toast = kernel.getState().activeToast;
      expect(toast?.message).toBe('Default info message');
      expect(toast?.tone).toBe('info');

      kernel.showToast('Success message', 'success');
      toast = kernel.getState().activeToast;
      expect(toast?.message).toBe('Success message');
      expect(toast?.tone).toBe('success');

      kernel.showToast('Error message', 'error');
      toast = kernel.getState().activeToast;
      expect(toast?.message).toBe('Error message');
      expect(toast?.tone).toBe('error');
    });

    it('storage quota error ("Save failed: storage is full") uses tone "error"', async () => {
      const quotaStorage: NonNullable<KernelAdapters['storage']> = {
        getSeenDialogues: vi.fn(() => new Set<string>()),
        saveSeenDialogue: vi.fn(),
        getSlots: vi.fn(() => [null, null, null, null, null, null]),
        getQuickSave: vi.fn(() => null),
        saveSlot: vi.fn(async () => {
          throw new StorageQuotaError('quota_key');
        }),
      };

      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: quotaStorage,
      });

      await kernel.startNewGame();
      await kernel.saveSlot(1);

      const toast = kernel.getState().activeToast;
      expect(toast?.message).toBe('Save failed: storage is full');
      expect(toast?.tone).toBe('error');
    });

    it('[TC-T3-10] toast automatically dismisses after exactly 2500ms (still visible at 2499ms)', () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      kernel.showToast('Test timing');
      expect(kernel.getState().activeToast).not.toBeNull();

      // After 2499ms: toast MUST still be present
      vi.advanceTimersByTime(2499);
      expect(kernel.getState().activeToast).not.toBeNull();

      // At exactly 2500ms: toast MUST be cleared
      vi.advanceTimersByTime(1);
      expect(kernel.getState().activeToast).toBeNull();
    });
  });

  // ==========================================================================
  // 8. PlayerUIContext integration
  // ==========================================================================
  describe('PlayerUIContext integration', () => {
    function renderWithKernel(kernel: VNRuntimeKernel): {
      getActions: () => PlayerUIActions;
      getState: () => PlayerViewState;
    } {
      let capturedActions: PlayerUIActions | null = null;
      let capturedState: PlayerViewState | null = null;
      const Consumer = () => {
        capturedState = usePlayerState();
        capturedActions = usePlayerActions();
        return null;
      };
      render(h(PlayerUIProvider, { kernel }, h(Consumer, null)));
      return {
        getActions: () => {
          if (!capturedActions) throw new Error('actions not captured');
          return capturedActions;
        },
        getState: () => {
          if (!capturedState) throw new Error('state not captured');
          return capturedState;
        },
      };
    }

    it('PlayerUIContext forwards continueGame, deleteSlot, confirmPending, cancelPending, unlockAudio to kernel and supports toast tone', async () => {
      const kernel = new VNRuntimeKernel(PROGRAM, {
        renderer: createRenderer(),
        audio: createAudio(),
        storage: newStorage(),
      });

      const spyContinue = vi.spyOn(kernel, 'continueGame').mockResolvedValue(undefined);
      const spyDelete = vi.spyOn(kernel, 'deleteSlot').mockResolvedValue(undefined);
      const spyConfirm = vi.spyOn(kernel, 'confirmPending').mockResolvedValue(undefined);
      const spyCancel = vi.spyOn(kernel, 'cancelPending').mockReturnValue(undefined);
      const spyUnlock = vi.spyOn(kernel, 'unlockAudio').mockReturnValue(undefined);

      const { getActions, getState } = renderWithKernel(kernel);
      const actions = getActions();

      await actions.continueGame();
      expect(spyContinue).toHaveBeenCalledTimes(1);

      await actions.deleteSlot(3);
      expect(spyDelete).toHaveBeenCalledWith(3);

      await actions.confirmPending();
      expect(spyConfirm).toHaveBeenCalledTimes(1);

      actions.cancelPending();
      expect(spyCancel).toHaveBeenCalledTimes(1);

      actions.unlockAudio();
      expect(spyUnlock).toHaveBeenCalledTimes(1);

      act(() => {
        actions.showToast('Context toast', 'success');
      });

      const toast = getState().activeToast;
      expect(toast?.message).toBe('Context toast');
      expect(toast?.tone).toBe('success');
    });
  });
});
