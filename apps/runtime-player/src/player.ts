// ==========================================
// BỘ ĐIỀU PHỐI RUNTIME PLAYER (VN PLAYER)
// ==========================================

import { VisualNovelVM } from '@vn-engine/core-vm';
import { GameRenderer } from '@vn-engine/renderer';
import { AudioManager } from '@vn-engine/audio';
import type { Instruction, DialogueInstruction } from '@vn-engine/shared-types';
import { Typewriter } from './ui/typewriter';
import { GameStorage, type SaveSlotData } from './storage';

export interface BacklogEntry {
  speaker: string | null;
  text: string;
}

export class VNPlayer {
  public vm: VisualNovelVM;
  public renderer: GameRenderer;
  public audio: AudioManager;

  private typewriter: Typewriter;
  private backlog: BacklogEntry[] = [];

  private isAuto: boolean = false;
  private isSkip: boolean = false;
  private autoTimerId: number | null = null;
  private skipTimerId: number | null = null;

  // DOM Elements
  private gameRoot: HTMLElement;
  private canvasContainer: HTMLElement;
  private dialogueBox: HTMLElement;
  private dialogueText: HTMLElement;
  private speakerNameplate: HTMLElement;
  private nextIndicator: HTMLElement;
  private choiceOverlay: HTMLElement;
  private choiceList: HTMLElement;
  private selectedChoiceIndex: number = 0;
  private choiceButtons: HTMLButtonElement[] = [];

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
  private btnDebug: HTMLButtonElement;

  // Modals
  private modalSaveLoad: HTMLElement;
  private saveLoadTitle: HTMLElement;
  private saveSlotsContainer: HTMLElement;
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
    this.dialogueBox = document.getElementById('dialogue-box')!;
    this.dialogueText = document.getElementById('dialogue-text')!;
    this.speakerNameplate = document.getElementById('speaker-nameplate')!;
    this.nextIndicator = document.getElementById('dialogue-next-indicator')!;
    this.choiceOverlay = document.getElementById('choice-overlay')!;
    this.choiceList = document.getElementById('choice-buttons-list')!;

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
    this.btnDebug = document.getElementById('btn-debug') as HTMLButtonElement;

    this.modalSaveLoad = document.getElementById('modal-saveload')!;
    this.saveLoadTitle = document.getElementById('saveload-title')!;
    this.saveSlotsContainer = document.getElementById('save-slots-container')!;
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

    this.btnDebug.addEventListener('click', () => {
      this.openDebugModal();
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

    // Audio Sliders
    const sliderMaster = document.getElementById('slider-master') as HTMLInputElement;
    sliderMaster?.addEventListener('input', () => {
      this.audio.setMasterVolume(parseFloat(sliderMaster.value));
    });

    const sliderBgm = document.getElementById('slider-bgm') as HTMLInputElement;
    sliderBgm?.addEventListener('input', () => {
      this.audio.setChannelVolume('music', parseFloat(sliderBgm.value));
    });

    const sliderSfx = document.getElementById('slider-sfx') as HTMLInputElement;
    sliderSfx?.addEventListener('input', () => {
      this.audio.setChannelVolume('sound', parseFloat(sliderSfx.value));
    });

    const btnMute = document.getElementById('btn-mute-toggle') as HTMLButtonElement;
    btnMute?.addEventListener('click', () => {
      if (this.audio.isMuted()) {
        this.audio.unmute();
        btnMute.textContent = '[ Mute / Tắt tiếng: TẮT ]';
      } else {
        this.audio.mute();
        btnMute.textContent = '[ Mute / Tắt tiếng: BẬT ]';
      }
    });

    // Phím tắt bàn phím & cuộn chuột
    window.addEventListener('keydown', e => {
      // Bỏ qua nếu đang thao tác trong input hoặc slider
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      // Xử lý phím tắt khi đang hiển thị danh sách lựa chọn (Choice Overlay)
      if (!this.choiceOverlay.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateChoice(1);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateChoice(-1);
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmSelectedChoice();
          return;
        }
      }

      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.handleAdvanceAction();
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        this.rollback();
      } else if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Cuộn chuột lên để Rollback (tính năng kinh điển của Visual Novel)
    this.gameRoot.addEventListener('wheel', e => {
      if (
        e.deltaY < -40 &&
        !this.isAnyModalOpen() &&
        this.choiceOverlay.classList.contains('hidden')
      ) {
        this.rollback();
      }
    });
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
   * Xử lý tương tác tiến câu thoại:
   * Nếu chữ đang chạy -> hiện ngay lập tức trọn vẹn.
   * Nếu chữ đã chạy xong -> sang câu tiếp theo.
   */
  private handleAdvanceAction(): void {
    if (this.typewriter.isTyping()) {
      this.typewriter.finishImmediately();
      return;
    }

    if (!this.choiceOverlay.classList.contains('hidden')) {
      return; // Đang chờ lựa chọn, không thể click Next
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
        this.speakerNameplate.textContent = speakerDisplay.toUpperCase();
        this.speakerNameplate.classList.remove('hidden');
      } else {
        this.speakerNameplate.classList.add('hidden');
      }

      // Thêm vào Backlog
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
      // Tạm dùng url trực tiếp hoặc fallback giả lập
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
   * Hiển thị danh sách lựa chọn rẽ nhánh
   */
  private presentChoices(): void {
    const choices = this.vm.getAvailableChoices();
    this.choiceList.innerHTML = '';
    this.choiceButtons = [];
    this.selectedChoiceIndex = 0;

    // Chọn lựa chọn hợp lệ đầu tiên làm mặc định
    const firstEnabledIndex = choices.findIndex(c => c.enabled);
    if (firstEnabledIndex !== -1) {
      this.selectedChoiceIndex = firstEnabledIndex;
    }

    choices.forEach((choice: { text: string; enabled: boolean }, index: number) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice.text;
      if (!choice.enabled) {
        btn.disabled = true;
        btn.textContent += ' (Chưa đủ điều kiện)';
      } else {
        btn.addEventListener('click', () => {
          this.selectChoice(index);
        });
        btn.addEventListener('mouseenter', () => {
          this.highlightChoice(index);
        });
      }
      this.choiceButtons.push(btn);
      this.choiceList.appendChild(btn);
    });

    this.updateChoiceHighlight();
    this.choiceOverlay.classList.remove('hidden');
  }

  private highlightChoice(index: number): void {
    const choices = this.vm.getAvailableChoices();
    if (choices[index]?.enabled) {
      this.selectedChoiceIndex = index;
      this.updateChoiceHighlight();
    }
  }

  private updateChoiceHighlight(): void {
    this.choiceButtons.forEach((btn, idx) => {
      if (idx === this.selectedChoiceIndex) {
        btn.classList.add('selected');
        btn.focus();
      } else {
        btn.classList.remove('selected');
      }
    });
  }

  private navigateChoice(direction: number): void {
    const choices = this.vm.getAvailableChoices();
    if (choices.length === 0) return;

    let nextIndex = this.selectedChoiceIndex;
    for (let i = 0; i < choices.length; i++) {
      nextIndex = (nextIndex + direction + choices.length) % choices.length;
      if (choices[nextIndex]?.enabled) {
        this.selectedChoiceIndex = nextIndex;
        this.updateChoiceHighlight();
        break;
      }
    }
  }

  private confirmSelectedChoice(): void {
    const choices = this.vm.getAvailableChoices();
    if (choices[this.selectedChoiceIndex]?.enabled) {
      this.selectChoice(this.selectedChoiceIndex);
    }
  }

  private selectChoice(index: number): void {
    this.choiceOverlay.classList.add('hidden');
    this.vm.choose(index);
    void this.advance();
  }

  /**
   * Tua lại câu thoại trước (Rollback) và kích hoạt State Catch-up
   */
  public rollback(): boolean {
    if (!this.vm.canRollback()) return false;

    this.clearAutoTimer();
    this.clearSkip();
    this.choiceOverlay.classList.add('hidden');

    const success = this.vm.rollback();
    if (!success) return false;

    // Kích hoạt State Catch-up trên Renderer và Audio
    const catchUp = this.vm.getStateCatchUp();
    void this.renderer.syncStateCatchUp({
      background: catchUp.background,
      sprites: catchUp.sprites,
    });
    this.audio.syncStateCatchUp(catchUp.audio, (id: string) => id);

    // Hiển thị lại câu thoại của điểm khôi phục
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
        this.speakerNameplate.textContent = speakerDisplay.toUpperCase();
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
      if (!this.typewriter.isTyping()) {
        this.onDialogueLineFinished();
      }
    } else {
      this.clearAutoTimer();
      this.btnAuto.classList.remove('active');
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
      if (this.typewriter.isTyping()) {
        this.typewriter.finishImmediately();
      } else {
        void this.advance();
      }
    } else {
      this.clearSkip();
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

  /**
   * Cập nhật trạng thái các nút bấm trên thanh điều khiển
   */
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

    slots.forEach((slot, index) => {
      const card = document.createElement('div');
      card.className = 'save-slot-card';

      if (slot) {
        const dateStr = new Date(slot.timestamp).toLocaleString('vi-VN');
        card.innerHTML = `
          <img class="slot-thumbnail" src="${slot.thumbnail}" alt="Thumbnail" />
          <div class="slot-scene">[Slot ${index + 1}] ${slot.sceneName}</div>
          <div class="slot-meta">
            <span>${dateStr}</span>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="slot-thumbnail">[ TRỐNG ]</div>
          <div class="slot-scene">[Slot ${index + 1}] Trống</div>
          <div class="slot-meta"><span>--/--/----</span></div>
        `;
      }

      card.addEventListener('click', async () => {
        if (this.activeModalMode === 'save') {
          await this.saveToSlot(index);
          this.renderSaveSlots();
        } else {
          if (slot) {
            this.loadFromSlot(index);
            this.modalSaveLoad.classList.add('hidden');
          }
        }
      });

      this.saveSlotsContainer.appendChild(card);
    });
  }

  private async saveToSlot(slotIndex: number): Promise<void> {
    const thumbnail = await this.renderer.captureThumbnail();
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
    const thumbnail = await this.renderer.captureThumbnail();
    const vmState = this.vm.getState();
    GameStorage.quickSave({
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: this.vm.serialize(),
      dialoguePreview: this.currentDialogueInstruction?.text || '',
    });
    this.btnQSave.textContent = '[Q.Saved!]';
    setTimeout(() => {
      this.btnQSave.textContent = '[Q.Save]';
    }, 1200);
  }

  public quickLoad(): void {
    const slot = GameStorage.quickLoad();
    if (!slot) return;
    this.restoreFromSlotData(slot);
    this.btnQLoad.textContent = '[Q.Loaded!]';
    setTimeout(() => {
      this.btnQLoad.textContent = '[Q.Load]';
    }, 1200);
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
        this.speakerNameplate.textContent = speaker.toUpperCase();
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
}
