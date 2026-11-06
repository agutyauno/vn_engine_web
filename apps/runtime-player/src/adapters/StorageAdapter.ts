// ============================================================================
// STORAGE ADAPTER (ADR-024, SAD §3.3)
// Quản lý lưu trữ trạng thái Game (6 slots thường + 1 quicksave, seen dialogues)
// Phân vùng khóa theo Project ID & Chế độ Preview, kèm Sandboxed MemoryStorage Fallback
// ============================================================================

import type { SaveSlotData } from '../core/contracts';

export interface StorageAdapterOptions {
  projectId?: string;
  isPreview?: boolean;
}

class MemoryStorage {
  private store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

export class StorageAdapter {
  private projectId?: string;
  private isPreview: boolean;
  private slotsKey: string;
  private quickKey: string;
  private seenKey: string;
  private memoryStorage = new MemoryStorage();
  private useMemoryFallback = false;

  constructor(options?: StorageAdapterOptions) {
    this.projectId = options?.projectId;
    this.isPreview = options?.isPreview ?? false;

    // Phân vùng tiền tố theo ADR-024
    const prefix = this.isPreview
      ? this.projectId
        ? `vn_engine_preview_${this.projectId}`
        : 'vn_engine_preview'
      : this.projectId
        ? `vn_engine_player_${this.projectId}`
        : 'vn_engine_player';

    this.slotsKey = `${prefix}_save_slots`;
    this.quickKey = `${prefix}_quicksave`;
    this.seenKey = `${prefix}_seen_dialogues`;
  }

  private safeGet(key: string): string | null {
    if (this.useMemoryFallback) {
      return this.memoryStorage.getItem(key);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {
      this.useMemoryFallback = true;
      return this.memoryStorage.getItem(key);
    }
    return null;
  }

  private safeSet(key: string, value: string): void {
    if (this.useMemoryFallback) {
      this.memoryStorage.setItem(key, value);
      return;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {
      this.useMemoryFallback = true;
      this.memoryStorage.setItem(key, value);
    }
  }

  /**
   * Lấy danh sách 6 slots lưu trữ thường (indices 0..5 tương ứng slots 1..6)
   */
  public getSlots(): Array<SaveSlotData | null> {
    const raw = this.safeGet(this.slotsKey);
    if (!raw) {
      return [null, null, null, null, null, null];
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const slots: Array<SaveSlotData | null> = [];
        for (let i = 0; i < 6; i++) {
          slots.push((parsed[i] as SaveSlotData) ?? null);
        }
        return slots;
      }
    } catch {
      // Dữ liệu JSON bị hỏng, trả về 6 null
    }
    return [null, null, null, null, null, null];
  }

  /**
   * Lưu slot vào vị trí tương ứng (slotIndex 1-6)
   */
  public async saveSlot(slotData: SaveSlotData): Promise<void> {
    const slots = this.getSlots();
    const idx = slotData.slotIndex - 1;
    if (idx >= 0 && idx < 6) {
      slots[idx] = slotData;
      this.safeSet(this.slotsKey, JSON.stringify(slots));
    }
  }

  /**
   * Đọc slot lưu trữ (slotIndex 0 là quicksave, 1-6 là regular slots)
   */
  public async loadSlot(slotIndex: number): Promise<SaveSlotData | null> {
    if (slotIndex === 0) {
      return this.getQuickSave();
    }
    if (slotIndex >= 1 && slotIndex <= 6) {
      const slots = this.getSlots();
      return slots[slotIndex - 1] ?? null;
    }
    return null;
  }

  public getQuickSave(): SaveSlotData | null {
    const raw = this.safeGet(this.quickKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as SaveSlotData) : null;
    } catch {
      return null;
    }
  }

  public async saveQuickSave(slotData: SaveSlotData): Promise<void> {
    this.safeSet(this.quickKey, JSON.stringify(slotData));
  }

  public getSeenDialogues(): Set<string> {
    const raw = this.safeGet(this.seenKey);
    if (!raw) return new Set<string>();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed.filter((item): item is string => typeof item === 'string'));
      }
    } catch {
      // Dữ liệu hỏng
    }
    return new Set<string>();
  }

  public saveSeenDialogue(key: string): void {
    const set = this.getSeenDialogues();
    set.add(key);
    this.safeSet(this.seenKey, JSON.stringify(Array.from(set)));
  }

  public saveSeenDialogues(seenSet: Set<string>): void {
    this.safeSet(this.seenKey, JSON.stringify(Array.from(seenSet)));
  }
}
