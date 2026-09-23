// ==========================================
// HIỆU ỨNG CHỮ GÕ MÁY NÂNG CAO (RICH TYPEWRITER EFFECT)
// Hỗ trợ thẻ điều khiển: {pause:...}, {speed:...}, {color:...}...{/color}
// ==========================================

export type TypewriterToken =
  | { type: 'char'; char: string; color?: string }
  | { type: 'pause'; durationMs: number }
  | { type: 'speed'; speedMs: number };

/**
 * Phân tích chuỗi kịch bản thành danh sách token phục vụ gõ máy
 */
export function parseTypewriterTokens(text: string, baseSpeedMs = 24): TypewriterToken[] {
  const tokens: TypewriterToken[] = [];
  let currentColor: string | undefined = undefined;

  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      const closeIdx = text.indexOf('}', i);
      if (closeIdx !== -1) {
        const tag = text.slice(i + 1, closeIdx).trim();

        // 1. Thẻ tạm dừng: {pause:0.5s} hoặc {wait:0.5s}
        const pauseMatch = tag.match(/^(?:pause|wait):([0-9]+(?:\.[0-9]+)?)s?$/i);
        if (pauseMatch && pauseMatch[1]) {
          const sec = parseFloat(pauseMatch[1]);
          const durationMs = isNaN(sec) ? 500 : Math.round(sec * 1000);
          tokens.push({ type: 'pause', durationMs });
          i = closeIdx + 1;
          continue;
        }

        // 2. Thẻ tốc độ: {speed:slow|normal|fast}
        const speedMatch = tag.match(/^speed:(slow|normal|fast)$/i);
        if (speedMatch && speedMatch[1]) {
          const mode = speedMatch[1].toLowerCase();
          let speedMs = baseSpeedMs;
          if (mode === 'slow') speedMs = Math.round(baseSpeedMs * 2.2);
          else if (mode === 'fast') speedMs = Math.max(8, Math.round(baseSpeedMs * 0.4));
          tokens.push({ type: 'speed', speedMs });
          i = closeIdx + 1;
          continue;
        }

        // 3. Thẻ đổi màu: {color:#hex}
        const colorMatch = tag.match(/^color:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/i);
        if (colorMatch && colorMatch[1]) {
          currentColor = colorMatch[1];
          i = closeIdx + 1;
          continue;
        }

        // 4. Thẻ đóng màu: {/color}
        if (tag.toLowerCase() === '/color') {
          currentColor = undefined;
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // Ký tự chữ thông thường
    tokens.push({
      type: 'char',
      char: text[i]!,
      color: currentColor,
    });
    i++;
  }

  return tokens;
}

/**
 * Loại bỏ các thẻ điều khiển để lấy chuỗi văn bản sạch cho Backlog và Preview
 */
export function stripControlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/\{(?:pause|wait):[^}]+\}/gi, '')
    .replace(/\{speed:[^}]+\}/gi, '')
    .replace(/\{color:[^}]+\}/gi, '')
    .replace(/\{\/color\}/gi, '');
}

/**
 * Render trực tiếp toàn bộ tokens vào phần tử DOM một cách an toàn (dùng textContent)
 */
export function renderTokensToElement(tokens: TypewriterToken[], element: HTMLElement): void {
  element.replaceChildren();

  let currentSpan: HTMLSpanElement | null = null;
  let currentColor: string | undefined = undefined;

  for (const token of tokens) {
    if (token.type !== 'char') continue;

    if (!currentSpan || token.color !== currentColor) {
      currentSpan = document.createElement('span');
      if (token.color) {
        currentSpan.style.color = token.color;
      }
      currentColor = token.color;
      element.appendChild(currentSpan);
    }

    currentSpan.textContent += token.char;
  }
}

export class Typewriter {
  private element: HTMLElement;
  private tokens: TypewriterToken[] = [];
  private tokenIndex: number = 0;
  private timerId: number | null = null;
  private baseSpeedMs: number = 24;
  private currentSpeedMs: number = 24;
  private _isTyping: boolean = false;
  private onCompleteCallback?: () => void;
  private activeSpan: HTMLSpanElement | null = null;
  private activeColor: string | undefined = undefined;

  constructor(element: HTMLElement, speedMs = 24) {
    this.element = element;
    this.baseSpeedMs = speedMs;
    this.currentSpeedMs = speedMs;
  }

  public isTyping(): boolean {
    return this._isTyping;
  }

  /**
   * Bắt đầu hiệu ứng gõ máy từ đầu
   */
  public start(fullText: string, onComplete?: () => void): void {
    this.stop();
    this.tokens = parseTypewriterTokens(fullText, this.baseSpeedMs);
    this.tokenIndex = 0;
    this.currentSpeedMs = this.baseSpeedMs;
    this.onCompleteCallback = onComplete;
    this.element.replaceChildren();
    this.activeSpan = null;
    this.activeColor = undefined;
    this._isTyping = true;

    if (this.tokens.length === 0) {
      this._isTyping = false;
      onComplete?.();
      return;
    }

    this.tick();
  }

  private tick = (): void => {
    if (!this._isTyping) return;

    if (this.tokenIndex < this.tokens.length) {
      const token = this.tokens[this.tokenIndex]!;
      this.tokenIndex++;

      if (token.type === 'pause') {
        // Tạm dừng nhịp gõ
        this.timerId = window.setTimeout(this.tick, token.durationMs);
      } else if (token.type === 'speed') {
        // Cập nhật tốc độ gõ
        this.currentSpeedMs = token.speedMs;
        this.tick();
      } else if (token.type === 'char') {
        // Render ký tự
        if (!this.activeSpan || token.color !== this.activeColor) {
          this.activeSpan = document.createElement('span');
          if (token.color) {
            this.activeSpan.style.color = token.color;
          }
          this.activeColor = token.color;
          this.element.appendChild(this.activeSpan);
        }
        this.activeSpan.textContent += token.char;
        this.timerId = window.setTimeout(this.tick, this.currentSpeedMs);
      }
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
    renderTokensToElement(this.tokens, this.element);
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
