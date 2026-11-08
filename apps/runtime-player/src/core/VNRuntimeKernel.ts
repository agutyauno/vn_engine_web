import type {
  Instruction,
  DialogueInstruction,
  ChoiceInstruction,
  PlayInstruction,
  Character,
} from '@vn-engine/shared-types';
import { VisualNovelVM } from '@vn-engine/core-vm';
import type {
  KernelAdapters,
  PlayerViewState,
  SaveSlotData,
  BacklogEntry,
  VNRuntimeKernelOptions,
  LoadProgramOptions,
} from './contracts';
import { stripControlTags, stripRhythmTags } from './typewriter';

export class VNRuntimeKernel {
  private vm: VisualNovelVM;
  private adapters: KernelAdapters;
  private options?: VNRuntimeKernelOptions;
  private charactersMap: Map<string, Character> = new Map();
  private state: PlayerViewState;
  private subscribers: Set<(state: PlayerViewState) => void> = new Set();
  private seenDialogues: Set<string> = new Set();
  private isAutoPaused = false;
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVoiceAssetId: string | null = null;
  private pendingRestoreSnapshot: string | null = null;
  private pendingDesyncSlot: SaveSlotData | null = null;
  private isAdvancing = false;

  constructor(program: Instruction[], adapters?: KernelAdapters, options?: VNRuntimeKernelOptions) {
    this.adapters = adapters ?? {};
    this.options = options;
    if (options?.characters) {
      this.registerCharacters(options.characters);
    }
    this.vm = new VisualNovelVM(program);

    if (this.adapters.storage?.getSeenDialogues) {
      this.seenDialogues = new Set(this.adapters.storage.getSeenDialogues());
    }

    const defaultSlots: Array<SaveSlotData | null> = [null, null, null, null, null, null];
    const initialSlots = this.adapters.storage?.getSlots?.() ?? defaultSlots;
    const initialQuickSave = this.adapters.storage?.getQuickSave?.() ?? null;

    const initialMode = options?.initialMode ?? 'TITLE';

    this.state = {
      mode: initialMode,
      playbackMode: 'NORMAL',
      isControlsHidden: false,
      isCleanArtMode: false,
      dialogue: {
        isVisible: false,
        rawText: '',
        isComplete: false,
        canAdvance: false,
        isSeen: false,
        speakerName: undefined,
        speakerColorHex: undefined,
      },
      activeChoices: null,
      activeInspectModal: null,
      activeModal: 'none',
      settings: {
        textSpeed: 24,
        autoDelayMs: 1500,
      },
      activeToast: null,
      audio: {
        masterVolume: 1.0,
        channelVolumes: {
          music: 1.0,
          sound: 1.0,
          voice: 1.0,
          ambience: 1.0,
        },
        isMuted: false,
        currentTracks: {},
      },
      backlog: [],
      saveSlots: initialSlots,
      quickSaveSlot: initialQuickSave,
      desyncData: undefined,
    };
  }

  public getState(): PlayerViewState {
    return { ...this.state };
  }

  public subscribe(listener: (state: PlayerViewState) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.subscribers) {
      listener(snapshot);
    }
  }

  private clearTimers(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  public async startNewGame(): Promise<void> {
    this.clearTimers();
    this.state.mode = 'GAMEPLAY';
    this.state.playbackMode = 'NORMAL';
    this.isAutoPaused = false;
    await this.runForward();
  }

  public returnToTitle(): void {
    this.clearTimers();
    this.adapters.audio?.stopVoice();
    this.state.mode = 'TITLE';
    this.state.playbackMode = 'NORMAL';
    this.state.dialogue.isVisible = false;
    this.state.activeChoices = null;
    this.state.activeModal = 'none';
    this.emit();
  }

  public async advance(): Promise<void> {
    if (this.state.mode !== 'GAMEPLAY' || this.isAdvancing) return;
    this.isAdvancing = true;
    try {
      this.clearTimers();
      this.adapters.audio?.stopVoice();
      await this.runForward();
    } finally {
      this.isAdvancing = false;
    }
  }

  public completeDialogue(): void {
    this.state.dialogue.isComplete = true;
    this.emit();

    if (this.state.playbackMode === 'AUTO') {
      if (this.autoAdvanceTimer) {
        clearTimeout(this.autoAdvanceTimer);
      }
      this.autoAdvanceTimer = setTimeout(() => {
        void this.advance();
      }, this.state.settings.autoDelayMs);
    }
  }

  public async selectChoice(index: number): Promise<void> {
    if (!this.state.activeChoices) {
      return;
    }

    if (index < 0 || !this.state.activeChoices[index]) {
      throw new Error(
        `Choice index ${index} is out of bounds (total choices: ${this.state.activeChoices.length})`
      );
    }

    const choice = this.state.activeChoices[index]!;
    if (!choice.isSatisfied) {
      throw new Error(`Choice condition is not satisfied for option: ${choice.text}`);
    }

    if (this.isAdvancing) {
      return;
    }
    this.isAdvancing = true;

    try {
      this.clearTimers();
      this.adapters.audio?.stopVoice();

      this.vm.choose(index);
      this.state.activeChoices = null;
      this.emit();

      if (this.isAutoPaused) {
        this.state.playbackMode = 'AUTO';
        this.isAutoPaused = false;
      }

      await this.runForward();
    } finally {
      this.isAdvancing = false;
    }
  }

  public rollback(): boolean {
    this.clearTimers();
    const rolled = this.vm.rollback();
    if (!rolled) {
      return false;
    }

    this.adapters.audio?.stopVoice();
    this.applyCatchUpSync();

    if (this.state.backlog.length > 0) {
      this.state.backlog.pop();
    }

    this.emit();
    return true;
  }

  private async runForward(): Promise<void> {
    const runResult = this.vm.runUntilInteractive();

    for (const sideEffect of runResult.sideEffects) {
      if (this.adapters.renderer?.applySideEffect) {
        await this.adapters.renderer.applySideEffect(sideEffect);
      }
      if (this.adapters.audio?.applySideEffect) {
        this.adapters.audio.applySideEffect(sideEffect);
      }
      if (sideEffect.type === 'PLAY') {
        const play = sideEffect as PlayInstruction;
        if (play.channel === 'voice') {
          this.pendingVoiceAssetId = play.assetId;
        }
        this.state.audio.currentTracks[play.channel] = play.assetId;
      } else if (sideEffect.type === 'STOP') {
        const stop = sideEffect as { channel: string };
        delete this.state.audio.currentTracks[stop.channel];
      } else if (sideEffect.type === 'INSPECT_BEGIN') {
        const inspect = sideEffect as { assetId: string; title?: string };
        this.state.activeInspectModal = {
          assetUrl: inspect.assetId,
          title: inspect.title,
        };
        this.state.activeModal = 'inspect';
      } else if (sideEffect.type === 'INSPECT_END') {
        this.state.activeInspectModal = null;
        if (this.state.activeModal === 'inspect') {
          this.state.activeModal = 'none';
        }
      } else if (sideEffect.type === 'HIDE_DIALOGUE') {
        this.state.dialogue.isVisible = false;
        this.emit();
      }
    }

    const step = runResult.stepResult;
    if (step.type === 'SUSPEND_DIALOGUE') {
      if (step.instruction.type === 'DIALOGUE') {
        this.handleDialogue(step.instruction);
      }
    } else if (step.type === 'SUSPEND_CHOICE') {
      if (step.instruction.type === 'CHOICE') {
        this.handleChoice(step.instruction);
      }
    } else if (step.type === 'SUSPEND_WAIT') {
      this.handleWait(step.duration);
    } else if (step.type === 'HALTED') {
      this.state.mode = 'HALTED';
      this.state.dialogue.isVisible = false;
      this.emit();
    }
  }

  private registerCharacters(characters: Character[]): void {
    for (const char of characters) {
      this.charactersMap.set(char.id, char);
    }
  }

  private resolveSpeakerColor(characterId?: string | null): string | undefined {
    if (!characterId) return undefined;
    const char = this.charactersMap.get(characterId);
    return char?.colorHex;
  }

  private resolveSpeakerName(instruction?: DialogueInstruction | null): string | undefined {
    if (!instruction) return undefined;
    if (instruction.displayNameOverride) return instruction.displayNameOverride;
    const charId = instruction.character;
    if (!charId) return undefined;
    const vmState = this.vm.getState();
    const revealedName = vmState.characterDisplayOverrides?.[charId];
    if (revealedName) return revealedName;
    const configuredChar = this.charactersMap.get(charId);
    if (configuredChar?.name?.trim()) return configuredChar.name.trim();
    return charId;
  }

  private handleDialogue(instruction: DialogueInstruction): void {
    const dialogueKey = this.vm.getCurrentDialogueKey();
    const isSeen = dialogueKey ? this.seenDialogues.has(dialogueKey) : false;

    if (this.state.playbackMode === 'SKIP' && !isSeen) {
      this.state.playbackMode = 'NORMAL';
    }

    if (dialogueKey) {
      this.seenDialogues.add(dialogueKey);
      this.adapters.storage?.saveSeenDialogue?.(dialogueKey);
    }

    const speakerName = this.resolveSpeakerName(instruction);
    const speakerColorHex = this.resolveSpeakerColor(instruction.character);

    this.state.dialogue = {
      isVisible: true,
      rawText: instruction.text,
      speakerName,
      speakerColorHex,
      isComplete: false,
      canAdvance: true,
      isSeen,
    };

    const backlogEntry: BacklogEntry = {
      id: `backlog_${Date.now()}_${this.state.backlog.length}`,
      speakerName,
      speakerColorHex,
      text: stripRhythmTags(instruction.text),
      voiceAssetId: this.pendingVoiceAssetId ?? undefined,
      timestamp: Date.now(),
    };
    this.state.backlog.push(backlogEntry);
    this.pendingVoiceAssetId = null;

    this.emit();
  }

  private handleChoice(_instruction: ChoiceInstruction): void {
    if (this.state.playbackMode === 'AUTO') {
      this.isAutoPaused = true;
    }
    if (this.state.playbackMode === 'SKIP') {
      this.state.playbackMode = 'NORMAL';
    }

    const availableChoices = this.vm.getAvailableChoices();
    this.state.activeChoices = availableChoices.map(c => ({
      text: c.text,
      targetScene: c.targetScene,
      isSatisfied: c.enabled,
    }));

    this.emit();
  }

  private handleWait(duration: number): void {
    this.clearTimers();
    this.waitTimer = setTimeout(() => {
      void this.advance();
    }, duration * 1000);
  }

  private applyCatchUpSync(): void {
    const catchUp = this.vm.getStateCatchUp();
    if (this.adapters.renderer?.syncStateCatchUp) {
      void this.adapters.renderer.syncStateCatchUp({
        background: catchUp.background,
        sprites: catchUp.sprites,
      });
    }
    if (this.adapters.audio?.syncStateCatchUp) {
      this.adapters.audio.syncStateCatchUp(catchUp.audio);
    }

    if (catchUp.currentDialogue) {
      this.state.dialogue = {
        isVisible: true,
        rawText: catchUp.currentDialogue.text,
        speakerName: this.resolveSpeakerName(catchUp.currentDialogue),
        speakerColorHex: this.resolveSpeakerColor(catchUp.currentDialogue.character),
        isComplete: true,
        canAdvance: true,
        isSeen: true,
      };
    } else {
      this.state.dialogue.isVisible = false;
    }

    if (catchUp.activeInspect) {
      this.state.activeInspectModal = {
        assetUrl: catchUp.activeInspect.assetId,
        title: catchUp.activeInspect.title,
      };
    } else {
      this.state.activeInspectModal = null;
    }
  }

  public toggleAuto(): void {
    if (this.state.playbackMode === 'AUTO') {
      this.state.playbackMode = 'NORMAL';
      this.isAutoPaused = false;
      this.clearTimers();
    } else {
      this.state.playbackMode = 'AUTO';
    }
    this.emit();
  }

  public toggleSkip(): void {
    this.state.playbackMode = this.state.playbackMode === 'SKIP' ? 'NORMAL' : 'SKIP';
    this.emit();
  }

  public toggleHideControls(): void {
    this.state.isControlsHidden = !this.state.isControlsHidden;
    this.emit();
  }

  public toggleCleanArt(): void {
    this.state.isCleanArtMode = !this.state.isCleanArtMode;
    this.emit();
  }

  public toggleMute(): void {
    this.state.audio.isMuted = !this.state.audio.isMuted;
    this.adapters.audio?.setMute?.(this.state.audio.isMuted);
    this.emit();
  }

  public openModal(modal: 'save' | 'load' | 'backlog' | 'settings'): void {
    this.state.activeModal = modal;
    this.emit();
  }

  public closeModal(): void {
    this.state.activeModal = 'none';
    this.emit();
  }

  public closeInspect(): void {
    this.state.activeInspectModal = null;
    if (this.state.activeModal === 'inspect') {
      this.state.activeModal = 'none';
    }
    this.emit();
  }

  public setAudioVolume(channel: string, volume: number): void {
    this.state.audio.channelVolumes[channel] = volume;
    this.adapters.audio?.setVolume?.(channel, volume);
    this.emit();
  }

  public setTextSpeed(charsPerSec: number): void {
    this.state.settings.textSpeed = charsPerSec;
    this.emit();
  }

  public setAutoDelay(delayMs: number): void {
    this.state.settings.autoDelayMs = delayMs;
    this.emit();
  }

  public showToast(message: string): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.state.activeToast = { message, id: Date.now() };
    this.emit();

    this.toastTimer = setTimeout(() => {
      this.state.activeToast = null;
      this.emit();
    }, 3000);
  }

  public replayVoice(assetId: string): void {
    this.adapters.audio?.playVoice?.(assetId);
  }

  public async saveSlot(slotIndex: number): Promise<void> {
    if (slotIndex < 1 || slotIndex > 6) {
      throw new Error(`Invalid slot index: ${slotIndex}. Regular slots are 1-6.`);
    }

    const thumbnailDataUrl = (await this.adapters.renderer?.captureThumbnail?.()) ?? '';
    const serializedState = this.vm.serialize({
      projectId: this.options?.projectId,
    });
    const currentScene = this.vm.getState().currentScene;
    const currentDialogue = this.vm.getState().currentDialogue;

    const slotData: SaveSlotData = {
      slotIndex,
      timestamp: Date.now(),
      thumbnailDataUrl,
      currentScene,
      previewText: currentDialogue?.text ? stripControlTags(currentDialogue.text) : '',
      speakerName: this.resolveSpeakerName(currentDialogue),
      dialogueCounter: this.vm.getState().instructionPointer,
      serializedState,
      scriptHash: this.vm.getScriptHash(),
    };

    await this.adapters.storage?.saveSlot?.(slotData);
    this.state.saveSlots[slotIndex - 1] = slotData;
    this.emit();
  }

  public async loadSlot(slotIndex: number): Promise<void> {
    let slot: SaveSlotData | null = null;
    if (slotIndex >= 1 && slotIndex <= 6) {
      slot = this.state.saveSlots[slotIndex - 1] ?? null;
    }
    if (!slot && this.adapters.storage?.loadSlot) {
      slot = await this.adapters.storage.loadSlot(slotIndex);
    }

    if (!slot) {
      throw new Error(`Save slot ${slotIndex} is empty`);
    }

    await this.loadSlotData(slot);
  }

  public async quickSave(): Promise<void> {
    const thumbnailDataUrl = (await this.adapters.renderer?.captureThumbnail?.()) ?? '';
    const serializedState = this.vm.serialize({
      projectId: this.options?.projectId,
    });
    const currentScene = this.vm.getState().currentScene;
    const currentDialogue = this.vm.getState().currentDialogue;

    const slotData: SaveSlotData = {
      slotIndex: 0,
      timestamp: Date.now(),
      thumbnailDataUrl,
      currentScene,
      previewText: currentDialogue?.text ? stripControlTags(currentDialogue.text) : '',
      speakerName: this.resolveSpeakerName(currentDialogue),
      dialogueCounter: this.vm.getState().instructionPointer,
      serializedState,
      scriptHash: this.vm.getScriptHash(),
    };

    await this.adapters.storage?.saveSlot?.(slotData);
    this.state.quickSaveSlot = slotData;
    this.emit();
  }

  public async quickLoad(): Promise<void> {
    const slot =
      this.state.quickSaveSlot ?? (await this.adapters.storage?.getQuickSave?.()) ?? null;

    if (!slot) return;
    await this.loadSlotData(slot);
  }

  private async loadSlotData(slot: SaveSlotData): Promise<void> {
    const previousStateJson = this.vm.serialize();
    this.pendingRestoreSnapshot = previousStateJson;
    this.pendingDesyncSlot = slot;

    const restoreResult = this.vm.restore(slot.serializedState);

    if (restoreResult.desyncWarning) {
      this.state.activeModal = 'desync';
      this.state.desyncData = {
        slotIndex: slot.slotIndex,
        currentHash: restoreResult.currentHash ?? this.vm.getScriptHash(),
        saveHash: restoreResult.savedHash ?? slot.scriptHash ?? '',
        sceneName: slot.currentScene,
      };
      this.emit();
      return;
    }

    this.applyCatchUpSync();
    this.state.mode = 'GAMEPLAY';
    this.state.activeModal = 'none';
    this.pendingRestoreSnapshot = null;
    this.pendingDesyncSlot = null;
    this.emit();
  }

  public resolveDesync(choice: 'continue' | 'restart' | 'cancel'): void {
    if (choice === 'cancel') {
      if (this.pendingRestoreSnapshot) {
        this.vm.restore(this.pendingRestoreSnapshot);
      }
      this.applyCatchUpSync();
      this.state.activeModal = 'none';
      this.state.desyncData = undefined;
      this.pendingRestoreSnapshot = null;
      this.pendingDesyncSlot = null;
      this.emit();
    } else if (choice === 'continue') {
      this.applyCatchUpSync();
      this.state.mode = 'GAMEPLAY';
      this.state.activeModal = 'none';
      this.state.desyncData = undefined;
      this.pendingRestoreSnapshot = null;
      this.pendingDesyncSlot = null;
      this.emit();
    } else if (choice === 'restart') {
      if (this.pendingDesyncSlot) {
        this.vm.jumpToScene(this.pendingDesyncSlot.currentScene, {
          seedCatchUp: true,
        });
      }
      this.applyCatchUpSync();
      this.state.mode = 'GAMEPLAY';
      this.state.activeModal = 'none';
      this.state.desyncData = undefined;
      this.pendingRestoreSnapshot = null;
      this.pendingDesyncSlot = null;
      this.emit();
    }
  }

  public getVariables(): Record<string, unknown> {
    return { ...this.vm.getState().variables };
  }

  public setVariable(name: string, value: unknown, scope?: 'global' | 'local'): void {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      this.vm.setVariable(name, value, scope);
      this.emit();
    }
  }

  public async loadProgram(program: Instruction[], options?: LoadProgramOptions): Promise<void> {
    if (options?.characters) {
      this.registerCharacters(options.characters);
    }

    const isCurrentlyGameplay = this.state.mode === 'GAMEPLAY';
    const shouldPreserve = options?.preserveState ?? isCurrentlyGameplay;
    const preservedVars = shouldPreserve ? this.getVariables() : {};

    this.vm = new VisualNovelVM(program, {
      variables: preservedVars as Record<string, string | number | boolean>,
    });

    if (options?.line !== undefined) {
      this.vm.jumpToLine(options.line, undefined, { seedCatchUp: true });
    } else if (options?.scene) {
      this.vm.jumpToScene(options.scene, { seedCatchUp: true });
    }

    if (this.state.mode === 'STANDBY') {
      await this.startNewGame();
      return;
    }

    if (this.state.mode === 'GAMEPLAY') {
      this.applyCatchUpSync();
      if (options?.line !== undefined || options?.scene) {
        await this.runForward();
      }
      this.emit();
    } else {
      this.emit();
    }
  }
}
