// ================================================================
// VN RUNTIME PLAYER - INSPECT MODAL (CINEMATIC EVIDENCE / PROP VIEW)
// ================================================================

export class InspectModal {
  private inspectModal: HTMLElement;
  private inspectBackdrop: HTMLElement;
  private inspectTitle: HTMLElement;
  private inspectImage: HTMLImageElement;
  private btnCloseInspect: HTMLButtonElement | null;

  constructor() {
    this.inspectModal = document.getElementById('inspect-modal')!;
    this.inspectBackdrop = document.getElementById('inspect-backdrop')!;
    this.inspectTitle = document.getElementById('inspect-title')!;
    this.inspectImage = document.getElementById('inspect-image') as HTMLImageElement;
    this.btnCloseInspect = document.getElementById('btn-close-inspect') as HTMLButtonElement | null;

    this.btnCloseInspect?.addEventListener('click', () => {
      this.hide();
    });

    this.inspectBackdrop?.addEventListener('click', () => {
      this.hide();
    });
  }

  public isOpen(): boolean {
    return Boolean(this.inspectModal && !this.inspectModal.classList.contains('hidden'));
  }

  public show(assetId: string, title?: string, storageUrl?: string): void {
    if (!this.inspectModal) return;

    if (title && title.trim().length > 0) {
      this.inspectTitle.textContent = title;
      this.inspectTitle.classList.remove('hidden');
    } else {
      this.inspectTitle.textContent = '';
      this.inspectTitle.classList.add('hidden');
    }

    if (storageUrl) {
      this.inspectImage.src = storageUrl;
    } else {
      const label = assetId.toUpperCase();
      this.inspectImage.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23111111" stroke="%23ffffff" stroke-width="2"/><text x="200" y="140" fill="%23ffffff" font-family="monospace" font-size="16" font-weight="bold" text-anchor="middle">[ ITEM // ${encodeURIComponent(label)} ]</text><text x="200" y="175" fill="%23888888" font-family="monospace" font-size="12" text-anchor="middle">// WIREFRAME INSPECT VIEW</text></svg>`;
    }

    this.inspectModal.classList.remove('hidden');
  }

  public hide(): void {
    if (this.inspectModal) {
      this.inspectModal.classList.add('hidden');
    }
  }
}
