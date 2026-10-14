// ================================================================
// VN RUNTIME PLAYER - CHOICE OVERLAY MODULE
// Hiển thị và điều hướng lựa chọn nhánh kịch bản
// ================================================================

export class ChoiceOverlay {
  private choiceOverlay: HTMLElement;
  private choiceList: HTMLElement;
  private selectedChoiceIndex: number = 0;
  private choiceButtons: HTMLButtonElement[] = [];

  constructor() {
    this.choiceOverlay = document.getElementById('choice-overlay')!;
    this.choiceList = document.getElementById('choice-buttons-list')!;
  }

  public isOpen(): boolean {
    return Boolean(this.choiceOverlay && !this.choiceOverlay.classList.contains('hidden'));
  }

  public hide(): void {
    if (this.choiceOverlay) {
      this.choiceOverlay.classList.add('hidden');
    }
  }

  public presentChoices(
    choices: { text: string; enabled: boolean }[],
    onChoose: (index: number) => void,
  ): void {
    this.choiceList.innerHTML = '';
    this.choiceButtons = [];
    this.selectedChoiceIndex = 0;

    const firstEnabledIndex = choices.findIndex(c => c.enabled);
    if (firstEnabledIndex !== -1) {
      this.selectedChoiceIndex = firstEnabledIndex;
    }

    choices.forEach((choice, index) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';

      const textSpan = document.createElement('span');
      textSpan.textContent = choice.enabled ? choice.text : `${choice.text} (Conditions not met)`;
      btn.appendChild(textSpan);

      if (!choice.enabled) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          this.hide();
          onChoose(index);
        });
      }

      this.choiceList.appendChild(btn);
      this.choiceButtons.push(btn);
    });

    this.updateChoiceVisualSelection();
    this.choiceOverlay.classList.remove('hidden');
  }

  public navigateChoice(direction: number): void {
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

  public getSelectedChoiceIndex(): number {
    return this.selectedChoiceIndex;
  }

  public selectChoiceByIndex(index: number): void {
    const btn = this.choiceButtons[index];
    if (btn && !btn.disabled) {
      btn.click();
    }
  }

  public submitCurrentChoice(): void {
    const btn = this.choiceButtons[this.selectedChoiceIndex];
    if (btn && !btn.disabled) {
      btn.click();
    }
  }

  private updateChoiceVisualSelection(): void {
    this.choiceButtons.forEach((btn, idx) => {
      btn.classList.toggle('selected', idx === this.selectedChoiceIndex);
    });
  }
}
