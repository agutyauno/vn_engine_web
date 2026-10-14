// ==========================================
// TITLE SCREEN / MAIN MENU COMPONENT
// ==========================================

export interface TitleScreenCallbacks {
  onNewGame: () => void;
  onLoadGame: () => void;
  onSettings: () => void;
}

export class TitleScreen {
  private titleElement: HTMLElement | null;
  private btnNewGame: HTMLButtonElement | null;
  private btnLoadGame: HTMLButtonElement | null;
  private btnSettings: HTMLButtonElement | null;
  private isVisible: boolean = false;

  constructor(callbacks: TitleScreenCallbacks) {
    this.titleElement = document.getElementById('title-screen');
    this.btnNewGame = document.getElementById('btn-title-new') as HTMLButtonElement | null;
    this.btnLoadGame = document.getElementById('btn-title-load') as HTMLButtonElement | null;
    this.btnSettings = document.getElementById('btn-title-settings') as HTMLButtonElement | null;

    this.btnNewGame?.addEventListener('click', () => {
      this.hide();
      callbacks.onNewGame();
    });

    this.btnLoadGame?.addEventListener('click', () => {
      callbacks.onLoadGame();
    });

    this.btnSettings?.addEventListener('click', () => {
      callbacks.onSettings();
    });
  }

  public show(): void {
    if (this.titleElement) {
      this.titleElement.classList.remove('hidden');
    }
    this.isVisible = true;
  }

  public hide(): void {
    if (this.titleElement) {
      this.titleElement.classList.add('hidden');
    }
    this.isVisible = false;
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  public setTitle(title: string): void {
    const heading = this.titleElement?.querySelector('.title-screen-heading');
    if (heading) {
      heading.textContent = title;
    }
  }
}
