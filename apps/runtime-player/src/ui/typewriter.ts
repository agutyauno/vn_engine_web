// ==========================================
// HIỆU ỨNG CHỮ GÕ MÁY (TYPEWRITER EFFECT)
// ==========================================

export class Typewriter {
  private element: HTMLElement;
  private currentFullText: string = '';
  private currentIndex: number = 0;
  private timerId: number | null = null;
  private speedMs: number = 24; // Tốc độ hiển thị mỗi ký tự (ms)
  private _isTyping: boolean = false;
  private onCompleteCallback?: () => void;

  constructor(element: HTMLElement, speedMs = 24) {
    this.element = element;
    this.speedMs = speedMs;
  }

  public isTyping(): boolean {
    return this._isTyping;
  }

  /**
   * Bắt đầu hiệu ứng gõ máy từ đầu
   */
  public start(fullText: string, onComplete?: () => void): void {
    this.stop();
    this.currentFullText = fullText;
    this.currentIndex = 0;
    this.onCompleteCallback = onComplete;
    this.element.textContent = '';
    this._isTyping = true;

    if (!fullText) {
      this._isTyping = false;
      onComplete?.();
      return;
    }

    this.tick();
  }

  private tick = (): void => {
    if (!this._isTyping) return;

    if (this.currentIndex < this.currentFullText.length) {
      this.currentIndex++;
      this.element.textContent = this.currentFullText.slice(0, this.currentIndex);
      this.timerId = window.setTimeout(this.tick, this.speedMs);
    } else {
      this._isTyping = false;
      this.timerId = null;
      this.onCompleteCallback?.();
    }
  };

  /**
   * Hoàn thành ngay lập tức toàn bộ câu chữ khi người chơi click lần đầu
   */
  public finishImmediately(): void {
    if (!this._isTyping) return;

    this.stop();
    this.element.textContent = this.currentFullText;
    this._isTyping = false;
    this.onCompleteCallback?.();
  }

  /**
   * Hủy bỏ timer
   */
  public stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this._isTyping = false;
  }
}
