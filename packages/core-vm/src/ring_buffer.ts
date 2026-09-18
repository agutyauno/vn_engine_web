// ==========================================
// BỘ ĐỆM VÒNG LƯU TRẠNG THÁI ROLLBACK (SNAPSHOT RING BUFFER - ADR-022)
// ==========================================

import type { VMSnapshot } from '@vn-engine/shared-types';

export class SnapshotRingBuffer {
  private readonly maxCapacity: number;
  private history: VMSnapshot[] = [];
  private forwardStack: VMSnapshot[] = [];

  constructor(maxCapacity: number = 50) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  /**
   * Đẩy một snapshot mới vào bộ nhớ lịch sử.
   * Hành động này sẽ tự động xóa sạch ngăn xếp Roll-forward.
   */
  public push(snapshot: VMSnapshot): void {
    // Clone sâu đảm bảo tính toàn vẹn độc lập thuần JSON
    const cloned: VMSnapshot = {
      timestamp: snapshot.timestamp,
      dialogueIndex: snapshot.dialogueIndex,
      state: JSON.parse(JSON.stringify(snapshot.state)),
    };

    this.history.push(cloned);
    if (this.history.length > this.maxCapacity) {
      this.history.shift(); // Loại bỏ snapshot cũ nhất khi đầy bộ đệm
    }

    // Xóa forwardStack khi người chơi phát sinh tiến trình mới
    this.forwardStack = [];
  }

  /**
   * Kiểm tra xem có thể tua lại (Rollback) được hay không.
   * Cần ít nhất 2 snapshot (1 cho trạng thái hiện tại, 1 để tua về trước).
   */
  public canRollback(): boolean {
    return this.history.length > 1;
  }

  /**
   * Thực hiện tua lại: lấy snapshot trước đó, chuyển snapshot hiện tại vào forwardStack.
   */
  public rollback(): VMSnapshot | undefined {
    if (!this.canRollback()) {
      return undefined;
    }

    // Snapshot hiện tại được chuyển sang forwardStack
    const current = this.history.pop()!;
    this.forwardStack.push(current);

    // Trả về snapshot trước đó (ở đỉnh history)
    const previous = this.history[this.history.length - 1]!;
    return JSON.parse(JSON.stringify(previous));
  }

  /**
   * Kiểm tra xem có thể tua tiến (Roll-forward) được hay không.
   */
  public canRollforward(): boolean {
    return this.forwardStack.length > 0;
  }

  /**
   * Thực hiện tua tiến: lấy snapshot từ forwardStack đưa lại vào history.
   */
  public rollforward(): VMSnapshot | undefined {
    if (!this.canRollforward()) {
      return undefined;
    }

    const next = this.forwardStack.pop()!;
    this.history.push(next);
    return JSON.parse(JSON.stringify(next));
  }

  /**
   * Xóa sạch ngăn xếp roll-forward khi người chơi đưa ra lựa chọn mới.
   */
  public clearForward(): void {
    this.forwardStack = [];
  }

  /**
   * Số lượng snapshot đang lưu trong history.
   */
  public size(): number {
    return this.history.length;
  }

  /**
   * Xóa toàn bộ bộ đệm.
   */
  public clear(): void {
    this.history = [];
    this.forwardStack = [];
  }

  /**
   * Lấy danh sách snapshot hiện có (bản sao).
   */
  public getHistory(): VMSnapshot[] {
    return JSON.parse(JSON.stringify(this.history));
  }
}
