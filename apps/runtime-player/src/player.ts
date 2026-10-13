// ================================================================
// BỘ ĐIỀU PHỐI RUNTIME PLAYER (VN PLAYER CONTROLLER)
// Tuân thủ tài liệu đặc tả UI/UX Specification v1.0 & Architecture
// ================================================================

import { VisualNovelVM, type RunResult } from '@vn-engine/core-vm';
import { GameRenderer } from '@vn-engine/renderer';
import { AudioManager } from '@vn-engine/audio';
import type {
  Instruction,
  DialogueInstruction,
  Character,
  AssetRef,
} from '@vn-engine/shared-types';
import {
  Typewriter,
  stripControlTags,
  renderTokensToElement,
  parseTypewriterTokens,
} from './ui/typewriter';
import { GameStorage, type SaveSlotData, SLOTS_PER_PAGE, TOTAL_SLOTS } from './storage';

export interface BacklogEntry {
  speaker: string | null;
  text: string;
}

const CHAR_COLOR_MAP: Record<string, string> = {
  ALICE: '#38bdf8', // Xanh dương
  BOB: '#f43f5e', // Đỏ hồng
  '???': '#eab308', // Vàng ẩn danh
};

export class VNPlayer {
  public vm: VisualNovelVM;
  public renderer: GameRenderer;
  public audio: AudioManager;

  private typewriter: Typewriter;
  private backlog: BacklogEntry[] = [];
  private initialProgram: Instruction[];

  private isAuto: boolean = false;
  private isSkip: boolean = false;
  private isHudHidden: boolean = false;
  private autoTimerId: number | null = null;
  private skipTimerId: number | null = null;
  private toastTimerId: number | null = null;
  private waitTimerId: number | null = null;
  private currentSavePage: number = 0;

  // Dữ liệu dự án được cập nhật từ Studio (Characters & Assets)
  private projectData: {
    id?: string;
    characters?: Character[];
    assets?: AssetRef[];
  } = {};

  public updateProjectData(data: {
    id?: string;
    characters?: Character[];
    assets?: AssetRef[];
  }): void {
    if (data.id) {
      this.projectData.id = data.id;
      GameStorage.setProjectId(data.id);
    }
    if (data.characters) this.projectData.characters = data.characters;
    if (data.assets) this.projectData.assets = data.assets;
  }

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

  // Streamlined Control Buttons
  private btnBack: HTMLButtonElement;
  private btnAuto: HTMLButtonElement;
  private btnSkip: HTMLButtonElement;
  private btnQSave: HTMLButtonElement;
  private btnQLoad: HTMLButtonElement;
  private btnHideUI: HTMLButtonElement;
  private btnMenu: HTMLButtonElement;

  // Unified Settings Menu Modal
  private modalSettingsMenu: HTMLElement;
  private settingsTabButtons: HTMLButtonElement[] = [];
  private settingsPanes: HTMLElement[] = [];
  private btnCloseSettingsMenu: HTMLButtonElement | null = null;
  private saveSlotsContainer: HTMLElement;
  private savePageButtons: HTMLButtonElement[] = [];
  private btnModeSave: HTMLButtonElement | null = null;
  private btnModeLoad: HTMLButtonElement | null = null;
  private backlogContainer: HTMLElement;

  private activeModalMode: 'save' | 'load' = 'save';
  private currentDialogueInstruction: DialogueInstruction | null = null;
  private isAdvancing: boolean = false;
  private advanceQueued: boolean = false;

  // Cinematic Inspect Modal
  private inspectModal: HTMLElement;
  private inspectBackdrop: HTMLElement;
  private inspectTitle: HTMLElement;
  private inspectImage: HTMLImageElement;
  private btnCloseInspect: HTMLButtonElement | null;

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

    // DOM Lớp nền
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

    // Streamlined Control Buttons
    this.btnBack = document.getElementById('btn-back') as HTMLButtonElement;
    this.btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
    this.btnSkip = document.getElementById('btn-skip') as HTMLButtonElement;
    this.btnQSave = document.getElementById('btn-qsave') as HTMLButtonElement;
    this.btnQLoad = document.getElementById('btn-qload') as HTMLButtonElement;
    this.btnHideUI = document.getElementById('btn-hide-ui') as HTMLButtonElement;
    this.btnMenu = document.getElementById('btn-menu') as HTMLButtonElement;

    // Settings Menu Modal Elements
    this.modalSettingsMenu = document.getElementById('modal-settings-menu')!;
    this.settingsTabButtons = Array.from(document.querySelectorAll('.settings-tab-btn'));
    this.settingsPanes = Array.from(document.querySelectorAll('.settings-pane'));
    this.btnCloseSettingsMenu = document.getElementById(
      'btn-close-settings-menu',
    ) as HTMLButtonElement | null;
    this.saveSlotsContainer = document.getElementById('save-slots-container')!;
    this.savePageButtons = Array.from(document.querySelectorAll('.save-page-btn'));
    this.btnModeSave = document.getElementById('btn-mode-save') as HTMLButtonElement | null;
    this.btnModeLoad = document.getElementById('btn-mode-load') as HTMLButtonElement | null;
    this.backlogContainer = document.getElementById('backlog-container')!;

    // Inspect Modal Elements
    this.inspectModal = document.getElementById('inspect-modal')!;
    this.inspectBackdrop = document.getElementById('inspect-backdrop')!;
    this.inspectTitle = document.getElementById('inspect-title')!;
    this.inspectImage = document.getElementById('inspect-image') as HTMLImageElement;
    this.btnCloseInspect = document.getElementById('btn-close-inspect') as HTMLButtonElement | null;

    this.typewriter = new Typewriter(this.dialogueText, 22);
  }

  /**
   * Khởi động Player, thiết lập Canvas và gán sự kiện
   */
  public async start(): Promise<void> {
    await this.renderer.init(this.canvasContainer);
    this.updateUiScale();

    window.addEventListener('resize', () => {
      this.renderer.resizeToContainer(this.canvasContainer);
      this.updateUiScale();
    });

    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        this.renderer.resizeToContainer(this.canvasContainer);
        this.updateUiScale();
      });
      resizeObserver.observe(this.gameRoot);
    }

    this.setupEventListeners();
    this.updateControlsState();

    // Bước vào câu đầu tiên
    await this.advance();
  }

  /**
   * Tự động điều chỉnh UI scale đồng nhất theo tỷ lệ màn hình/container
   * Căn cứ trên độ phân giải ảo chuẩn 1280x720
   */
  private updateUiScale(): void {
    const rect = this.gameRoot.getBoundingClientRect();
    const scale = Math.max(0.1, (rect.width || 1280) / 1280);
    this.gameRoot.style.setProperty('--ui-scale', scale.toString());
  }

  /**
   * Gán toàn bộ sự kiện click, phím tắt và thao tác chuột
   */
  private setupEventListeners(): void {
    // Click vào hộp thoại để tiến hoặc hoàn thành chữ gõ ngay
    this.dialogueBox.addEventListener('click', () => {
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

    this.btnHideUI?.addEventListener('click', () => {
      this.toggleHideUI();
    });

    this.btnMenu?.addEventListener('click', () => {
      this.openSettingsMenu();
    });

    // Chuột giữa (Middle Click) để ẩn/hiện HUD thoại
    this.gameRoot.addEventListener('auxclick', e => {
      if (e.button === 1) {
        e.preventDefault();
        this.toggleHideUI();
      }
    });

    // Các Tab trong Settings Menu Modal
    this.settingsTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as 'audio' | 'saveload' | 'backlog' | 'debug' | 'system';
        if (tab) this.switchSettingsTab(tab);
      });
    });

    // Đóng Settings Menu Modal
    this.btnCloseSettingsMenu?.addEventListener('click', () => {
      this.closeSettingsMenu();
    });

    // Đóng Cinematic Inspect Modal
    this.btnCloseInspect?.addEventListener('click', () => {
      this.hideInspectModal();
    });
    this.inspectBackdrop?.addEventListener('click', () => {
      this.hideInspectModal();
    });

    // Nút chuyển chế độ Lưu / Tải trong Tab SaveLoad
    this.btnModeSave?.addEventListener('click', () => {
      this.setSaveLoadMode('save');
    });
    this.btnModeLoad?.addEventListener('click', () => {
      this.setSaveLoadMode('load');
    });

    // Các nút chuyển trang Save/Load
    this.savePageButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentSavePage = parseInt(btn.dataset.page || '0', 10);
        this.renderSaveSlots();
      });
    });

    // Audio Sliders & Hiển thị % âm lượng
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

    const btnMute = document.getElementById('btn-mute-toggle') as HTMLButtonElement;
    btnMute?.addEventListener('click', () => {
      this.toggleMute();
    });

    // Nút Toàn màn hình & Khởi động lại trong Tab Cài đặt khác
    document.getElementById('btn-system-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.getElementById('btn-system-restart')?.addEventListener('click', () => {
      this.closeSettingsMenu();
      void this.reloadProgram(this.initialProgram);
      this.showToast('Game restarted!');
    });

    // Phím tắt toàn cầu (Keyboard Shortcuts)
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 1. Phím Escape: đóng modal nếu đang mở, hiện HUD nếu đang ẩn, hoặc mở Settings Menu
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.isAnyModalOpen()) {
          this.closeAllModals();
          return;
        }
        if (this.isHudHidden) {
          this.toggleHideUI();
          return;
        }
        this.openSettingsMenu();
        return;
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
        this.openSettingsMenu('backlog');
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
   * Xử lý lỗi ngoại lệ Runtime của máy ảo một cách an toàn, tránh treo giao diện
   */
  private handleRuntimeError(err: unknown): void {
    console.error('[VN Player Runtime Error]', err);
    this.clearAutoTimer();
    this.clearWaitTimer();
    this.clearSkip();

    const msg = err instanceof Error ? err.message : String(err);
    this.showToast(`⚠️ [Lỗi kịch bản] ${msg}`);
    this.nextIndicator.textContent = '■ Error';
    this.nextIndicator.style.opacity = '1';
    this.updateControlsState();
  }

  /**
   * Bật/tắt Mute âm thanh
   */
  public toggleMute(): void {
    const btnMute = document.getElementById('btn-mute-toggle') as HTMLButtonElement;
    if (this.audio.isMuted()) {
      this.audio.unmute();
      if (btnMute) btnMute.textContent = '[ Mute: OFF (Key M) ]';
      this.showToast('Audio: ON');
    } else {
      this.audio.mute();
      if (btnMute) btnMute.textContent = '[ Mute: ON (Key M) ]';
      this.showToast('Audio: MUTED');
    }
  }

  public isAnyModalOpen(): boolean {
    return (
      !this.modalSettingsMenu.classList.contains('hidden') ||
      (this.inspectModal && !this.inspectModal.classList.contains('hidden'))
    );
  }

  public closeAllModals(): void {
    this.modalSettingsMenu.classList.add('hidden');
    this.hideInspectModal();
  }

  public showInspectModal(assetId: string, title?: string): void {
    if (!this.inspectModal) return;

    if (title && title.trim().length > 0) {
      this.inspectTitle.textContent = title;
      this.inspectTitle.classList.remove('hidden');
    } else {
      this.inspectTitle.textContent = '';
      this.inspectTitle.classList.add('hidden');
    }

    const foundAsset = this.projectData.assets?.find(
      a =>
        a.name.toLowerCase() === assetId.toLowerCase() ||
        a.id.toLowerCase() === assetId.toLowerCase(),
    );
    if (foundAsset?.storageUrl) {
      this.inspectImage.src = foundAsset.storageUrl;
    } else {
      const label = assetId.toUpperCase();
      this.inspectImage.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23111111" stroke="%23ffffff" stroke-width="2"/><text x="200" y="140" fill="%23ffffff" font-family="monospace" font-size="16" font-weight="bold" text-anchor="middle">[ ITEM // ${encodeURIComponent(label)} ]</text><text x="200" y="175" fill="%23888888" font-family="monospace" font-size="12" text-anchor="middle">// WIREFRAME INSPECT VIEW</text></svg>`;
    }

    this.inspectModal.classList.remove('hidden');
  }

  public hideInspectModal(): void {
    if (!this.inspectModal) return;
    this.inspectModal.classList.add('hidden');
  }

  public openSettingsMenu(
    initialTab: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system' = 'audio',
  ): void {
    this.switchSettingsTab(initialTab);
    this.modalSettingsMenu.classList.remove('hidden');
  }

  public closeSettingsMenu(): void {
    this.modalSettingsMenu.classList.add('hidden');
  }

  public switchSettingsTab(tabName: 'audio' | 'saveload' | 'backlog' | 'debug' | 'system'): void {
    this.settingsTabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    this.settingsPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabName}`);
    });

    if (tabName === 'saveload') {
      this.renderSaveSlots();
    } else if (tabName === 'backlog') {
      this.renderBacklog();
    } else if (tabName === 'debug') {
      this.renderDebugInfo();
    }
  }

  public setSaveLoadMode(mode: 'save' | 'load'): void {
    this.activeModalMode = mode;
    this.btnModeSave?.classList.toggle('active', mode === 'save');
    this.btnModeLoad?.classList.toggle('active', mode === 'load');
    this.renderSaveSlots();
  }

  // Tương thích ngược với các lệnh gọi modal cũ
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

  /**
   * Xử lý tương tác tiến câu thoại
   */
  private handleAdvanceAction(): void {
    if (this.isHudHidden) {
      this.toggleHideUI();
      return;
    }

    if (this.waitTimerId !== null) {
      this.clearWaitTimer();
      void this.advance();
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

  private getAssetGraphicResolver(): (assetKey: string) => string | undefined {
    return (assetKey: string) => {
      const foundAsset = this.projectData.assets?.find(
        a =>
          a.name.toLowerCase() === assetKey.toLowerCase() ||
          a.id.toLowerCase() === assetKey.toLowerCase(),
      );
      if (foundAsset?.storageUrl) return foundAsset.storageUrl;

      const underscoreIdx = assetKey.indexOf('_');
      if (underscoreIdx !== -1) {
        const charId = assetKey.slice(0, underscoreIdx);
        const spriteId = assetKey.slice(underscoreIdx + 1);
        const charDef = this.projectData.characters?.find(
          c => c.id.toLowerCase() === charId.toLowerCase(),
        );
        if (charDef?.sprites) {
          const spriteImg =
            charDef.sprites[spriteId] ||
            charDef.sprites['default'] ||
            Object.values(charDef.sprites)[0];
          if (spriteImg) {
            if (
              spriteImg.startsWith('data:') ||
              spriteImg.startsWith('http') ||
              spriteImg.startsWith('/') ||
              spriteImg.startsWith('.')
            ) {
              return spriteImg;
            }
            const refAsset = this.projectData.assets?.find(
              a => a.name === spriteImg || a.id === spriteImg,
            );
            if (refAsset?.storageUrl) return refAsset.storageUrl;
          }
        }
      } else {
        const charDef = this.projectData.characters?.find(
          c => c.id.toLowerCase() === assetKey.toLowerCase(),
        );
        if (charDef?.sprites) {
          const spriteImg = charDef.sprites['default'] || Object.values(charDef.sprites)[0];
          if (spriteImg) {
            if (
              spriteImg.startsWith('data:') ||
              spriteImg.startsWith('http') ||
              spriteImg.startsWith('/') ||
              spriteImg.startsWith('.')
            ) {
              return spriteImg;
            }
            const refAsset = this.projectData.assets?.find(
              a => a.name === spriteImg || a.id === spriteImg,
            );
            if (refAsset?.storageUrl) return refAsset.storageUrl;
          }
        }
      }
      return undefined;
    };
  }

  private getAssetAudioResolver(): (assetKey: string) => string {
    return (assetKey: string) => {
      const found = this.projectData.assets?.find(
        a =>
          a.name.toLowerCase() === assetKey.toLowerCase() ||
          a.id.toLowerCase() === assetKey.toLowerCase(),
      );
      return found?.storageUrl || assetKey;
    };
  }

  private checkIsProp(characterId: string): boolean {
    const isChar = this.projectData.characters?.some(
      c => c.id.toLowerCase() === characterId.toLowerCase(),
    );
    if (isChar) return false;
    return Boolean(
      this.projectData.assets?.some(
        a =>
          a.name.toLowerCase() === characterId.toLowerCase() ||
          a.id.toLowerCase() === characterId.toLowerCase(),
      ),
    );
  }

  /**
   * Tiến máy ảo tới điểm tương tác tiếp theo
   */
  public async advance(): Promise<void> {
    if (this.isAdvancing) {
      if (this.isSkip || this.isAuto) {
        this.advanceQueued = true;
      }
      return;
    }
    this.isAdvancing = true;

    try {
      this.clearAutoTimer();
      this.clearWaitTimer();

      let runResult: RunResult;
      try {
        runResult = this.vm.runUntilInteractive();
      } catch (err: unknown) {
        this.handleRuntimeError(err);
        return;
      }

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

        const hasText = Boolean(instr.text && instr.text.trim().length > 0);
        if (!hasText) {
          // Tự động ẩn hộp thoại khi không có nội dung thoại
          this.dialogueBox.classList.add('hidden');
          this.speakerNameplate.classList.add('hidden');
        } else {
          this.dialogueBox.classList.remove('hidden');

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
            const declaredChar = this.projectData.characters?.find(
              c =>
                (instr.character && c.id.toLowerCase() === instr.character.toLowerCase()) ||
                c.name.toLowerCase() === speakerDisplay.toLowerCase(),
            );
            const charColor = declaredChar?.colorHex || CHAR_COLOR_MAP[charKey] || '#38bdf8';
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
            text: stripControlTags(instr.text),
          });

          // Bắt đầu gõ chữ (hoặc hiển thị ngay lập tức nếu đang Skip)
          this.nextIndicator.style.opacity = '0';
          if (this.isSkip) {
            this.typewriter.stop();
            renderTokensToElement(parseTypewriterTokens(instr.text), this.dialogueText);
            this.nextIndicator.style.opacity = '1';
            this.onDialogueLineFinished();
          } else {
            this.typewriter.start(instr.text, () => {
              this.nextIndicator.style.opacity = '1';
              this.onDialogueLineFinished();
            });
          }
        }

        this.updateControlsState();
      } else if (step.type === 'SUSPEND_CHOICE') {
        this.clearSkip();
        this.dialogueBox.classList.add('hidden');
        this.speakerNameplate.classList.add('hidden');
        this.presentChoices();
      } else if (step.type === 'SUSPEND_WAIT') {
        const durationMs = this.isSkip ? 20 : Math.max(0, step.duration * 1000);
        this.waitTimerId = window.setTimeout(() => {
          this.waitTimerId = null;
          void this.advance();
        }, durationMs);
      } else if (step.type === 'HALTED') {
        this.clearAutoTimer();
        this.clearSkip();
        this.dialogueBox.classList.add('hidden');
        this.speakerNameplate.classList.add('hidden');
        this.nextIndicator.textContent = '■ End';
        this.nextIndicator.style.opacity = '0';
        this.updateControlsState();
      }
    } finally {
      this.isAdvancing = false;
      if (this.advanceQueued && (this.isSkip || this.isAuto)) {
        this.advanceQueued = false;
        void this.advance();
      }
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
      await this.renderer.setBackground(instr, instr.transition, this.getAssetGraphicResolver());
    } else if (instr.type === 'SHOW') {
      const isProp = this.checkIsProp(instr.character);
      await this.renderer.showCharacter(instr, this.getAssetGraphicResolver(), isProp);
    } else if (instr.type === 'HIDE') {
      this.renderer.hideCharacter(instr.character);
    } else if (instr.type === 'HIDE_DIALOGUE') {
      this.dialogueBox.classList.add('hidden');
      this.speakerNameplate.classList.add('hidden');
      this.nextIndicator.style.opacity = '0';
    } else if (instr.type === 'INSPECT_BEGIN') {
      this.showInspectModal(instr.assetId, instr.title);
    } else if (instr.type === 'INSPECT_END') {
      this.hideInspectModal();
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

      const keySpan = document.createElement('span');
      keySpan.className = 'choice-key-hint';
      keySpan.textContent = `[${index + 1}]`;
      btn.appendChild(keySpan);

      const textSpan = document.createElement('span');
      textSpan.textContent = choice.enabled ? choice.text : `${choice.text} (Conditions not met)`;
      btn.appendChild(textSpan);

      if (!choice.enabled) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          this.choiceOverlay.classList.add('hidden');
          try {
            this.vm.choose(index);
          } catch (err: unknown) {
            this.handleRuntimeError(err);
            return;
          }
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
      btn.classList.toggle('selected', idx === this.selectedChoiceIndex);
    });
  }

  /**
   * Tua lại câu thoại trước (Rollback)
   */
  public rollback(): boolean {
    // Lỗi 126: Nếu đang mở menu lựa chọn (choice), rollback chỉ ẩn menu choice
    // và hiển thị lại câu thoại dẫn đến choice chứ không pop lùi thêm câu thoại trước đó
    if (!this.choiceOverlay.classList.contains('hidden')) {
      this.clearAutoTimer();
      this.clearSkip();
      this.clearWaitTimer();
      this.choiceOverlay.classList.add('hidden');
      if (
        this.currentDialogueInstruction &&
        this.currentDialogueInstruction.text &&
        this.currentDialogueInstruction.text.trim().length > 0
      ) {
        this.dialogueBox.classList.remove('hidden');
        if (this.currentDialogueInstruction.character) {
          this.speakerNameplate.classList.remove('hidden');
        }
        this.nextIndicator.style.opacity = '1';
      }
      this.updateControlsState();
      return true;
    }

    if (!this.vm.canRollback()) {
      this.showToast('Cannot rollback further!');
      return false;
    }

    this.clearAutoTimer();
    this.clearSkip();
    this.clearWaitTimer();
    this.choiceOverlay.classList.add('hidden');

    const success = this.vm.rollback();
    if (!success) return false;

    const catchUp = this.vm.getStateCatchUp();

    if (this.backlog.length > 0) {
      this.backlog.pop();
    }

    void this.renderer.syncStateCatchUp(
      {
        background: catchUp.background,
        sprites: catchUp.sprites,
      },
      this.getAssetGraphicResolver(),
      (id: string) => this.checkIsProp(id),
    );
    this.audio.syncStateCatchUp(catchUp.audio, this.getAssetAudioResolver());

    if (
      catchUp.currentDialogue &&
      catchUp.currentDialogue.text &&
      catchUp.currentDialogue.text.trim().length > 0
    ) {
      this.dialogueBox.classList.remove('hidden');
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
        const declaredChar = this.projectData.characters?.find(
          c =>
            (catchUp.currentDialogue?.character &&
              c.id.toLowerCase() === catchUp.currentDialogue.character.toLowerCase()) ||
            c.name.toLowerCase() === speakerDisplay.toLowerCase(),
        );
        const charColor = declaredChar?.colorHex || CHAR_COLOR_MAP[charKey] || '#38bdf8';
        this.speakerNameplate.textContent = charKey;
        this.speakerNameplate.style.color = charColor;
        this.speakerNameplate.style.borderColor = charColor;
        this.speakerNameplate.classList.remove('hidden');
      } else {
        this.speakerNameplate.classList.add('hidden');
      }

      this.typewriter.stop();
      renderTokensToElement(parseTypewriterTokens(catchUp.currentDialogue.text), this.dialogueText);
      this.nextIndicator.style.opacity = '1';
    } else {
      this.dialogueBox.classList.add('hidden');
      this.speakerNameplate.classList.add('hidden');
    }

    if (catchUp.activeInspect) {
      this.showInspectModal(catchUp.activeInspect.assetId, catchUp.activeInspect.title);
    } else {
      this.hideInspectModal();
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
      this.showToast('Auto-forward: ON');
      if (!this.typewriter.isTyping()) {
        this.onDialogueLineFinished();
      }
    } else {
      this.clearAutoTimer();
      this.btnAuto.classList.remove('active');
      this.showToast('Auto-forward: OFF');
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
      this.showToast('Skip: ON');
      if (this.typewriter.isTyping()) {
        this.typewriter.finishImmediately();
      } else {
        void this.advance();
      }
    } else {
      this.clearSkip();
      this.showToast('Skip: OFF');
    }
  }

  private clearAutoTimer(): void {
    if (this.autoTimerId !== null) {
      clearTimeout(this.autoTimerId);
      this.autoTimerId = null;
    }
    if (!this.isSkip) {
      this.advanceQueued = false;
    }
  }

  private clearWaitTimer(): void {
    if (this.waitTimerId !== null) {
      clearTimeout(this.waitTimerId);
      this.waitTimerId = null;
    }
  }

  private clearSkip(): void {
    this.isSkip = false;
    this.advanceQueued = false;
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
   * Render lưới ô Lưu/Tải game trong Settings Menu
   */
  private renderSaveSlots(): void {
    const slots = GameStorage.getSlots();
    this.saveSlotsContainer.innerHTML = '';

    // Cập nhật trạng thái các nút phân trang
    this.savePageButtons.forEach(btn => {
      const pageIdx = parseInt(btn.dataset.page || '0', 10);
      btn.classList.toggle('active', pageIdx === this.currentSavePage);
    });

    const startIndex = this.currentSavePage * SLOTS_PER_PAGE;
    const endIndex = Math.min(startIndex + SLOTS_PER_PAGE, TOTAL_SLOTS);

    for (let index = startIndex; index < endIndex; index++) {
      const slot = slots[index];
      const card = document.createElement('div');
      card.className = 'save-slot-card';

      if (slot) {
        const dateStr = new Date(slot.timestamp).toLocaleString('en-US');
        card.innerHTML = `
          <div class="slot-header-row">
            <span class="slot-scene"></span>
            <span class="slot-badge saved">SAVED</span>
          </div>
          <img class="slot-thumbnail" alt="Thumbnail" />
          <div class="slot-meta">
            <span class="slot-date"></span>
          </div>
          <div class="slot-actions">
            <button class="slot-btn-action slot-btn-delete" data-action="delete" title="Delete this slot">[Delete]</button>
            <button class="slot-btn-action" data-action="confirm">${this.activeModalMode === 'save' ? '[Overwrite]' : '[Load]'}</button>
          </div>
        `;
        const sceneEl = card.querySelector('.slot-scene');
        if (sceneEl) sceneEl.textContent = `[Slot ${index + 1}] ${slot.sceneName}`;
        const imgEl = card.querySelector('.slot-thumbnail') as HTMLImageElement;
        if (imgEl && slot.thumbnail) imgEl.src = slot.thumbnail;
        const dateEl = card.querySelector('.slot-date');
        if (dateEl) dateEl.textContent = dateStr;
      } else {
        card.innerHTML = `
          <div class="slot-header-row">
            <span class="slot-scene">[Slot ${index + 1}] Empty</span>
            <span class="slot-badge">EMPTY</span>
          </div>
          <div class="slot-thumbnail">[ NO DATA ]</div>
          <div class="slot-meta"><span>--/--/----</span></div>
          <div class="slot-actions">
            <button class="slot-btn-action" data-action="confirm">${this.activeModalMode === 'save' ? '[Save here]' : '[Cannot load]'}</button>
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
          this.showToast(`Deleted save slot ${index + 1}`);
          this.renderSaveSlots();
          return;
        }

        if (this.activeModalMode === 'save') {
          await this.saveToSlot(index);
          this.showToast(`Successfully saved to Slot ${index + 1}`);
          this.renderSaveSlots();
        } else {
          if (slot) {
            const ok = this.loadFromSlot(index);
            if (ok) {
              this.showToast(`Successfully loaded Slot ${index + 1}`);
              this.closeSettingsMenu();
            }
          } else {
            this.showToast('This slot is empty, no data to load!');
          }
        }
      });

      this.saveSlotsContainer.appendChild(card);
    }
  }

  private async saveToSlot(slotIndex: number): Promise<void> {
    const thumbnail = await this.renderer.captureThumbnail(320, 180);
    const vmState = this.vm.getState();
    const scriptHash = this.vm.getScriptHash();
    const data: Omit<SaveSlotData, 'slotIndex'> = {
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: this.vm.serialize({ projectId: this.projectData.id, scriptHash }),
      dialoguePreview: stripControlTags(this.currentDialogueInstruction?.text || ''),
      projectId: this.projectData.id,
      scriptHash,
      backlogJson: JSON.stringify(this.backlog),
    };
    GameStorage.saveSlot(slotIndex, data);
  }

  private loadFromSlot(slotIndex: number): boolean {
    try {
      const slot = GameStorage.loadSlot(slotIndex);
      if (!slot) {
        this.showToast('This slot is empty!');
        return false;
      }
      this.restoreFromSlotData(slot);
      return true;
    } catch (err) {
      console.error(`[SaveLoad] Error loading slot ${slotIndex + 1}:`, err);
      this.showToast('⚠️ Corrupted save data! Cannot load.');
      return false;
    }
  }

  public async quickSave(): Promise<void> {
    const thumbnail = await this.renderer.captureThumbnail(320, 180);
    const vmState = this.vm.getState();
    const scriptHash = this.vm.getScriptHash();
    GameStorage.quickSave({
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: this.vm.serialize({ projectId: this.projectData.id, scriptHash }),
      dialoguePreview: stripControlTags(this.currentDialogueInstruction?.text || ''),
      projectId: this.projectData.id,
      scriptHash,
      backlogJson: JSON.stringify(this.backlog),
    });
    this.showToast('● QUICK SAVED');
  }

  public quickLoad(): boolean {
    try {
      const slot = GameStorage.quickLoad();
      if (!slot) {
        this.showToast('No quick save data found!');
        return false;
      }
      this.restoreFromSlotData(slot);
      this.showToast('● QUICK LOADED');
      return true;
    } catch (err) {
      console.error('[SaveLoad] Error during quick load:', err);
      this.showToast('⚠️ Corrupted quick save data! Cannot load.');
      return false;
    }
  }

  private restoreFromSlotData(slot: SaveSlotData): void {
    this.clearAutoTimer();
    this.clearSkip();
    this.choiceOverlay.classList.add('hidden');

    const restoreResult = this.vm.restore(slot.vmStateJson);
    if (restoreResult.desyncWarning) {
      console.warn(
        `[SaveLoad] Script version mismatch! Saved: ${restoreResult.savedHash}, Current: ${restoreResult.currentHash}`,
      );
      this.showToast('⚠️ Lưu ý: Kịch bản đã được cập nhật, dữ liệu chơi có thể bị lệch nhịp.');
    }

    // Khôi phục Backlog
    if (slot.backlogJson) {
      try {
        const parsed = JSON.parse(slot.backlogJson);
        if (Array.isArray(parsed)) {
          this.backlog = parsed;
        }
      } catch {
        // Giữ backlog cũ nếu parse thất bại
      }
    }

    // Kích hoạt State Catch-up
    const catchUp = this.vm.getStateCatchUp();
    void this.renderer.syncStateCatchUp(
      {
        background: catchUp.background,
        sprites: catchUp.sprites,
      },
      this.getAssetGraphicResolver(),
      (id: string) => this.checkIsProp(id),
    );
    this.audio.syncStateCatchUp(catchUp.audio, this.getAssetAudioResolver());

    if (
      catchUp.currentDialogue &&
      catchUp.currentDialogue.text &&
      catchUp.currentDialogue.text.trim().length > 0
    ) {
      this.dialogueBox.classList.remove('hidden');
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
        const declaredChar = this.projectData.characters?.find(
          c =>
            (catchUp.currentDialogue?.character &&
              c.id.toLowerCase() === catchUp.currentDialogue.character.toLowerCase()) ||
            c.name.toLowerCase() === speakerDisplay.toLowerCase(),
        );
        const charColor = declaredChar?.colorHex || CHAR_COLOR_MAP[charKey] || '#38bdf8';
        this.speakerNameplate.textContent = charKey;
        this.speakerNameplate.style.color = charColor;
        this.speakerNameplate.style.borderColor = charColor;
        this.speakerNameplate.classList.remove('hidden');
      } else {
        this.speakerNameplate.classList.add('hidden');
      }
      this.typewriter.stop();
      renderTokensToElement(parseTypewriterTokens(catchUp.currentDialogue.text), this.dialogueText);
      this.nextIndicator.style.opacity = '1';
    } else {
      this.dialogueBox.classList.add('hidden');
      this.speakerNameplate.classList.add('hidden');
    }

    if (catchUp.activeInspect) {
      this.showInspectModal(catchUp.activeInspect.assetId, catchUp.activeInspect.title);
    } else {
      this.hideInspectModal();
    }

    this.updateControlsState();
  }

  /**
   * Render danh sách lịch sử thoại (Backlog)
   */
  private renderBacklog(): void {
    this.backlogContainer.innerHTML = '';
    this.backlog.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'backlog-item';
      if (entry.speaker) {
        const spk = document.createElement('div');
        spk.className = 'backlog-speaker';
        spk.textContent = entry.speaker.toUpperCase();
        item.appendChild(spk);
      }
      const txt = document.createElement('div');
      txt.className = 'backlog-text';
      txt.textContent = entry.text;
      item.appendChild(txt);
      this.backlogContainer.appendChild(item);
    });

    // Tự động cuộn xuống đáy
    const modalBody = this.modalSettingsMenu.querySelector('.wf-modal-body');
    if (modalBody) {
      modalBody.scrollTop = modalBody.scrollHeight;
    }
  }

  /**
   * Render thông tin Debug Inspector
   */
  private renderDebugInfo(): void {
    const vmState = this.vm.getState();
    const sceneEl = document.getElementById('debug-scene');
    const ipEl = document.getElementById('debug-ip');
    const callstackEl = document.getElementById('debug-callstack');

    if (sceneEl) sceneEl.textContent = vmState.currentScene;
    if (ipEl) ipEl.textContent = vmState.instructionPointer.toString();
    if (callstackEl) callstackEl.textContent = vmState.callStack.length.toString();

    // Biến
    const varBody = document.getElementById('debug-variables-body');
    if (varBody) {
      varBody.innerHTML = '';
      for (const [name, val] of Object.entries(vmState.variables)) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = name;

        const tdVal = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = String(val);
        tdVal.appendChild(strong);

        const tdType = document.createElement('td');
        tdType.textContent = typeof val;

        tr.appendChild(tdName);
        tr.appendChild(tdVal);
        tr.appendChild(tdType);
        varBody.appendChild(tr);
      }
    }

    // Audio
    const audioBody = document.getElementById('debug-audio-body');
    if (audioBody) {
      audioBody.innerHTML = '';
      for (const ch of this.audio.getChannelsState()) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = ch.name;

        const tdAsset = document.createElement('td');
        tdAsset.textContent = ch.currentAssetId ?? '-';

        const tdVol = document.createElement('td');
        tdVol.textContent = `${Math.round(ch.volume * 100)}%`;

        const tdLoop = document.createElement('td');
        tdLoop.textContent = ch.loop ? 'Yes' : 'No';

        const tdPlay = document.createElement('td');
        tdPlay.textContent = ch.isPlaying ? 'Playing' : 'Stopped';

        tr.appendChild(tdName);
        tr.appendChild(tdAsset);
        tr.appendChild(tdVol);
        tr.appendChild(tdLoop);
        tr.appendChild(tdPlay);
        audioBody.appendChild(tr);
      }
    }
  }

  /**
   * Tải lại và bắt đầu thực thi chương trình bytecode mới (Hot Reload / Live Preview)
   */
  public async reloadProgram(
    program: Instruction[],
    options?: {
      targetScene?: string | null;
      targetLine?: number | null;
      fileId?: string | null;
    },
  ): Promise<void> {
    this.initialProgram = program;

    // 1. Dừng các tiến trình tự động hoặc tua nhanh
    this.clearAutoTimer();
    this.clearSkip();
    this.clearWaitTimer();

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
    this.currentDialogueInstruction = null;

    // 5. Reset giao diện UI
    this.choiceOverlay.classList.add('hidden');
    this.choiceList.innerHTML = '';
    this.choiceButtons = [];
    this.dialogueBox.classList.add('hidden');
    this.dialogueText.textContent = '';
    this.speakerNameplate.textContent = '';
    this.speakerNameplate.classList.add('hidden');
    this.nextIndicator.textContent = '▼ CONTINUE [→]';
    this.nextIndicator.style.opacity = '0';
    this.closeAllModals();

    // 6. Xử lý điểm nhảy bắt đầu (nếu có yêu cầu Run from Line / Run from Scene)
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
    this.updateControlsState();
    if (program.length > 0) {
      await this.advance();
    } else {
      this.dialogueBox.classList.add('hidden');
    }
  }
}
