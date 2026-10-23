// ================================================================
// VN RUNTIME PLAYER - DIAGNOSTIC BUS SERVICE (ADR-025)
// Hệ thống quản lý chẩn đoán, cảnh báo tài nguyên và lỗi runtime
// Không phụ thuộc và không can thiệp (zero monkey-patching) vào console
// ================================================================

import type {
  EngineDiagnostic,
  EngineDiagnosticMessage,
  DiagnosticsClearMessage,
} from '@vn-engine/shared-types';

export interface DiagnosticBusOptions {
  editorOrigin?: string;
  targetWindow?: Window | null;
  enableConsoleOutput?: boolean;
}

export class DiagnosticBus {
  private listeners: Array<(diag: EngineDiagnostic) => void> = [];
  private clearListeners: Array<() => void> = [];
  private reportedFingerprints: Set<string> = new Set();
  private history: EngineDiagnostic[] = [];
  private idCounter: number = 0;

  private editorOrigin: string;
  private targetWindow: Window | null;
  private enableConsoleOutput: boolean;

  constructor(options?: DiagnosticBusOptions) {
    this.editorOrigin = options?.editorOrigin || '*';
    this.targetWindow = options?.targetWindow ?? null;
    this.enableConsoleOutput = options?.enableConsoleOutput ?? true;
  }

  public setEditorOrigin(origin: string): void {
    this.editorOrigin = origin;
  }

  public setTargetWindow(win: Window | null): void {
    this.targetWindow = win;
  }

  public subscribe(listener: (diag: EngineDiagnostic) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public onClear(listener: () => void): () => void {
    this.clearListeners.push(listener);
    return () => {
      this.clearListeners = this.clearListeners.filter(l => l !== listener);
    };
  }

  public getHistory(): EngineDiagnostic[] {
    return [...this.history];
  }

  /**
   * Báo cáo một chẩn đoán / cảnh báo / lỗi mới từ hệ thống
   */
  public report(diagInput: Omit<EngineDiagnostic, 'id' | 'timestamp'>): void {
    // 1. Tạo fingerprint để deduplicate chống spam trong 1 phiên
    const fingerprint = `${diagInput.category}:${diagInput.code ?? ''}:${diagInput.assetKey ?? ''}:${diagInput.message}`;
    if (this.reportedFingerprints.has(fingerprint)) {
      return;
    }
    this.reportedFingerprints.add(fingerprint);

    // 2. Tạo bản ghi có ID và Timestamp duy nhất
    const fullDiag: EngineDiagnostic = {
      ...diagInput,
      id: `diag_${++this.idCounter}_${Date.now()}`,
      timestamp: Date.now(),
    };
    this.history.push(fullDiag);

    // 3. In log ra console DevTools gốc bằng hàm native (không hook)
    if (this.enableConsoleOutput) {
      const prefix = '[VN Engine]';
      const detailsArg = fullDiag.details !== undefined ? fullDiag.details : '';
      if (fullDiag.severity === 'error') {
        console.error(prefix, fullDiag.message, detailsArg);
      } else if (fullDiag.severity === 'warning') {
        console.warn(prefix, fullDiag.message, detailsArg);
      } else {
        console.info(prefix, fullDiag.message, detailsArg);
      }
    }

    // 4. Thông báo cho các subscriber nội bộ
    for (const listener of this.listeners) {
      try {
        listener(fullDiag);
      } catch (err) {
        console.error('[DiagnosticBus] Error in subscriber:', err);
      }
    }

    // 5. Gửi sự kiện ENGINE_DIAGNOSTIC có cấu trúc sang Web Editor qua postMessage
    const msg: EngineDiagnosticMessage = {
      type: 'ENGINE_DIAGNOSTIC',
      diagnostic: fullDiag,
    };
    this.dispatchPostMessage(msg);
  }

  /**
   * Xóa toàn bộ chẩn đoán phiên cũ khi reload kịch bản hoặc nạp phiên mới
   */
  public clear(): void {
    this.reportedFingerprints.clear();
    this.history = [];

    for (const listener of this.clearListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[DiagnosticBus] Error in clearListener:', err);
      }
    }

    const msg: DiagnosticsClearMessage = {
      type: 'DIAGNOSTICS_CLEAR',
    };
    this.dispatchPostMessage(msg);
  }

  private dispatchPostMessage(msg: EngineDiagnosticMessage | DiagnosticsClearMessage): void {
    // 1. Nếu có targetWindow được chỉ định tường minh (hoặc mock trong test)
    if (this.targetWindow) {
      try {
        this.targetWindow.postMessage(msg, this.editorOrigin);
      } catch {
        // Bỏ qua lỗi postMessage
      }
      return;
    }

    // 2. Tự động gửi tới parent window (nếu đang nhúng trong iframe Editor)
    if (typeof window !== 'undefined') {
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage(msg, this.editorOrigin);
        } catch {
          // Bỏ qua
        }
      }

      // 3. Tự động gửi tới opener (nếu mở chế độ pop-out preview)
      if (window.opener) {
        try {
          window.opener.postMessage(msg, this.editorOrigin);
        } catch {
          // Bỏ qua
        }
      }
    }
  }
}
