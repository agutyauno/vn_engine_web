// ============================================================================
// STORAGE ADAPTER (ADR-024, SAD §3.3)
// Quản lý lưu trữ trạng thái Game (6 slots thường + 1 quicksave, seen dialogues)
// Phân vùng khóa theo Project ID & Chế độ Preview, kèm Sandboxed MemoryStorage Fallback
// ============================================================================

import {
  DEFAULT_PLAYER_SETTINGS,
  StorageQuotaError,
  type DialogueFontSize,
  type PlayerSettingsData,
  type SaveSlotData,
} from '../core/contracts';

// Re-export để bên ngoài vẫn import được từ adapter như trước.
export { StorageQuotaError };

export interface StorageAdapterOptions {
  projectId?: string;
  isPreview?: boolean;
}

/** Nhận diện lỗi quota trên Chromium, Firefox và Safari. */
export function isQuotaExceededError(err: unknown): boolean {
  if (typeof DOMException === 'undefined' || !(err instanceof DOMException)) {
    return false;
  }
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** Thời gian gom các lần saveSettings liên tiếp (kéo slider) thành một lần ghi. */
const SETTINGS_DEBOUNCE_MS = 200;

const FONT_SIZES: readonly DialogueFontSize[] = ['small', 'medium', 'large'];

/** Số hữu hạn thì kẹp vào [min, max]; mọi kiểu khác (chuỗi, boolean, null...) dùng fallback. */
function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function isFontSize(val: unknown): val is DialogueFontSize {
  return FONT_SIZES.some(size => size === val);
}

/**
 * Dựng object settings mới chỉ từ các key đã biết (không spread input),
 * nên key lạ hay `__proto__` không lọt vào kết quả.
 */
function sanitizeSettings(input: Record<string, unknown>): PlayerSettingsData {
  const d = DEFAULT_PLAYER_SETTINGS;
  return {
    masterVolume: clampNumber(input.masterVolume, 0, 1, d.masterVolume),
    musicVolume: clampNumber(input.musicVolume, 0, 1, d.musicVolume),
    sfxVolume: clampNumber(input.sfxVolume, 0, 1, d.sfxVolume),
    voiceVolume: clampNumber(input.voiceVolume, 0, 1, d.voiceVolume),
    isMuted: typeof input.isMuted === 'boolean' ? input.isMuted : d.isMuted,
    textSpeed: clampNumber(input.textSpeed, 1, 100, d.textSpeed),
    // `autoDelay` là tên cũ trước khi đổi sang `autoDelayMs`.
    autoDelayMs: clampNumber(input.autoDelayMs ?? input.autoDelay, 500, 5000, d.autoDelayMs),
    fontSize: isFontSize(input.fontSize) ? input.fontSize : d.fontSize,
    boxOpacity: clampNumber(input.boxOpacity, 0.6, 1.0, d.boxOpacity),
    stageScaleMode: input.stageScaleMode === 'native' ? 'native' : 'auto',
  };
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
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
  private settingsKey: string;
  private pendingSettings: PlayerSettingsData | null = null;
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.settingsKey = `${prefix}_settings`;
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
    } catch (err) {
      if (isQuotaExceededError(err)) {
        throw new StorageQuotaError(key);
      }
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
   * Ghi slot; nếu đầy quota thì thử lại đúng 1 lần với slot đã tước thumbnail.
   * Lần thử lại vẫn lỗi sẽ ném StorageQuotaError cho bên gọi.
   */
  private writeWithThumbnailFallback(
    slotData: SaveSlotData,
    write: (slot: SaveSlotData) => void,
  ): void {
    try {
      write(slotData);
    } catch (err) {
      if (!(err instanceof StorageQuotaError)) throw err;
      write({ ...slotData, thumbnailDataUrl: '' });
    }
  }

  /**
   * Lưu slot vào vị trí tương ứng (slotIndex 0 là quicksave, 1-6 là regular slots).
   * Index khác ném RangeError trước khi ghi.
   */
  public async saveSlot(slotData: SaveSlotData): Promise<void> {
    const { slotIndex } = slotData;
    if (slotIndex === 0) {
      return this.saveQuickSave(slotData);
    }
    if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > 6) {
      throw new RangeError(`Invalid slot index: ${slotIndex}. Expected 0 (quicksave) or 1-6.`);
    }
    const idx = slotIndex - 1;
    this.writeWithThumbnailFallback(slotData, slot => {
      const slots = this.getSlots();
      slots[idx] = slot;
      this.safeSet(this.slotsKey, JSON.stringify(slots));
    });
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
    this.writeWithThumbnailFallback(slotData, slot => {
      this.safeSet(this.quickKey, JSON.stringify(slot));
    });
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
    this.writeSeen(set);
  }

  public saveSeenDialogues(seenSet: Set<string>): void {
    this.writeSeen(seenSet);
  }

  private writeSeen(seenSet: Set<string>): void {
    try {
      this.safeSet(this.seenKey, JSON.stringify(Array.from(seenSet)));
    } catch (err) {
      // Seen dialogues chỉ là tiện ích (skip đã đọc): đầy quota thì bỏ qua lần ghi này,
      // không để lỗi làm crash luồng thoại.
      if (!(err instanceof StorageQuotaError)) throw err;
    }
  }

  /**
   * Đọc settings đã lưu (hoặc giá trị đang chờ ghi), luôn trả về bản sao đã kiểm tra
   * và kẹp giá trị. Dữ liệu hỏng hoặc sai kiểu thì dùng DEFAULT_PLAYER_SETTINGS.
   */
  public getSettings(): PlayerSettingsData {
    if (this.pendingSettings) {
      return { ...this.pendingSettings };
    }
    const raw = this.safeGet(this.settingsKey);
    if (!raw) return { ...DEFAULT_PLAYER_SETTINGS };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        return sanitizeSettings(parsed);
      }
    } catch {
      // Dữ liệu hỏng
    }
    return { ...DEFAULT_PLAYER_SETTINGS };
  }

  /** Gộp partial vào settings hiện tại và ghi sau SETTINGS_DEBOUNCE_MS (gọi lại thì đặt lại timer). */
  public saveSettings(settings: Partial<PlayerSettingsData>): void {
    this.pendingSettings = sanitizeSettings({ ...this.getSettings(), ...settings });
    if (this.settingsTimer !== null) {
      clearTimeout(this.settingsTimer);
    }
    this.settingsTimer = setTimeout(() => this.flushSettings(), SETTINGS_DEBOUNCE_MS);
  }

  /** Ghi ngay settings đang chờ (nếu có) và hủy timer debounce. */
  public flushSettings(): void {
    if (this.settingsTimer !== null) {
      clearTimeout(this.settingsTimer);
      this.settingsTimer = null;
    }
    const pending = this.pendingSettings;
    if (!pending) return;
    this.pendingSettings = null;
    try {
      this.safeSet(this.settingsKey, JSON.stringify(pending));
    } catch (err) {
      // Settings không quan trọng như save slot: đầy quota thì bỏ qua lần ghi này.
      if (!(err instanceof StorageQuotaError)) throw err;
    }
  }
}
