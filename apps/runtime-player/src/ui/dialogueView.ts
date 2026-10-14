// ================================================================
// VN RUNTIME PLAYER - DIALOGUE VIEW MODULE
// Quản lý hộp thoại, Nameplate, Typewriter & Next Indicator
// ================================================================

import type { DialogueInstruction } from '@vn-engine/shared-types';
import {
  Typewriter,
  parseTypewriterTokens,
  renderTokensToElement,
} from './typewriter';

export const CHAR_COLOR_MAP: Record<string, string> = {
  ALICE: '#38bdf8', // Xanh dương
  BOB: '#f43f5e', // Đỏ hồng
  '???': '#eab308', // Vàng ẩn danh
};

export class DialogueView {
  private gameRoot: HTMLElement;
  private dialogueBox: HTMLElement;
  private dialogueText: HTMLElement;
  private speakerNameplate: HTMLElement;
  private nextIndicator: HTMLElement;
  private typewriter: Typewriter;

  private currentDialogueInstruction: DialogueInstruction | null = null;

  constructor() {
    this.gameRoot = document.getElementById('game-root')!;
    this.dialogueBox = document.getElementById('dialogue-box')!;
    this.dialogueText = document.getElementById('dialogue-text')!;
    this.speakerNameplate = document.getElementById('speaker-nameplate')!;
    this.nextIndicator = document.getElementById('dialogue-next-indicator')!;

    this.typewriter = new Typewriter(this.dialogueText, 22);
  }

  public getCurrentDialogue(): DialogueInstruction | null {
    return this.currentDialogueInstruction;
  }

  public setCurrentDialogue(instr: DialogueInstruction | null): void {
    this.currentDialogueInstruction = instr;
  }

  public isTyping(): boolean {
    return this.typewriter.isTyping();
  }

  public finishImmediately(): void {
    this.typewriter.finishImmediately();
  }

  public stopTypewriter(): void {
    this.typewriter.stop();
  }

  public setCustomSkin(_uiScreenId?: string): void {
    // No-op for MVP: Custom UI skins deferred to future phase
    this.gameRoot.className = '';
  }

  public hide(): void {
    this.dialogueBox.classList.add('hidden');
    this.speakerNameplate.classList.add('hidden');
    this.nextIndicator.style.opacity = '0';
  }

  public show(): void {
    this.dialogueBox.classList.remove('hidden');
  }

  public isHidden(): boolean {
    return this.dialogueBox.classList.contains('hidden');
  }

  public updateSpeaker(speakerDisplay: string | null, color: string): void {
    if (speakerDisplay) {
      const charKey = speakerDisplay.toUpperCase();
      this.speakerNameplate.textContent = charKey;
      this.speakerNameplate.style.color = color;
      this.speakerNameplate.style.borderColor = color;
      this.speakerNameplate.classList.remove('hidden');
    } else {
      this.speakerNameplate.classList.add('hidden');
    }
  }

  public presentDialogue(
    instr: DialogueInstruction,
    speakerDisplay: string | null,
    charColor: string,
    isSkip: boolean,
    onFinished: () => void,
  ): void {
    this.currentDialogueInstruction = instr;
    this.setCustomSkin(instr.uiScreenId);

    const hasText = Boolean(instr.text && instr.text.trim().length > 0);
    if (!hasText) {
      this.hide();
      if (isSkip) {
        onFinished();
      }
      return;
    }

    this.dialogueBox.classList.remove('hidden');
    this.updateSpeaker(speakerDisplay, charColor);

    this.nextIndicator.style.opacity = '0';
    if (isSkip) {
      this.typewriter.stop();
      renderTokensToElement(parseTypewriterTokens(instr.text), this.dialogueText);
      this.nextIndicator.style.opacity = '1';
      onFinished();
    } else {
      this.typewriter.start(instr.text, () => {
        this.nextIndicator.style.opacity = '1';
        onFinished();
      });
    }
  }

  public renderImmediateText(text: string): void {
    this.typewriter.stop();
    renderTokensToElement(parseTypewriterTokens(text), this.dialogueText);
    this.nextIndicator.style.opacity = '1';
  }

  public setNextIndicatorHalted(): void {
    this.nextIndicator.textContent = '■ End';
    this.nextIndicator.style.opacity = '0';
  }

  public resetNextIndicator(): void {
    this.nextIndicator.textContent = '▼ CONTINUE [→]';
    this.nextIndicator.style.opacity = '0';
  }
}
