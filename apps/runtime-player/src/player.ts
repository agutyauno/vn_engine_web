// ================================================================
// BỘ ĐIỀU PHỐI RUNTIME PLAYER (VN PLAYER CONTROLLER)
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 & Architecture
// ================================================================

import { VisualNovelVM, isValidProgram, type RunResult } from '@vn-engine/core-vm';
import { GameRenderer } from '@vn-engine/renderer';
import { AudioManager } from '@vn-engine/audio';
import type {
  Instruction,
  DialogueInstruction,
  Character,
  AssetRef,
} from '@vn-engine/shared-types';
import { stripControlTags } from './ui/typewriter';
import { GameStorage, type SaveSlotData } from './storage';

import type { PlayerContext, BacklogEntry, ProjectData } from './playerContext';
import { AssetResolver } from './controllers/assetResolver';
import { PlaybackController } from './controllers/playbackController';
import { SaveLoadController } from './controllers/saveLoadController';
import { DialogueView, CHAR_COLOR_MAP } from './ui/dialogueView';
import { ChoiceOverlay } from './ui/choiceOverlay';
import { InspectModal } from './ui/inspectModal';
import { DesyncModal } from './ui/desyncModal';
import { SettingsModal } from './ui/settingsModal';
import { TitleScreen } from './ui/titleScreen';

export { type BacklogEntry };

export class VNPlayer implements PlayerContext {
  public vm: VisualNovelVM;
  public renderer: GameRenderer;
  public audio: AudioManager;

  private backlog: BacklogEntry[] = [];
  private initialProgram: Instruction[];
  private seenDialogues: Set<string> = new Set();
  private toastTimerId: number | null = null;

  // Dữ liệu dự án được cập nhật từ Studio (Characters & Assets)
  private projectData: ProjectData = {};

  // Submodules
  public assetResolver: AssetResolver;
  public dialogueView: DialogueView;
  public choiceOverlay: ChoiceOverlay;
  public inspectModal: InspectModal;
  public desyncModal: DesyncModal;
  public settingsModal: SettingsModal;
  public titleScreen: TitleScreen;
  public saveLoadController: SaveLoadController;
  public playbackController: PlaybackController;

  // DOM Elements
  private gameRoot: HTMLElement;
  private canvasContainer: HTMLElement;
  private toastNotification: HTMLElement;

  constructor(program: Instruction[]) {
    this.initialProgram = program;

    if (typeof window !== 'undefined' && window.location?.search) {
      const urlParams = new URLSearchParams(window.location.search);
      const pid = urlParams.get('projectId') || urlParams.get('project');
      if (pid) {
        this.projectData.id = pid;
        GameStorage.setProjectId(pid);
      }
    }

    this.seenDialogues = GameStorage.getSeenDialogues(this.projectData.id);

    this.vm = new VisualNovelVM(program, undefined, {
      customFunctions: {
        has_item: (item: unknown) => {
          const state = this.vm.getState();
          const itemName = String(item).toLowerCase();
          const inventory = state.variables['inventory'];
          if (Array.isArray(inventory)) {
            if (inventory.some(i => String(i).toLowerCase() === itemName)) return true;
          }
          if (state.variables[`has_${itemName}`] === true) return true;
          return itemName === 'flower';
        },
      },
      emptyCallStackBehavior: 'halt',
    });

    this.renderer = new GameRenderer({ width: 1920, height: 1080 });
    this.audio = new AudioManager();

    this.gameRoot = document.getElementById('game-root')!;
    this.canvasContainer = document.getElementById('canvas-container')!;
    this.toastNotification = document.getElementById('toast-notification')!;

    // Khởi tạo các module con
    this.assetResolver = new AssetResolver(() => this.projectData);
    this.dialogueView = new DialogueView();
    this.choiceOverlay = new ChoiceOverlay();
    this.inspectModal = new InspectModal();
    this.desyncModal = new DesyncModal();

    this.titleScreen = new TitleScreen({
      onNewGame: () => {
        void this.startNewGame();
      },
      onLoadGame: () => {
        this.saveLoadController.setMode('load');
        this.settingsModal.open('saveload');
      },
      onSettings: () => {
        this.settingsModal.open('audio');
      },
    });

    this.playbackController = new PlaybackController(this, {
      dialogueView: this.dialogueView,
      choiceOverlay: this.choiceOverlay,
      inspectModal: this.inspectModal,
    });

    this.settingsModal = new SettingsModal({
      onTabSwitched: tabName => {
        if (tabName === 'saveload') {
          this.saveLoadController.renderSaveSlots();
        } else if (tabName === 'backlog') {
          this.settingsModal.renderBacklog(this.backlog);
        } else if (tabName === 'debug') {
          this.settingsModal.renderDebugInfo(this.vm, this.audio);
        }
      },
    });

    this.saveLoadController = new SaveLoadController(
      this,
      {
        desyncModal: this.desyncModal,
        dialogueView: this.dialogueView,
        inspectModal: this.inspectModal,
      },
      {
        onSaveLoaded: () => {
          this.titleScreen.hide();
          this.settingsModal.close();
        },
        onBeforeRestore: () => {
          this.playbackController.clearAutoTimer();
          this.playbackController.clearSkip();
          this.choiceOverlay.hide();
        },
      },
    );
  }

  // ================================================================
  // PLAYER CONTEXT IMPLEMENTATION
  // ================================================================
  public getVM(): VisualNovelVM {
    return this.vm;
  }

  public getRenderer(): GameRenderer {
    return this.renderer;
  }

  public getAudio(): AudioManager {
    return this.audio;
  }

  public getProjectData(): ProjectData {
    return this.projectData;
  }

  public getBacklog(): BacklogEntry[] {
    return this.backlog;
  }

  public addToBacklog(entry: BacklogEntry): void {
    this.backlog.push(entry);
  }

  public clearBacklog(): void {
    this.backlog = [];
  }

  public updateControlsState(): void {
    this.playbackController.updateControlsState();
  }

  public closeAllModals(): void {
    this.settingsModal.close();
    this.inspectModal.hide();
    this.desyncModal.close();
  }

  public isAnyModalOpen(): boolean {
    return (
      this.settingsModal.isOpen() ||
      this.inspectModal.isOpen() ||
      this.desyncModal.isOpen()
    );
  }

  public getAssetGraphicResolver(): (assetKey: string) => string | undefined {
    return this.assetResolver.getAssetGraphicResolver();
  }

  public getAssetAudioResolver(): (assetKey: string) => string {
    return this.assetResolver.getAssetAudioResolver();
  }

  public checkIsProp(characterId: string): boolean {
    return this.assetResolver.checkIsProp(characterId);
  }

  public updateProjectData(data: {
    id?: string;
    characters?: Character[];
    assets?: AssetRef[];
  }): void {
    if (data.id) {
      this.projectData.id = data.id;
      GameStorage.setProjectId(data.id);
      this.seenDialogues = GameStorage.getSeenDialogues(data.id);
    }
    if (data.characters) this.projectData.characters = data.characters;
    if (data.assets) this.projectData.assets = data.assets;
  }

  // ================================================================
  // START & MAIN GAME LOOP
  // ================================================================
  public async start(): Promise<void> {
    await this.renderer.init(this.canvasContainer);
    this.playbackController.updateUiScale();

    window.addEventListener('resize', () => {
      this.renderer.resizeToContainer(this.canvasContainer);
      this.playbackController.updateUiScale();
    });

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.renderer.resizeToContainer(this.canvasContainer);
        this.playbackController.updateUiScale();
      });
      resizeObserver.observe(this.gameRoot);
    }

    this.setupEventListeners();
    this.playbackController.updateControlsState();

    const urlParams =
      typeof window !== 'undefined' && window.location
        ? new URLSearchParams(window.location.search)
        : null;
    const isPopout =
      (typeof window !== 'undefined' && window.name === 'VN_Preview_Popout') ||
      urlParams?.get('popout') === 'true';
    const isEmbedded =
      (typeof window !== 'undefined' && window.parent && window.parent !== window) ||
      isPopout ||
      urlParams?.get('embedded') === 'true';

    if (!isEmbedded) {
      this.titleScreen.show();
    } else {
      await this.startNewGame();
    }
  }

  public async startNewGame(): Promise<void> {
    this.titleScreen.hide();
    const firstScene = this.initialProgram.find(i => i.type === 'SCENE');
    const initialSceneName = firstScene && 'name' in firstScene ? firstScene.name : 'start';
    this.vm.startAt({ scene: initialSceneName });
    await this.advance();
  }

  public async advance(): Promise<void> {
    if (this.playbackController.getIsAdvancing()) {
      if (this.playbackController.getIsSkip() || this.playbackController.getIsAuto()) {
        this.playbackController.setAdvanceQueued(true);
      }
      return;
    }
    this.playbackController.setIsAdvancing(true);

    try {
      this.playbackController.clearAutoTimer();
      this.playbackController.clearWaitTimer();

      let runResult: RunResult;
      try {
        runResult = this.vm.runUntilInteractive();
      } catch (err: unknown) {
        this.handleRuntimeError(err);
        return;
      }

      // 1. Thực thi các side-effects tích lũy dọc đường
      for (const sideEffect of runResult.sideEffects) {
        await this.applySideEffect(sideEffect);
      }

      // 2. Xử lý kết quả dừng
      const step = runResult.stepResult;

      if (step.type === 'SUSPEND_DIALOGUE') {
        const instr = step.instruction as DialogueInstruction;

        let speakerDisplay = instr.character;
        if (instr.character) {
          const vmState = this.vm.getState();
          speakerDisplay =
            vmState.characterDisplayOverrides[instr.character] ??
            instr.displayNameOverride ??
            instr.character;
        }

        let charColor = '#38bdf8';
        if (speakerDisplay) {
          const charKey = speakerDisplay.toUpperCase();
          const declaredChar = this.projectData.characters?.find(
            c =>
              (instr.character && c.id.toLowerCase() === instr.character.toLowerCase()) ||
              c.name.toLowerCase() === speakerDisplay.toLowerCase(),
          );
          charColor = declaredChar?.colorHex || CHAR_COLOR_MAP[charKey] || '#38bdf8';
        }

        if (instr.text && instr.text.trim().length > 0) {
          this.backlog.push({
            speaker: speakerDisplay,
            text: stripControlTags(instr.text),
          });

          // Read Text Tracking
          const dialogueKey = this.vm.getCurrentDialogueKey();
          const isPreviouslySeen = dialogueKey ? this.seenDialogues.has(dialogueKey) : false;

          if (this.playbackController.getIsSkip() && !isPreviouslySeen) {
            this.playbackController.clearSkip();
          }

          if (dialogueKey && !this.seenDialogues.has(dialogueKey)) {
            this.seenDialogues.add(dialogueKey);
            GameStorage.saveSeenDialogues(this.seenDialogues, this.projectData.id);
          }
        }

        this.dialogueView.presentDialogue(
          instr,
          speakerDisplay,
          charColor,
          this.playbackController.getIsSkip(),
          () => this.onDialogueLineFinished(),
        );

        this.playbackController.updateControlsState();
      } else if (step.type === 'SUSPEND_CHOICE') {
        this.playbackController.clearSkip();
        this.dialogueView.hide();
        const availableChoices = this.vm.getAvailableChoices();
        this.choiceOverlay.presentChoices(availableChoices, choiceIndex => {
          const chosen = availableChoices[choiceIndex];
          if (chosen) {
            this.addToBacklog({
              speaker: 'Choice',
              text: `▸ ${chosen.text}`,
            });
          }
          try {
            this.vm.choose(choiceIndex);
          } catch (err: unknown) {
            this.handleRuntimeError(err);
            return;
          }
          void this.advance();
        });
      } else if (step.type === 'SUSPEND_WAIT') {
        this.playbackController.scheduleWait(step.duration, () => {
          void this.advance();
        });
      } else if (step.type === 'HALTED') {
        this.playbackController.clearAutoTimer();
        this.playbackController.clearSkip();
        this.dialogueView.hide();
        this.dialogueView.setNextIndicatorHalted();
        this.playbackController.updateControlsState();
      }
    } finally {
      this.playbackController.setIsAdvancing(false);
      if (
        this.playbackController.getAdvanceQueued() &&
        (this.playbackController.getIsSkip() || this.playbackController.getIsAuto())
      ) {
        this.playbackController.setAdvanceQueued(false);
        void this.advance();
      }
    }
  }

  public async applySideEffect(instr: Instruction): Promise<void> {
    if (instr.type === 'BACKGROUND') {
      await this.renderer.setBackground(instr, instr.transition, this.getAssetGraphicResolver());
    } else if (instr.type === 'SHOW') {
      const isProp = this.checkIsProp(instr.character);
      await this.renderer.showCharacter(instr, this.getAssetGraphicResolver(), isProp);
    } else if (instr.type === 'HIDE') {
      this.renderer.hideCharacter(instr.character);
    } else if (instr.type === 'HIDE_DIALOGUE') {
      this.dialogueView.hide();
    } else if (instr.type === 'INSPECT_BEGIN') {
      const assetUrl = this.getAssetGraphicResolver()(instr.assetId);
      this.inspectModal.show(instr.assetId, instr.title, assetUrl);
    } else if (instr.type === 'INSPECT_END') {
      this.inspectModal.hide();
    } else if (instr.type === 'PLAY') {
      const audioResolver = this.getAssetAudioResolver();
      this.audio.play(instr.channel, instr.assetId, audioResolver(instr.assetId), {
        volume: instr.volume,
        loop: instr.loop,
        fadeIn: instr.fadeIn,
      });
    } else if (instr.type === 'STOP') {
      this.audio.stop(instr.channel, { fadeOut: instr.fadeOut });
    }
  }

  private onDialogueLineFinished(): void {
    if (this.playbackController.getIsSkip()) {
      this.playbackController.scheduleSkipAdvance(60, () => {
        void this.advance();
      });
      return;
    }

    if (this.playbackController.getIsAuto()) {
      const fullText = this.dialogueView.getCurrentDialogue()?.text || '';
      const autoDelayMs = Math.max(1200, Math.min(6000, 800 + fullText.length * 55));
      this.playbackController.scheduleAutoAdvance(autoDelayMs, () => {
        void this.advance();
      });
    }
  }

  private handleAdvanceAction(): void {
    if (this.playbackController.getIsHudHidden()) {
      this.playbackController.toggleHideUI();
      return;
    }

    if (this.titleScreen?.isOpen()) {
      return;
    }

    if (this.isAnyModalOpen()) {
      return;
    }

    if (this.playbackController.getIsAuto()) {
      this.playbackController.toggleAuto();
    }

    if (this.playbackController.getIsSkip()) {
      this.playbackController.clearSkip();
      return;
    }

    if (this.dialogueView.isTyping()) {
      this.dialogueView.finishImmediately();
      return;
    }

    if (this.choiceOverlay.isOpen()) {
      return;
    }

    void this.advance();
  }

  // ================================================================
  // EVENT LISTENERS & HOTKEYS
  // ================================================================
  private setupEventListeners(): void {
    // Full screen tap / click to advance (supports mobile & hidden dialogue)
    this.gameRoot.addEventListener('click', (e: MouseEvent) => {
      if (this.titleScreen?.isOpen()) return;
      if (this.isAnyModalOpen()) return;
      if (this.choiceOverlay.isOpen()) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore interactive controls, buttons, inputs
      if (
        target.closest('.control-bar') ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('a')
      ) {
        return;
      }

      this.handleAdvanceAction();
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.rollback();
    });

    document.getElementById('btn-auto')?.addEventListener('click', () => {
      this.playbackController.toggleAuto(() => this.onDialogueLineFinished());
    });

    document.getElementById('btn-skip')?.addEventListener('click', () => {
      this.playbackController.toggleSkip();
    });

    document.getElementById('btn-log')?.addEventListener('click', () => {
      this.settingsModal.open('backlog');
    });

    document.getElementById('btn-qsave')?.addEventListener('click', () => {
      void this.quickSave();
    });

    document.getElementById('btn-qload')?.addEventListener('click', () => {
      this.quickLoad();
    });

    document.getElementById('btn-hide-ui')?.addEventListener('click', () => {
      this.playbackController.toggleHideUI();
    });

    document.getElementById('btn-menu')?.addEventListener('click', () => {
      this.settingsModal.open();
    });

    // Middle click
    this.gameRoot.addEventListener('auxclick', e => {
      if (e.button === 1) {
        e.preventDefault();
        this.playbackController.toggleHideUI();
      }
    });

    // Audio Sliders
    const sliderMaster = document.getElementById('slider-master') as HTMLInputElement;
    const valMaster = document.getElementById('val-master');
    sliderMaster?.addEventListener('input', () => {
      const val = parseFloat(sliderMaster.value);
      this.audio.setMasterVolume(val);
      if (valMaster) valMaster.textContent = `${Math.round(val * 100)}%`;
    });

    const sliderBgm = document.getElementById('slider-bgm') as HTMLInputElement;
    const valBgm = document.getElementById('val-bgm');
    sliderBgm?.addEventListener('input', () => {
      const val = parseFloat(sliderBgm.value);
      this.audio.setChannelVolume('music', val);
      if (valBgm) valBgm.textContent = `${Math.round(val * 100)}%`;
    });

    const sliderSfx = document.getElementById('slider-sfx') as HTMLInputElement;
    const valSfx = document.getElementById('val-sfx');
    sliderSfx?.addEventListener('input', () => {
      const val = parseFloat(sliderSfx.value);
      this.audio.setChannelVolume('sound', val);
      if (valSfx) valSfx.textContent = `${Math.round(val * 100)}%`;
    });

    document.getElementById('btn-mute-toggle')?.addEventListener('click', () => {
      this.toggleMute();
    });

    document.getElementById('btn-system-title')?.addEventListener('click', () => {
      this.settingsModal.close();
      this.titleScreen.show();
    });

    document.getElementById('btn-system-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.getElementById('btn-system-restart')?.addEventListener('click', () => {
      this.settingsModal.close();
      void this.reloadProgram(this.initialProgram);
      this.showToast('Game restarted!');
    });

    // Global Keydown
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.isAnyModalOpen()) {
          this.closeAllModals();
          return;
        }
        if (this.playbackController.getIsHudHidden()) {
          this.playbackController.toggleHideUI();
          return;
        }
        this.settingsModal.open();
        return;
      }

      if (e.code === 'KeyH' && !this.isAnyModalOpen()) {
        e.preventDefault();
        this.playbackController.toggleHideUI();
        return;
      }

      if (e.code === 'KeyM' && !this.isAnyModalOpen()) {
        e.preventDefault();
        this.toggleMute();
        return;
      }

      if (this.playbackController.getIsHudHidden()) {
        if (['Space', 'Enter', 'ArrowRight', 'ArrowLeft'].includes(e.code)) {
          e.preventDefault();
          this.playbackController.toggleHideUI();
          return;
        }
      }

      if (this.isAnyModalOpen()) return;

      if (this.choiceOverlay.isOpen()) {
        if (e.key >= '1' && e.key <= '9') {
          e.preventDefault();
          const index = parseInt(e.key, 10) - 1;
          this.choiceOverlay.selectChoiceByIndex(index);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.choiceOverlay.navigateChoice(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.choiceOverlay.navigateChoice(-1);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.choiceOverlay.submitCurrentChoice();
          return;
        }
        return;
      }

      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.handleAdvanceAction();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.rollback();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this.playbackController.toggleAuto(() => this.onDialogueLineFinished());
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.playbackController.toggleSkip();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        this.settingsModal.open('backlog');
      }
    });
  }

  // ================================================================
  // PUBLIC HELPER METHODS (BACKWARDS COMPATIBILITY)
  // ================================================================
  public rollback(): boolean {
    return this.playbackController.rollback();
  }

  public toggleAuto(): void {
    this.playbackController.toggleAuto(() => this.onDialogueLineFinished());
  }

  public toggleSkip(): void {
    this.playbackController.toggleSkip();
  }

  public toggleHideUI(): void {
    this.playbackController.toggleHideUI();
  }

  public async quickSave(): Promise<void> {
    await this.saveLoadController.quickSave();
  }

  public quickLoad(): boolean {
    return this.saveLoadController.quickLoad();
  }

  public showInspectModal(assetId: string, title?: string): void {
    const assetUrl = this.getAssetGraphicResolver()(assetId);
    this.inspectModal.show(assetId, title, assetUrl);
  }

  public hideInspectModal(): void {
    this.inspectModal.hide();
  }

  public openSettingsMenu(
    initialTab: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system' = 'audio',
  ): void {
    this.settingsModal.open(initialTab);
  }

  public closeSettingsMenu(): void {
    this.settingsModal.close();
  }

  public switchSettingsTab(tabName: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system'): void {
    this.settingsModal.switchSettingsTab(tabName);
  }

  public setSaveLoadMode(mode: 'save' | 'load'): void {
    this.saveLoadController.setMode(mode);
  }

  public openSaveLoadModal(mode: 'save' | 'load'): void {
    this.setSaveLoadMode(mode);
    this.openSettingsMenu('saveload');
  }

  public openBacklogModal(): void {
    this.openSettingsMenu('backlog');
  }

  public openAudioModal(): void {
    this.openSettingsMenu('audio');
  }

  public openDebugModal(): void {
    this.openSettingsMenu('debug');
  }

  public openDesyncWarningModal(slot: SaveSlotData, slotIndex: number): void {
    const currentHash = this.vm.getScriptHash();
    this.desyncModal.open(slot, slotIndex, currentHash, {
      onContinue: () => {
        this.saveLoadController.restoreFromSlotData(slot);
        this.settingsModal.close();
      },
      onRestartScene: () => {
        this.saveLoadController.restoreAndRestartScene(slot);
        this.settingsModal.close();
      },
    });
  }

  public closeDesyncWarningModal(): void {
    this.desyncModal.close();
  }

  public toggleMute(): void {
    const isMuted = !this.audio.isMuted();
    if (isMuted) {
      this.audio.mute();
    } else {
      this.audio.unmute();
    }
    const btnMute = document.getElementById('btn-mute-toggle') as HTMLButtonElement;
    if (btnMute) {
      btnMute.textContent = isMuted ? 'UNMUTE [M]' : 'MUTE AUDIO [M]';
      btnMute.classList.toggle('active', isMuted);
    }
    this.showToast(isMuted ? 'Audio: MUTED' : 'Audio: UNMUTED');
  }

  public showToast(message: string): void {
    if (!this.toastNotification) return;
    this.toastNotification.textContent = message;
    this.toastNotification.classList.remove('hidden');
    if (this.toastTimerId !== null) {
      clearTimeout(this.toastTimerId);
    }
    this.toastTimerId = window.setTimeout(() => {
      this.toastNotification.classList.add('hidden');
      this.toastTimerId = null;
    }, 2500);
  }

  private handleRuntimeError(err: unknown): void {
    console.error('[RuntimePlayer] Virtual Machine Runtime Error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    this.showToast(`VM Error: ${msg}`);
  }

  public async reloadProgram(
    program: Instruction[],
    options?: {
      targetScene?: string | null;
      targetLine?: number | null;
      fileId?: string | null;
    },
  ): Promise<void> {
    if (!isValidProgram(program)) {
      console.error('[VNPlayer] reloadProgram rejected invalid bytecode program structure.');
      return;
    }

    this.initialProgram = program;
    if (this.projectData.id) {
      this.seenDialogues = GameStorage.getSeenDialogues(this.projectData.id);
    }

    // 1. Dừng các tiến trình tự động hoặc tua nhanh
    this.playbackController.clearAutoTimer();
    this.playbackController.clearSkip();
    this.playbackController.clearWaitTimer();

    // 2. Dừng âm thanh đang phát trên các kênh
    this.audio.stop('music');
    this.audio.stop('sound');

    // 3. Reset đồ họa hiển thị về trạng thái trắng/trống
    await this.renderer.syncStateCatchUp({ background: undefined, sprites: new Map() });

    // 4. Khởi tạo lại máy ảo và xóa lịch sử thoại (backlog)
    this.vm = new VisualNovelVM(program, undefined, {
      customFunctions: {
        has_item: (item: unknown) => {
          const state = this.vm.getState();
          const itemName = String(item).toLowerCase();
          const inventory = state.variables['inventory'];
          if (Array.isArray(inventory)) {
            if (inventory.some(i => String(i).toLowerCase() === itemName)) return true;
          }
          if (state.variables[`has_${itemName}`] === true) return true;
          return itemName === 'flower';
        },
      },
      emptyCallStackBehavior: 'halt',
    });
    this.backlog = [];

    // 5. Reset giao diện UI
    this.choiceOverlay.hide();
    this.dialogueView.hide();
    this.dialogueView.resetNextIndicator();
    this.closeAllModals();

    // 6. Xử lý điểm nhảy bắt đầu
    let jumped = false;
    if (options?.targetLine) {
      jumped = this.vm.jumpToLine(options.targetLine, options.fileId ?? undefined);
    }
    if (!jumped && options?.targetScene) {
      try {
        this.vm.jumpToScene(options.targetScene);
        jumped = true;
      } catch (e) {
        console.warn(`[RuntimePlayer] Cannot jump to scene "${options.targetScene}":`, e);
      }
    }

    // 7. Đồng bộ đồ họa / âm thanh State Catch-up tới điểm nhảy
    if (jumped) {
      const catchUp = this.vm.getStateCatchUp();
      await this.renderer.syncStateCatchUp(
        {
          background: catchUp.background,
          sprites: catchUp.sprites,
        },
        this.getAssetGraphicResolver(),
        (id: string) => this.checkIsProp(id),
      );
      this.audio.syncStateCatchUp(catchUp.audio, this.getAssetAudioResolver());
    }

    // 8. Cập nhật thanh điều khiển và bước vào kịch bản mới
    this.playbackController.updateControlsState();
    if (program.length > 0) {
      await this.advance();
    } else {
      this.dialogueView.hide();
    }
  }
}
