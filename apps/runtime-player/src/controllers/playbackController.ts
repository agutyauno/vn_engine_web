// ================================================================
// VN RUNTIME PLAYER - PLAYBACK CONTROLLER MODULE
// Điều phối Auto, Skip, Rollback, UI Scale và Bộ đếm thời gian
// ================================================================

import type { PlayerContext } from '../playerContext';
import type { DialogueView } from '../ui/dialogueView';
import type { ChoiceOverlay } from '../ui/choiceOverlay';
import type { InspectModal } from '../ui/inspectModal';
import { CHAR_COLOR_MAP } from '../ui/dialogueView';

export class PlaybackController {
  private context: PlayerContext;
  private dialogueView: DialogueView;
  private choiceOverlay: ChoiceOverlay;
  private inspectModal: InspectModal;

  private gameRoot: HTMLElement;
  private btnBack: HTMLButtonElement;
  private btnAuto: HTMLButtonElement;
  private btnSkip: HTMLButtonElement;
  private btnHideUI: HTMLButtonElement;

  private isAuto: boolean = false;
  private isSkip: boolean = false;
  private isHudHidden: boolean = false;
  private isAdvancing: boolean = false;
  private advanceQueued: boolean = false;

  private autoTimerId: number | null = null;
  private skipTimerId: number | null = null;
  private waitTimerId: number | null = null;

  constructor(
    context: PlayerContext,
    deps: {
      dialogueView: DialogueView;
      choiceOverlay: ChoiceOverlay;
      inspectModal: InspectModal;
    },
  ) {
    this.context = context;
    this.dialogueView = deps.dialogueView;
    this.choiceOverlay = deps.choiceOverlay;
    this.inspectModal = deps.inspectModal;

    this.gameRoot = document.getElementById('game-root')!;
    this.btnBack = document.getElementById('btn-back') as HTMLButtonElement;
    this.btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
    this.btnSkip = document.getElementById('btn-skip') as HTMLButtonElement;
    this.btnHideUI = document.getElementById('btn-hide-ui') as HTMLButtonElement;
  }

  public getIsAuto(): boolean {
    return this.isAuto;
  }

  public getIsSkip(): boolean {
    return this.isSkip;
  }

  public getIsHudHidden(): boolean {
    return this.isHudHidden;
  }

  public getIsAdvancing(): boolean {
    return this.isAdvancing;
  }

  public setIsAdvancing(val: boolean): void {
    this.isAdvancing = val;
  }

  public getAdvanceQueued(): boolean {
    return this.advanceQueued;
  }

  public setAdvanceQueued(val: boolean): void {
    this.advanceQueued = val;
  }

  public updateUiScale(): void {
    const rect = this.gameRoot.getBoundingClientRect();
    const scale = Math.max(0.1, (rect.width || 1280) / 1280);
    this.gameRoot.style.setProperty('--ui-scale', scale.toString());
  }

  public toggleHideUI(): void {
    this.isHudHidden = !this.isHudHidden;
    this.gameRoot.classList.toggle('hide-hud', this.isHudHidden);
    if (this.btnHideUI) {
      this.btnHideUI.classList.toggle('active', this.isHudHidden);
    }
  }

  public updateControlsState(): void {
    const vm = this.context.getVM();
    if (this.btnBack) {
      this.btnBack.disabled = !vm.canRollback();
    }
    if (this.btnAuto) {
      this.btnAuto.classList.toggle('active', this.isAuto);
    }
    if (this.btnSkip) {
      this.btnSkip.classList.toggle('active', this.isSkip);
    }
  }

  public toggleAuto(onLineFinished?: () => void): void {
    this.isAuto = !this.isAuto;
    if (this.isAuto) {
      this.clearSkip();
      this.btnAuto.classList.add('active');
      this.context.showToast('Auto-forward: ON');
      if (!this.dialogueView.isTyping() && onLineFinished) {
        onLineFinished();
      }
    } else {
      this.clearAutoTimer();
      this.btnAuto.classList.remove('active');
      this.context.showToast('Auto-forward: OFF');
    }
  }

  public toggleSkip(): void {
    this.isSkip = !this.isSkip;
    if (this.isSkip) {
      this.clearAutoTimer();
      this.btnSkip.classList.add('active');
      this.context.showToast('Skip: ON (Tua nhanh câu đã đọc)');
      if (this.dialogueView.isTyping()) {
        this.dialogueView.finishImmediately();
      } else {
        void this.context.advance();
      }
    } else {
      this.clearSkip();
      this.context.showToast('Skip: OFF');
    }
  }

  public clearAutoTimer(): void {
    if (this.autoTimerId !== null) {
      clearTimeout(this.autoTimerId);
      this.autoTimerId = null;
    }
    if (!this.isSkip) {
      this.advanceQueued = false;
    }
  }

  public clearWaitTimer(): void {
    if (this.waitTimerId !== null) {
      clearTimeout(this.waitTimerId);
      this.waitTimerId = null;
    }
  }

  public clearSkip(): void {
    this.isSkip = false;
    this.advanceQueued = false;
    this.btnSkip?.classList.remove('active');
    if (this.skipTimerId !== null) {
      clearTimeout(this.skipTimerId);
      this.skipTimerId = null;
    }
  }

  public scheduleWait(durationSec: number, onComplete: () => void): void {
    const durationMs = this.isSkip ? 20 : Math.max(0, durationSec * 1000);
    this.waitTimerId = window.setTimeout(() => {
      this.waitTimerId = null;
      onComplete();
    }, durationMs);
  }

  public scheduleAutoAdvance(delayMs: number, onAdvance: () => void): void {
    this.clearAutoTimer();
    this.autoTimerId = window.setTimeout(() => {
      this.autoTimerId = null;
      onAdvance();
    }, delayMs);
  }

  public scheduleSkipAdvance(delayMs: number, onAdvance: () => void): void {
    if (this.skipTimerId !== null) {
      clearTimeout(this.skipTimerId);
    }
    this.skipTimerId = window.setTimeout(() => {
      this.skipTimerId = null;
      onAdvance();
    }, delayMs);
  }

  public rollback(): boolean {
    // Nếu đang mở menu lựa chọn, rollback chỉ ẩn menu choice
    if (this.choiceOverlay.isOpen()) {
      this.clearAutoTimer();
      this.clearSkip();
      this.clearWaitTimer();
      this.choiceOverlay.hide();
      const currentDialogue = this.dialogueView.getCurrentDialogue();
      if (currentDialogue?.text && currentDialogue.text.trim().length > 0) {
        this.dialogueView.show();
      }
      this.updateControlsState();
      return true;
    }

    const vm = this.context.getVM();
    if (!vm.canRollback()) {
      this.context.showToast('Cannot rollback further!');
      return false;
    }

    this.clearAutoTimer();
    this.clearSkip();
    this.clearWaitTimer();
    this.choiceOverlay.hide();

    const success = vm.rollback();
    if (!success) return false;

    const catchUp = vm.getStateCatchUp();
    const backlog = this.context.getBacklog();
    if (backlog.length > 0) {
      backlog.pop();
    }

    const renderer = this.context.getRenderer();
    const audio = this.context.getAudio();

    void renderer.syncStateCatchUp(
      {
        background: catchUp.background,
        sprites: catchUp.sprites,
      },
      this.context.getAssetGraphicResolver(),
      (id: string) => this.context.checkIsProp(id),
    );
    audio.syncStateCatchUp(catchUp.audio, this.context.getAssetAudioResolver());

    if (
      catchUp.currentDialogue &&
      catchUp.currentDialogue.text &&
      catchUp.currentDialogue.text.trim().length > 0
    ) {
      this.dialogueView.show();
      this.dialogueView.setCurrentDialogue(catchUp.currentDialogue);
      let speakerDisplay = catchUp.currentDialogue.character;
      if (catchUp.currentDialogue.character) {
        const vmState = vm.getState();
        speakerDisplay =
          vmState.characterDisplayOverrides[catchUp.currentDialogue.character] ??
          catchUp.currentDialogue.displayNameOverride ??
          catchUp.currentDialogue.character;
      }

      const projectData = this.context.getProjectData();
      let charColor = '#38bdf8';
      if (speakerDisplay) {
        const charKey = speakerDisplay.toUpperCase();
        const declaredChar = projectData.characters?.find(
          c =>
            (catchUp.currentDialogue?.character &&
              c.id.toLowerCase() === catchUp.currentDialogue.character.toLowerCase()) ||
            c.name.toLowerCase() === speakerDisplay.toLowerCase(),
        );
        charColor = declaredChar?.colorHex || CHAR_COLOR_MAP[charKey] || '#38bdf8';
      }

      this.dialogueView.updateSpeaker(speakerDisplay, charColor);
      this.dialogueView.renderImmediateText(catchUp.currentDialogue.text);
    } else {
      this.dialogueView.hide();
    }

    if (catchUp.activeInspect) {
      const assetUrl = this.context.getAssetGraphicResolver()(catchUp.activeInspect.assetId);
      this.inspectModal.show(
        catchUp.activeInspect.assetId,
        catchUp.activeInspect.title,
        assetUrl,
      );
    } else {
      this.inspectModal.hide();
    }

    this.updateControlsState();
    return true;
  }
}
