// ================================================================
// VN RUNTIME PLAYER - SAVE / LOAD CONTROLLER MODULE
// Quản lý lưu/tải game theo slot, phân trang, quick save/load & desync warning
// ================================================================

import { GameStorage, type SaveSlotData, SLOTS_PER_PAGE, TOTAL_SLOTS } from '../storage';
import { stripControlTags } from '../ui/typewriter';
import type { PlayerContext } from '../playerContext';
import type { DesyncModal } from '../ui/desyncModal';
import type { DialogueView } from '../ui/dialogueView';
import type { InspectModal } from '../ui/inspectModal';
import { CHAR_COLOR_MAP } from '../ui/dialogueView';

export class SaveLoadController {
  private context: PlayerContext;
  private desyncModal: DesyncModal;
  private dialogueView: DialogueView;
  private inspectModal: InspectModal;

  private currentSavePage: number = 0;
  private activeModalMode: 'save' | 'load' = 'save';

  private saveSlotsContainer: HTMLElement;
  private savePageButtons: HTMLButtonElement[] = [];
  private btnModeSave: HTMLButtonElement | null = null;
  private btnModeLoad: HTMLButtonElement | null = null;

  private onSaveLoaded?: () => void;
  private onBeforeRestore?: () => void;

  constructor(
    context: PlayerContext,
    deps: {
      desyncModal: DesyncModal;
      dialogueView: DialogueView;
      inspectModal: InspectModal;
    },
    callbacks?: {
      onSaveLoaded?: () => void;
      onBeforeRestore?: () => void;
    },
  ) {
    this.context = context;
    this.desyncModal = deps.desyncModal;
    this.dialogueView = deps.dialogueView;
    this.inspectModal = deps.inspectModal;
    this.onSaveLoaded = callbacks?.onSaveLoaded;
    this.onBeforeRestore = callbacks?.onBeforeRestore;

    this.saveSlotsContainer = document.getElementById('save-slots-container')!;
    this.savePageButtons = Array.from(document.querySelectorAll('.save-page-btn'));
    this.btnModeSave = document.getElementById('btn-mode-save') as HTMLButtonElement | null;
    this.btnModeLoad = document.getElementById('btn-mode-load') as HTMLButtonElement | null;

    this.setupListeners();
  }

  private setupListeners(): void {
    this.savePageButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const pageIdx = parseInt(btn.dataset.page || '0', 10);
        this.currentSavePage = pageIdx;
        this.renderSaveSlots();
      });
    });

    this.btnModeSave?.addEventListener('click', () => {
      this.setMode('save');
    });

    this.btnModeLoad?.addEventListener('click', () => {
      this.setMode('load');
    });
  }

  public setMode(mode: 'save' | 'load'): void {
    this.activeModalMode = mode;
    this.btnModeSave?.classList.toggle('active', mode === 'save');
    this.btnModeLoad?.classList.toggle('active', mode === 'load');
    this.renderSaveSlots();
  }

  public renderSaveSlots(): void {
    const slots = GameStorage.getSlots();
    if (!this.saveSlotsContainer) return;
    this.saveSlotsContainer.innerHTML = '';

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

      card.addEventListener('click', async (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;

        if (action === 'delete') {
          e.stopPropagation();
          GameStorage.deleteSlot(index);
          this.context.showToast(`Deleted save slot ${index + 1}`);
          this.renderSaveSlots();
          return;
        }

        if (this.activeModalMode === 'save') {
          await this.saveToSlot(index);
          this.context.showToast(`Successfully saved to Slot ${index + 1}`);
          this.renderSaveSlots();
        } else {
          if (slot) {
            const ok = this.loadFromSlot(index);
            if (ok) {
              this.context.showToast(`Successfully loaded Slot ${index + 1}`);
              if (this.onSaveLoaded) {
                this.onSaveLoaded();
              }
            }
          } else {
            this.context.showToast('This slot is empty, no data to load!');
          }
        }
      });

      this.saveSlotsContainer.appendChild(card);
    }
  }

  public async saveToSlot(slotIndex: number): Promise<void> {
    const renderer = this.context.getRenderer();
    const vm = this.context.getVM();
    const projectData = this.context.getProjectData();
    const currentDialogue = this.dialogueView.getCurrentDialogue();

    const thumbnail = await renderer.captureThumbnail(320, 180);
    const vmState = vm.getState();
    const scriptHash = vm.getScriptHash();
    const data: Omit<SaveSlotData, 'slotIndex'> = {
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: vm.serialize({ projectId: projectData.id, scriptHash }),
      dialoguePreview: stripControlTags(currentDialogue?.text || ''),
      projectId: projectData.id,
      scriptHash,
      backlogJson: JSON.stringify(this.context.getBacklog()),
    };
    GameStorage.saveSlot(slotIndex, data);
  }

  public loadFromSlot(slotIndex: number): boolean {
    try {
      const slot = GameStorage.loadSlot(slotIndex);
      if (!slot) {
        this.context.showToast('This slot is empty!');
        return false;
      }

      const vm = this.context.getVM();
      const currentHash = vm.getScriptHash();
      if (slot.scriptHash && slot.scriptHash !== currentHash) {
        this.desyncModal.open(slot, slotIndex, currentHash, {
          onContinue: () => {
            this.restoreFromSlotData(slot);
            if (this.onSaveLoaded) this.onSaveLoaded();
          },
          onRestartScene: () => {
            this.restoreAndRestartScene(slot);
            if (this.onSaveLoaded) this.onSaveLoaded();
          },
        });
        return false;
      }

      this.restoreFromSlotData(slot);
      return true;
    } catch (err) {
      console.error(`[SaveLoad] Error loading slot ${slotIndex + 1}:`, err);
      this.context.showToast('⚠️ Corrupted save data! Cannot load.');
      return false;
    }
  }

  public async quickSave(): Promise<void> {
    const renderer = this.context.getRenderer();
    const vm = this.context.getVM();
    const projectData = this.context.getProjectData();
    const currentDialogue = this.dialogueView.getCurrentDialogue();

    const thumbnail = await renderer.captureThumbnail(320, 180);
    const vmState = vm.getState();
    const scriptHash = vm.getScriptHash();
    GameStorage.quickSave({
      timestamp: Date.now(),
      sceneName: vmState.currentScene,
      thumbnail,
      vmStateJson: vm.serialize({ projectId: projectData.id, scriptHash }),
      dialoguePreview: stripControlTags(currentDialogue?.text || ''),
      projectId: projectData.id,
      scriptHash,
      backlogJson: JSON.stringify(this.context.getBacklog()),
    });
    this.context.showToast('● QUICK SAVED');
  }

  public quickLoad(): boolean {
    try {
      const slot = GameStorage.quickLoad();
      if (!slot) {
        this.context.showToast('No quick save data found!');
        return false;
      }
      this.restoreFromSlotData(slot);
      this.context.showToast('● QUICK LOADED');
      return true;
    } catch (err) {
      console.error('[SaveLoad] Error during quick load:', err);
      this.context.showToast('⚠️ Corrupted quick save data! Cannot load.');
      return false;
    }
  }

  public restoreFromSlotData(slot: SaveSlotData): void {
    if (this.onBeforeRestore) {
      this.onBeforeRestore();
    }

    const vm = this.context.getVM();
    const restoreResult = vm.restore(slot.vmStateJson);
    if (restoreResult.desyncWarning) {
      console.warn(
        `[SaveLoad] Script version mismatch! Saved: ${restoreResult.savedHash}, Current: ${restoreResult.currentHash}`,
      );
      this.context.showToast(
        '⚠️ Lưu ý: Kịch bản đã được cập nhật, dữ liệu chơi có thể bị lệch nhịp.',
      );
    }

    if (slot.backlogJson) {
      try {
        const parsed = JSON.parse(slot.backlogJson);
        if (Array.isArray(parsed)) {
          this.context.clearBacklog();
          parsed.forEach(entry => this.context.addToBacklog(entry));
        }
      } catch {
        // Giữ backlog cũ nếu parse thất bại
      }
    }

    const catchUp = vm.getStateCatchUp();
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

    this.context.updateControlsState();
  }

  public restoreAndRestartScene(slot: SaveSlotData): void {
    if (this.onBeforeRestore) {
      this.onBeforeRestore();
    }

    const vm = this.context.getVM();
    vm.restore(slot.vmStateJson);

    if (slot.sceneName) {
      vm.startAt({ scene: slot.sceneName });
    }

    if (slot.backlogJson) {
      try {
        const parsed = JSON.parse(slot.backlogJson);
        if (Array.isArray(parsed)) {
          this.context.clearBacklog();
          parsed.forEach(entry => this.context.addToBacklog(entry));
        }
      } catch {
        // Giữ backlog cũ nếu parse thất bại
      }
    }

    const catchUp = vm.getStateCatchUp();
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
      void this.context.advance();
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

    this.context.updateControlsState();
  }
}
