// ================================================================
// BỘ ĐIỀU PHỐI RUNTIME PLAYER (VN PLAYER CONTROLLER)
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 & Architecture
// ================================================================

import { VisualNovelVM } from '@vn-engine/core-vm';
import { GameRenderer } from '@vn-engine/renderer';
import { AudioManager } from '@vn-engine/audio';
import type { Instruction, DialogueInstruction } from '@vn-engine/shared-types';
import { Typewriter } from './ui/typewriter';
import { GameStorage, type SaveSlotData, SLOTS_PER_PAGE, TOTAL_SLOTS } from './storage';

export interface BacklogEntry {
  speaker: string | null;
  text: string;
}

const CHAR_COLOR_MAP: Record<string, string> = {
  ALICE: '#38bdf8', // Xanh dương
  BOB: '#f43f5e',   // Đỏ hồng
  '???': '#eab308', // Vàng ẩn danh
};

export class VNPlayer {
  public vm: VisualNovelVM;
  public renderer: GameRenderer;
  public audio: AudioManager;

  private typewriter: Typewriter;
  private backlog: BacklogEntry[] = [];

  private isAuto: boolean = false;
  private isSkip: boolean = false;
  private isHudHidden: boolean = false;
  private autoTimerId: number | null = null;
  private skipTimerId: number | null = null;
  private toastTimerId: number | null = null;
  private currentSavePage: number = 0;

  // DOM Elements
  private gameRoot: HTMLElement;
  private canvasContainer: HTMLElement;
  private uiLayer: HTMLElement;
  private dialogueBox: HTMLElement;
  private dialogueText: HTMLElement;
  private speakerNameplate: HTMLElement;
  private nextIndicator: HTMLElement;
  private choiceOverlay: HTMLElement;
  private choiceList: HTMLElement;
  private selectedChoiceIndex: number = 0;
  private choiceButtons: HTMLButtonElement[] = [];
  private toastNotification: HTMLElement;

  // Control Buttons
  private btnBack: HTMLButtonElement;
  private btnNext: HTMLButtonElement;
  private btnAuto: HTMLButtonElement;
  private btnSkip: HTMLButtonElement;
  private btnQSave: HTMLButtonElement;
  private btnQLoad: HTMLButtonElement;
  private btnSave: HTMLButtonElement;
  private btnLoad: HTMLButtonElement;
  private btnLog: HTMLButtonElement;
  private btnAudio: HTMLButtonElement;
  private btnHideUI: HTMLButtonElement;
  private btnDebug: HTMLButtonElement;

  // Modals
  private modalSaveLoad: HTMLElement;
  private saveLoadTitle: HTMLElement;
  private saveSlotsContainer: HTMLElement;
  private savePageButtons: HTMLButtonElement[] = [];
  private modalBacklog: HTMLElement;
  private backlogContainer: HTMLElement;
  private modalAudio: HTMLElement;
  private modalDebug: HTMLElement;

  private activeModalMode: 'save' | 'load' = 'save';
  private currentDialogueInstruction: DialogueInstruction | null = null;

  constructor(program: Instruction[]) {
    this.vm = new VisualNovelVM(program, undefined, {
      customFunctions: {
        has_item: (item: unknown) => item === 'flower',
      },
    });
    this.renderer = new GameRenderer({ width: 1920, height: 1080 });
    this.audio = new AudioManager();

    // Lấy các phần tử DOM
    this.gameRoot = document.getElementById('game-root')!;
    this.canvasContainer = document.getElementById('canvas-container')!;
    this.uiLayer = document.getElementById('ui-layer')!;
    this.dialogueBox = document.getElementById('dialogue-box')!;
    this.dialogueText = document.getElementById('dialogue-text')!;
    this.speakerNameplate = document.getElementById('speaker-nameplate')!;
    this.nextIndicator = document.getElementById('dialogue-next-indicator')!;
    this.choiceOverlay = document.getElementById('choice-overlay')!;
    this.choiceList = document.getElementById('choice-buttons-list')!;
    this.toastNotification = document.getElementById('toast-notification')!;

    this.btnBack = document.getElementById('btn-back') as HTMLButtonElement;
    this.btnNext = document.getElementById('btn-next') as HTMLButtonElement;
    this.btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
    this.btnSkip = document.getElementById('btn-skip') as HTMLButtonElement;
    this.btnQSave = document.getElementById('btn-qsave') as HTMLButtonElement;
    this.btnQLoad = document.getElementById('btn-qload') as HTMLButtonElement;
    this.btnSave = document.getElementById('btn-save') as HTMLButtonElement;
    this.btnLoad = document.getElementById('btn-load') as HTMLButtonElement;
    this.btnLog = document.getElementById('btn-log') as HTMLButtonElement;
    this.btnAudio = document.getElementById('btn-audio') as HTMLButtonElement;
    this.btnHideUI = document.getElementById('btn-hide-ui') as HTMLButtonElement;
    this.btnDebug = document.getElementById('btn-debug') as HTMLButtonElement;

    this.modalSaveLoad = document.getElementById('modal-saveload')!;
    this.saveLoadTitle = document.getElementById('saveload-title')!;
    this.saveSlotsContainer = document.getElementById('save-slots-container')!;
    this.savePageButtons = Array.from(document.querySelectorAll('.save-page-btn'));
    this.modalBacklog = document.getElementById('modal-backlog')!;
    this.backlogContainer = document.getElementById('backlog-container')!;
    this.modalAudio = document.getElementById('modal-audio')!;
    this.modalDebug = document.getElementById('modal-debug')!;

    this.typewriter = new Typewriter(this.dialogueText, 22);
  }

  /**
   * Khởi động Player, thiết lập Canvas và gán sự kiện
   */
  public async start(): Promise<void> {
    await this.renderer.init(this.canvasContainer);

    window.addEventListener('resize', () => {
      this.renderer.resizeToContainer(this.canvasContainer);
    });

    this.setupEventListeners();
    this.updateControlsState();

    // Bước vào câu đầu tiên
    await this.advance();
  }

  /**
   * Gán toàn bộ sự kiện click, phím tắt và thao tác chuột
   */
  private setupEventListeners(): void {
    // Click vào hộp thoại để tiến hoặc hoàn thành chữ gõ ngay
    this.dialogueBox.addEventListener('click', () => {
      this.handleAdvanceAction();
    });

    this.btnNext.addEventListener('click', () => {
      this.handleAdvanceAction();
    });

    this.btnBack.addEventListener('click', () => {
      this.rollback();
    });

    this.btnAuto.addEventListener('click', () => {
      this.toggleAuto();
    });

    this.btnSkip.addEventListener('click', () => {
      this.toggleSkip();
    });

    this.btnQSave.addEventListener('click', () => {
      void this.quickSave();
    });

    this.btnQLoad.addEventListener('click', () => {
      this.quickLoad();
    });

    this.btnSave.addEventListener('click', () => {
      this.openSaveLoadModal('save');
    });

    this.btnLoad.addEventListener('click', () => {
      this.openSaveLoadModal('load');
    });

    this.btnLog.addEventListener('click', () => {
      this.openBacklogModal();
    });

    this.btnAudio.addEventListener('click', () => {
      this.openAudioModal();
    });

    this.btnHideUI?.addEventListener('click', () => {
      this.toggleHideUI();
    });

    this.btnDebug.addEventListener('click', () => {
      this.openDebugModal();
    });

    // Chuột giữa (Middle Click) để ẩn/hiện HUD thoại
    this.gameRoot.addEventListener('auxclick', e => {
      if (e.button === 1) {
        e.preventDefault();
        this.toggleHideUI();
      }
    });

    // Các nút chuyển trang Save/Load
    this.savePageButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentSavePage = parseInt(btn.dataset.page || '0', 10);
        this.renderSaveSlots();
      });
    });

    // Đóng modals
    document.getElementById('btn-close-saveload')?.addEventListener('click', () => {
      this.modalSaveLoad.classList.add('hidden');
    });
    document.getElementById('btn-close-backlog')?.addEventListener('click', () => {
      this.modalBacklog.classList.add('hidden');
    });
    document.getElementById('btn-close-audio')?.addEventListener('click', () => {
      this.modalAudio.classList.add('hidden');
    });
    document.getElementById('btn-close-debug')?.addEventListener('click', () => {
      this.modalDebug.classList.add('hidden');
    });

    // Audio Sliders & Hiển thị % âm lượng
    const sliderMaster = document.getElementById('slider-master') as HTMLInputElement;
    sliderMaster?.addEventListener('input', () => {
      const val = parseFloat(sliderMaster.value);
      this.audio.setMasterVolume(val);
    });

    const sliderBgm = document.getElementById('slider-bgm') as HTMLInputElement;
    sliderBgm?.addEventListener('input', () => {
      const val = parseFloat(sliderBgm.value);
      this.audio.setChannelVolume('music', val);
    });

    const sliderSfx = document.getElementById('slider-sfx') as HTMLInputElement;
    sliderSfx?.addEventListener('input', () => {
      const val = parseFloat(sliderSfx.value);
      this.audio.setChannelVolume('sound', val);
    });

    const btnMute = document.getElementById('btn-mute-toggle') as HTMLButtonElement;
    btnMute?.addEventListener('click', () => {
      this.toggleMute();
    });

    // Phím tắt toàn cầu (Keyboard Shortcuts)
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 1. Phím Escape để đóng modal
      if (e.key === 'Escape') {
        if (this.isAnyModalOpen()) {
          this.closeAllModals();
          return;
        }
        if (this.isHudHidden) {
          this.toggleHideUI();
          return;
        }
      }

      // 2. Phím H để Ẩn/Hiện giao diện (Hide UI Mode)
      if (e.code === 'KeyH' && !this.isAnyModalOpen()) {
        e.preventDefault();
        this.toggleHideUI();
        return;
      }

      // 3. Phím Mute âm thanh (Phím M)
      if (e.code === 'KeyM' && !this.isAnyModalOpen()) {
        e.preventDefault();
        this.toggleMute();
        return;
      }

      // 4. Nếu HUD đang ẩn, bấm bất kỳ phím nào (Space, Enter, Mũi tên) sẽ hiện lại HUD
      if (this.isHudHidden) {
        if (['Space', 'Enter', 'ArrowRight', 'ArrowLeft'].includes(e.code)) {
          e.preventDefault();
          this.toggleHideUI();
          return;
        }
      }

      // 5. Nếu đang mở modal thì không nhận phím tắt chơi game
      if (this.isAnyModalOpen()) return;

      // 6. Phím tắt chọn rẽ nhánh khi đang mở menu lựa chọn
      if (!this.choiceOverlay.classList.contains('hidden')) {
        // Phím số 1-9
        if (e.key >= '1' && e.key <= '9') {
          const index = parseInt(e.key, 10) - 1;
          const targetBtn = this.choiceButtons[index];
          if (targetBtn && !targetBtn.disabled) {
            e.preventDefault();
            targetBtn.click();
            return;
          }
        }

        // Điều hướng mũi tên lên/xuống
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateChoice(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateChoice(-1);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const curBtn = this.choiceButtons[this.selectedChoiceIndex];
          if (curBtn && !curBtn.disabled) {
            curBtn.click();
          }
          return;
        }
        return;
      }

      // 7. Phím tắt điều khiển tiến lùi kịch bản
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.handleAdvanceAction();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.rollback();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this.toggleAuto();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.toggleSkip();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        this.openBacklogModal();
      }
    });
  }

  /**
   * Ẩn / hiện toàn bộ giao diện hộp thoại (Hide UI Mode)
   */
  public toggleHideUI(): void {
    this.isHudHidden = !this.isHudHidden;
    if (this.isHudHidden) {
      this.uiLayer.classList.add('hud-hidden');
      if (this.btnHideUI) this.btnHideUI.textContent = '[SHOW H]';
    } else {
      this.uiLayer.classList.remove('hud-hidden');
      if (this.btnHideUI) this.btnHideUI.textContent = '[HIDE H]';
    }
  }

  /**
   * Hiển thị thông báo Toast ngắn
   */
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
    }, 2000);
  }

  /**
   * Bật/tắt Mute âm thanh
   */
  public toggleMute(): void {
    const btnMute = document.getElementById('btn-mute-toggle') as HTMLButtonElement;
    if (this.audio.isMuted()) {
      this.audio.unmute();
      if (btnMute) btnMute.textContent = '[ Mute / Tắt tiếng: TẮT (Phím M) ]';
      this.showToast('Âm thanh: BẬT');
    } else {
      this.audio.mute();
      if (btnMute) btnMute.textContent = '[ Mute / Tắt tiếng: BẬT (Phím M) ]';
      this.showToast('Âm thanh: ĐÃ TẮT');
    }
  }

  private isAnyModalOpen(): boolean {
    return (
      !this.modalSaveLoad.classList.contains('hidden') ||
      !this.modalBacklog.classList.contains('hidden') ||
      !this.modalAudio.classList.contains('hidden') ||
      !this.modalDebug.classList.contains('hidden')
    );
  }

  private closeAllModals(): void {
    this.modalSaveLoad.classList.add('hidden');
    this.modalBacklog.classList.add('hidden');
    this.modalAudio.classList.add('hidden');
    this.modalDebug.classList.add('hidden');
  }

  /**
   * Xử lý tương tác tiến câu thoại
   */
  private handleAdvanceAction(): void {
    if (this.isHudHidden) {
      this.toggleHideUI();
      return;
    }

    if (this.typewriter.isTyping()) {
      this.typewriter.finishImmediately();
      return;
    }

    if (!this.choiceOverlay.classList.contains('hidden')) {
      return;
    }

    void this.advance();
  }

  /**
   * Tiến máy ảo tới điểm tương tác tiếp theo
   */
  public async advance(): Promise<void> {
    this.clearAutoTimer();

    const runResult = this.vm.runUntilInteractive();

    // 1. Thực thi các side-effects tích lũy dọc đường (chuyển cảnh, hiện sprite, âm thanh)
    for (const sideEffect of runResult.sideEffects) {
      await this.applySideEffect(sideEffect);
    }

    // 2. Xử lý kết quả dừng
    const step = runResult.stepResult;

    if (step.type === 'SUSPEND_DIALOGUE') {
      const instr = step.instruction as DialogueInstruction;
      this.currentDialogueInstruction = instr;

      // Hỗ trợ Custom UI Theme cấp phân cảnh
      if (instr.uiScreenId) {
        this.gameRoot.className = `ui-skin-${instr.uiScreenId}`;
      } else {
        this.gameRoot.className = '';
      }

      // Cập nhật Nameplate
      let speakerDisplay = instr.character;
      if (instr.character) {
        const vmState = this.vm.getState();
        speakerDisplay =
          vmState.characterDisplayOverrides[instr.character] ??
          instr.displayNameOverride ??
          instr.character;
      }

      if (speakerDisplay) {
        const charKey = speakerDisplay.toUpperCase();
        const charColor = CHAR_COLOR_MAP[charKey] || '#ffffff';
        this.speakerNameplate.textContent = charKey;
        this.speakerNameplate.style.color = charColor;
        this.speakerNameplate.style.borderColor = charColor;
        this.speakerNameplate.classList.remove('hidden');
      } else {
        this.speakerNameplate.classList.add('hidden');
      }

      // Lưu vào Backlog
      this.backlog.push({
        speaker: speakerDisplay,
        text: instr.text,
      });

      // Bắt đầu gõ chữ
      this.nextIndicator.style.opacity = '0';
      this.typewriter.start(instr.text, () => {
        this.nextIndicator.style.opacity = '1';
        this.onDialogueLineFinished();
      });

      this.updateControlsState();
    } else if (step.type === 'SUSPEND_CHOICE') {
      this.clearSkip();
      this.presentChoices();
    } else if (step.type === 'HALTED') {
      this.clearAutoTimer();
      this.clearSkip();
      this.speakerNameplate.classList.add('hidden');
      this.dialogueText.textContent = '[ KỊCH BẢN ĐÃ KẾT THÚC ]';
      this.nextIndicator.textContent = '■ Kết thúc';
      this.nextIndicator.style.opacity = '1';
      this.updateControlsState();
    }
  }

  private onDialogueLineFinished(): void {
    if (this.isSkip) {
      setTimeout(() => {
        void this.advance();
      }, 50);
    } else if (this.isAuto) {
      this.autoTimerId = window.setTimeout(() => {
        void this.advance();
      }, 1600);
    }
  }

  /**
   * Áp dụng lệnh ngoại vi (Side effect) lên Renderer hoặc Audio
   */
  private async applySideEffect(instr: Instruction): Promise<void> {
    if (instr.type === 'BACKGROUND') {
      await this.renderer.setBackground(instr.assetId, instr.transition);
    } else if (instr.type === 'SHOW') {
      await this.renderer.showCharacter(instr);
    } else if (instr.type === 'HIDE') {
      this.renderer.hideCharacter(instr.character);
    } else if (instr.type === 'PLAY') {
      this.audio.play(instr.channel, instr.assetId, instr.assetId, {
        volume: instr.volume,
        loop: instr.loop,
        fadeIn: instr.fadeIn,
      });
    } else if (instr.type === 'STOP') {
      this.audio.stop(instr.channel, { fadeOut: instr.fadeOut });
    }
  }

  /**
   * Hiển thị danh sách lựa chọn rẽ nhánh kèm phím tắt số [1], [2]
   */
  private presentChoices(): void {
    const choices = this.vm.getAvailableChoices();
    this.choiceList.innerHTML = '';
    this.choiceButtons = [];
    this.selectedChoiceIndex = 0;

    const firstEnabledIndex = choices.findIndex(c => c.enabled);
    if (firstEnabledIndex !== -1) {
      this.selectedChoiceIndex = firstEnabledIndex;
    }

    choices.forEach((choice: { text: string; enabled: boolean }, index: number) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      const keyHint = `<span class="choice-key-hint">[${index + 1}]</span>`;

      if (!choice.enabled) {
        btn.disabled = true;
        btn.innerHTML = `${keyHint}<span>${choice.text} (Chưa đủ điều kiện)</span>`;
      } else {
        btn.innerHTML = `${keyHint}<span>${choice.text}</span>`;
        btn.addEventListener('click', () => {
          this.choiceOverlay.classList.add('hidden');
          this.vm.choose(index);
          void this.advance();
        });
      }

      this.choiceList.appendChild(btn);
      this.choiceButtons.push(btn);
    });

    this.updateChoiceVisualSelection();
    this.choiceOverlay.classList.remove('hidden');
  }

  private navigateChoice(direction: number): void {
    const total = this.choiceButtons.length;
    if (total === 0) return;

    let nextIndex = this.selectedChoiceIndex;
    for (let i = 0; i < total; i++) {
      nextIndex = (nextIndex + direction + total) % total;
      if (!this.choiceButtons[nextIndex]?.disabled) {
        this.selectedChoiceIndex = nextIndex;
        break;
      }
    }
    this.updateChoiceVisualSelection();
  }

  private updateChoiceVisualSelection(): void {
    this.choiceButtons.forEach((btn, idx) => {
      if (idx === this.selectedChoiceIndex && !btn.disabled) {
        btn.classList.add('selected');
        btn.focus();
      } else {
        btn.classList.remove('selected');
      }
    });
  }

  /**
   * Tua lại 1 câu thoại trước đó (Rollback)
   */
  public rollback(): boolean {
    if (!this.vm.canRollback()) return false;

    this.clearAutoTimer();
    this.clearSkip();
    this.choiceOverlay.classList.add('hidden');

    const success = this.vm.rollback();
    if (!success) return false;

    const catchUp = this.vm.getStateCatchUp();

    if (this.backlog.length > 0) {
      this.backlog.pop();
    }

    void this.renderer.syncStateCatchUp({
      background: catchUp.background,
      sprites: catchUp.sprites,
    });
    this.audio.syncStateCatchUp(catchUp.audio, (id: string) => id);

    if (catchUp.currentDialogue) {
      this.currentDialogueInstruction = catchUp.currentDialogue;
      let speakerDisplay = catchUp.currentDialogue.character;
      if (catchUp.currentDialogue.character) {
        const vmState = this.vm.getState();
        speakerDisplay =
          vmState.characterDisplayOverrides[catchUp.currentDialogue.character] ??
          catchUp.currentDialogue.displayNameOverride ??
          catchUp.currentDialogue.character;
      }

      if (speakerDisplay) {
        const charKey = speakerDisplay.toUpperCase();
        const charColor = CHAR_COLOR_MAP[charKey] || '#ffffff';
        this.speakerNameplate.textContent = charKey;
        this.speakerNameplate.style.color = charColor;
        this.speakerNameplate.style.borderColor = charColor;
        this.speakerNameplate.classList.remove('hidden');
      } else {
        this.speakerNameplate.classList.add('hidden');
      }

      this.typewriter.stop();
      this.dialogueText.textContent = catchUp.currentDialogue.text;
      this.nextIndicator.style.opacity = '1';
    }

    this.updateControlsState();
    return true;
  }

  /**
   * Bật/tắt chế độ Auto
   */
  public toggleAuto(): void {
    this.isAuto = !this.isAuto;
    if (this.isAuto) {
      this.clearSkip();
      this.btnAuto.classList.add('active');
      this.showToast('Tự động chạy: BẬT');
      if (!this.typewriter.isTyping()) {
        this.onDialogueLineFinished();
      }
    } else {
      this.clearAutoTimer();
      this.btnAuto.classList.remove('active');
      this.showToast('Tự động chạy: TẮT');
    }
  }

  /**
   * Bật/tắt chế độ Skip
   */
  public toggleSkip(): void {
    this.isSkip = !this.isSkip;
    if (this.isSkip) {
      this.clearAutoTimer();
      this.btnSkip.classList.add('active');
      this.showToast('Tua nhanh: BẬT');
      if (this.typewriter.isTyping()) {
        this.typewriter.finishImmediately();
      } else {
        void this.advance();
      }
    } else {
      this.clearSkip();
      this.showToast('Tua nhanh: TẮT');
    }
  }

  private clearAutoTimer(): void {
    if (this.autoTimerId !== null) {
      clearTimeout(this.autoTimerId);
      this.autoTimerId = null;
    }
  }

  private clearSkip(): void {
    this.isSkip = false;
    this.btnSkip.classList.remove('active');
    if (this.skipTimerId !== null) {
      clearTimeout(this.skipTimerId);
      this.skipTimerId = null;
    }
  }

  private updateControlsState(): void {
    this.btnBack.disabled = !this.vm.canRollback();
  }

  /**
   * Mở Modal Lưu hoặc Tải game
   */
  public openSaveLoadModal(mode: 'save' | 'load'): void {
    this.activeModalMode = mode;
    this.saveLoadTitle.textContent =
      mode === 'save' ? '[ LƯU TRÒ CHƠI - SAVE GAME ]' : '[ TẢI TRÒ CHƠI - LOAD GAME ]';
    this.renderSaveSlots();
    this.modalSaveLoad.classList.remove('hidden');
  }

  private renderSaveSlots(): void {
    const slots = GameStorage.getSlots();
    this.saveSlotsContainer.innerHTML = '';

    // Cập nhật trạng thái các nút phân trang
    this.savePageButtons.forEach(btn => {
      const pageIdx = parseInt(btn.dataset.page || '0', 10);
      if (pageIdx === this.currentSavePage) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const startIndex = this.currentSavePage * SLOTS_PER_PAGE;
    const endIndex = Math.min(startIndex + SLOTS_PER_PAGE, TOTAL_SLOTS);

    for (let index = startIndex; index < endIndex; index++) {
      const slot = slots[index];
      const card = document.createElement('div');
      card.className = 'save-slot-card';

      if (slot) {
        const dateStr = new Date(slot.timestamp).toLocaleString('vi-VN');
        card.innerHTML = `
          <div class="slot-header-row">
            <span class="slot-scene">[Ô ${index + 1}] ${slot.sceneName}</span>
            <span class="slot-badge saved">ĐÃ LƯU</span>
          </div>
          <img class="slot-thumbnail" src="${slot.thumbnail}" alt="Thumbnail" />
          <div class="slot-meta">
            <span>${dateStr}</span>
          </div>
          <div class="slot-actions">
            <button class="slot-btn-action slot-btn-delete" data-action="delete" title="Xóa ô này">[Xóa]</button>
            <button class="slot-btn-action" data-action="confirm">${this.activeModalMode === 'save' ? '[Ghi đè]' : '[Tải]'}</button>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="slot-header-row">
            <span class="slot-scene">[Ô ${index + 1}] Trống</span>
            <span class="slot-badge">TRỐNG</span>
          </div>
          <div class="slot-thumbnail">[ CHƯA CÓ DỮ LIỆU ]</div>
          <div class="slot-meta"><span>--/--/----</span></div>
          <div class="slot-actions">
            <button class="slot-btn-action" data-action="confirm">${this.activeModalMode === 'save' ? '[Lưu vào đây]' : '[Không thể tải]'}</button>
          </div>
        `;
      }

      // Xử lý sự kiện click trên card
      card.addEventListener('click', async (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;

        if (action === 'delete') {
          e.stopPropagation();
          GameStorage.deleteSlot(index);
          this.showToast(`Đã xóa ô lưu số ${index + 1}`);
          this.renderSaveSlots();
          return;
        }

        if (this.activeModalMode === 'save') {
          await this.saveToSlot(index);
          this.showToast(`Đã lưu thành công vào Ô ${index + 1}`);
          this.renderSaveSlots();
        } else {
          if (slot) {
            this.loadFromSlot(index);
            this.showToast(`Đã tải thành công Ô ${index + 1}`);
            this.modalSaveLoad.classList.add('hidden');
          } else {
            this.showToast('Ô này trống, không có dữ liệu tải!');
          }
        }
      });

      this.saveSlotsContainer.appendChild(card);
    }
  }

  private async saveToSlot(slotIndex: number): Promise<void> {
    const thumbnail = await this.renderer.captureThumbnail(320, 180);
    const vmState = this.vm.getState();
    const data: Omit<SaveSlotData, 'slotIndex'> = {
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: this.vm.serialize(),
      dialoguePreview: this.currentDialogueInstruction?.text || '',
    };
    GameStorage.saveSlot(slotIndex, data);
  }

  private loadFromSlot(slotIndex: number): void {
    const slot = GameStorage.loadSlot(slotIndex);
    if (!slot) return;
    this.restoreFromSlotData(slot);
  }

  public async quickSave(): Promise<void> {
    const thumbnail = await this.renderer.captureThumbnail(320, 180);
    const vmState = this.vm.getState();
    GameStorage.quickSave({
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: this.vm.serialize(),
      dialoguePreview: this.currentDialogueInstruction?.text || '',
    });
    this.showToast('● ĐÃ LƯU NHANH (QUICK SAVE)');
  }

  public quickLoad(): void {
    const slot = GameStorage.quickLoad();
    if (!slot) {
      this.showToast('Chưa có bản lưu nhanh nào!');
      return;
    }
    this.restoreFromSlotData(slot);
    this.showToast('● ĐÃ TẢI NHANH (QUICK LOAD)');
  }

  private restoreFromSlotData(slot: SaveSlotData): void {
    this.clearAutoTimer();
    this.clearSkip();
    this.choiceOverlay.classList.add('hidden');

    this.vm.restore(slot.vmStateJson);

    // Kích hoạt State Catch-up
    const catchUp = this.vm.getStateCatchUp();
    void this.renderer.syncStateCatchUp({
      background: catchUp.background,
      sprites: catchUp.sprites,
    });
    this.audio.syncStateCatchUp(catchUp.audio, (id: string) => id);

    if (catchUp.currentDialogue) {
      this.currentDialogueInstruction = catchUp.currentDialogue;
      const speaker = catchUp.currentDialogue.character;
      if (speaker) {
        const charKey = speaker.toUpperCase();
        const charColor = CHAR_COLOR_MAP[charKey] || '#ffffff';
        this.speakerNameplate.textContent = charKey;
        this.speakerNameplate.style.color = charColor;
        this.speakerNameplate.style.borderColor = charColor;
        this.speakerNameplate.classList.remove('hidden');
      } else {
        this.speakerNameplate.classList.add('hidden');
      }
      this.typewriter.stop();
      this.dialogueText.textContent = catchUp.currentDialogue.text;
      this.nextIndicator.style.opacity = '1';
    }

    this.updateControlsState();
  }

  /**
   * Mở ngăn kéo Backlog
   */
  public openBacklogModal(): void {
    this.backlogContainer.innerHTML = '';
    this.backlog.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'backlog-item';
      if (entry.speaker) {
        item.innerHTML = `
          <div class="backlog-speaker">${entry.speaker.toUpperCase()}</div>
          <div class="backlog-text">${entry.text}</div>
        `;
      } else {
        item.innerHTML = `<div class="backlog-text">${entry.text}</div>`;
      }
      this.backlogContainer.appendChild(item);
    });
    this.modalBacklog.classList.remove('hidden');

    // Tự động cuộn xuống đáy
    const modalBody = this.modalBacklog.querySelector('.wf-modal-body');
    if (modalBody) {
      modalBody.scrollTop = modalBody.scrollHeight;
    }
  }

  public openAudioModal(): void {
    this.modalAudio.classList.remove('hidden');
  }

  /**
   * Mở bảng Debug Inspector thời gian thực
   */
  public openDebugModal(): void {
    const vmState = this.vm.getState();
    document.getElementById('debug-scene')!.textContent = vmState.currentScene;
    document.getElementById('debug-ip')!.textContent = vmState.instructionPointer.toString();
    document.getElementById('debug-callstack')!.textContent = vmState.callStack.length.toString();

    // Biến
    const varBody = document.getElementById('debug-variables-body')!;
    varBody.innerHTML = '';
    for (const [name, val] of Object.entries(vmState.variables)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name}</td><td><strong>${val}</strong></td><td>${typeof val}</td>`;
      varBody.appendChild(tr);
    }

    // Audio
    const audioBody = document.getElementById('debug-audio-body')!;
    audioBody.innerHTML = '';
    for (const ch of this.audio.getChannelsState()) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ch.name}</td>
        <td>${ch.currentAssetId ?? '-'}</td>
        <td>${Math.round(ch.volume * 100)}%</td>
        <td>${ch.loop ? 'Có' : 'Không'}</td>
        <td>${ch.isPlaying ? 'Đang phát' : 'Dừng'}</td>
      `;
      audioBody.appendChild(tr);
    }

    this.modalDebug.classList.remove('hidden');
  }

  /**
   * Tải lại và bắt đầu thực thi chương trình bytecode mới (Hot Reload / Live Preview)
   */
  public async reloadProgram(program: Instruction[]): Promise<void> {
    // 1. Dừng các tiến trình tự động hoặc tua nhanh
    this.clearAutoTimer();
    this.clearSkip();

    // 2. Dừng âm thanh đang phát trên các kênh
    this.audio.stop('music');
    this.audio.stop('sound');

    // 3. Reset đồ họa hiển thị về trạng thái trắng/trống
    await this.renderer.syncStateCatchUp({ background: undefined, sprites: new Map() });

    // 4. Khởi tạo lại máy ảo và xóa lịch sử thoại (backlog)
    this.vm = new VisualNovelVM(program, undefined, {
      customFunctions: {
        has_item: (item: unknown) => item === 'flower',
      },
    });
    this.backlog = [];
    this.currentDialogueInstruction = null;

    // 5. Reset giao diện UI
    this.choiceOverlay.classList.add('hidden');
    this.choiceList.innerHTML = '';
    this.choiceButtons = [];
    this.dialogueBox.classList.remove('hidden');
    this.dialogueText.textContent = '';
    this.speakerNameplate.textContent = '';
    this.speakerNameplate.classList.add('hidden');
    this.nextIndicator.textContent = '▼ Tiếp tục [Space / Click]';
    this.nextIndicator.style.opacity = '0';
    this.closeAllModals();

    // 6. Cập nhật thanh điều khiển và bước vào kịch bản mới
    this.updateControlsState();
    if (program.length > 0) {
      await this.advance();
    } else {
      this.dialogueText.textContent = '[ KỊCH BẢN TRỐNG - ĐANG CHỜ LỆNH ]';
    }
  }
}
