// ================================================================
// VN RUNTIME PLAYER - SCRIPT DESYNC WARNING MODAL
// ================================================================

import type { SaveSlotData } from '../storage';

export class DesyncModal {
  private modalDesyncWarning: HTMLElement;
  private desyncSlotName: HTMLElement;
  private desyncSavedHash: HTMLElement;
  private desyncCurrentHash: HTMLElement;
  private btnDesyncContinue: HTMLButtonElement | null;
  private btnDesyncRestartScene: HTMLButtonElement | null;
  private btnDesyncCancel: HTMLButtonElement | null;
  private btnDesyncClose: HTMLButtonElement | null;

  private pendingOnContinue?: () => void;
  private pendingOnRestartScene?: () => void;

  constructor() {
    this.modalDesyncWarning = document.getElementById('modal-desync-warning')!;
    this.desyncSlotName = document.getElementById('desync-slot-name')!;
    this.desyncSavedHash = document.getElementById('desync-saved-hash')!;
    this.desyncCurrentHash = document.getElementById('desync-current-hash')!;
    this.btnDesyncContinue = document.getElementById(
      'btn-desync-continue',
    ) as HTMLButtonElement | null;
    this.btnDesyncRestartScene = document.getElementById(
      'btn-desync-restart-scene',
    ) as HTMLButtonElement | null;
    this.btnDesyncCancel = document.getElementById('btn-desync-cancel') as HTMLButtonElement | null;
    this.btnDesyncClose = document.getElementById('btn-desync-close') as HTMLButtonElement | null;

    this.btnDesyncCancel?.addEventListener('click', () => this.close());
    this.btnDesyncClose?.addEventListener('click', () => this.close());

    this.btnDesyncContinue?.addEventListener('click', () => {
      this.close();
      if (this.pendingOnContinue) {
        this.pendingOnContinue();
      }
    });

    this.btnDesyncRestartScene?.addEventListener('click', () => {
      this.close();
      if (this.pendingOnRestartScene) {
        this.pendingOnRestartScene();
      }
    });
  }

  public isOpen(): boolean {
    return Boolean(
      this.modalDesyncWarning && !this.modalDesyncWarning.classList.contains('hidden'),
    );
  }

  public open(
    slot: SaveSlotData,
    slotIndex: number,
    currentHash: string,
    callbacks: {
      onContinue: () => void;
      onRestartScene: () => void;
    },
  ): void {
    if (!this.modalDesyncWarning) return;

    this.pendingOnContinue = callbacks.onContinue;
    this.pendingOnRestartScene = callbacks.onRestartScene;

    if (this.desyncSlotName) {
      this.desyncSlotName.textContent = `Slot ${slotIndex + 1} (${slot.sceneName})`;
    }
    if (this.desyncSavedHash) {
      this.desyncSavedHash.textContent = slot.scriptHash || '(none)';
    }
    if (this.desyncCurrentHash) {
      this.desyncCurrentHash.textContent = currentHash;
    }

    this.modalDesyncWarning.classList.remove('hidden');
  }

  public close(): void {
    this.pendingOnContinue = undefined;
    this.pendingOnRestartScene = undefined;
    if (this.modalDesyncWarning) {
      this.modalDesyncWarning.classList.add('hidden');
    }
  }
}
