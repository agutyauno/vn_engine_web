// ==========================================
// STATE STORAGE MANAGER (LOCALSTORAGE SAVE/LOAD)
// ==========================================

export interface SaveSlotData {
  slotIndex: number;
  timestamp: number;
  sceneName: string;
  thumbnail: string;
  vmStateJson: string;
  dialoguePreview: string;
  projectId?: string;
  scriptHash?: string;
  sceneOffset?: number;
  backlogJson?: string;
}

export const TOTAL_SLOTS = 12;
export const SLOTS_PER_PAGE = 6;

export class GameStorage {
  private static activeProjectId: string | null = null;
  private static isPreviewMode: boolean = false;

  public static setProjectId(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  public static getProjectId(): string | null {
    return this.activeProjectId;
  }

  public static setPreviewMode(isPreview: boolean): void {
    this.isPreviewMode = isPreview;
  }

  public static isPreview(): boolean {
    return this.isPreviewMode;
  }

  private static getPrefix(): string {
    return this.isPreviewMode ? 'vn_engine_preview' : 'vn_engine_player';
  }

  private static getSlotsKey(projectId?: string): string {
    const pid = projectId ?? this.activeProjectId;
    const prefix = this.getPrefix();
    return pid ? `${prefix}_${pid}_save_slots` : `${prefix}_save_slots`;
  }

  private static getQuickKey(projectId?: string): string {
    const pid = projectId ?? this.activeProjectId;
    const prefix = this.getPrefix();
    return pid ? `${prefix}_${pid}_quicksave` : `${prefix}_quicksave`;
  }

  /**
   * Get list of 12 save game slots
   */
  public static getSlots(projectId?: string): (SaveSlotData | null)[] {
    try {
      const key = this.getSlotsKey(projectId);
      const raw = localStorage.getItem(key);
      if (!raw) {
        return new Array(TOTAL_SLOTS).fill(null);
      }
      const parsed = JSON.parse(raw);
      const slots: (SaveSlotData | null)[] = [];
      for (let i = 0; i < TOTAL_SLOTS; i++) {
        slots.push(parsed[i] || null);
      }
      return slots;
    } catch {
      return new Array(TOTAL_SLOTS).fill(null);
    }
  }

  /**
   * Save to a specific slot
   */
  public static saveSlot(
    slotIndex: number,
    data: Omit<SaveSlotData, 'slotIndex'>,
    projectId?: string,
  ): void {
    const slots = this.getSlots(projectId);
    slots[slotIndex] = {
      slotIndex,
      projectId: projectId ?? this.activeProjectId ?? undefined,
      ...data,
    };
    try {
      const key = this.getSlotsKey(projectId);
      localStorage.setItem(key, JSON.stringify(slots));
    } catch (e) {
      console.warn('[GameStorage] Unable to write to localStorage:', e);
    }
  }

  /**
   * Delete data from a slot
   */
  public static deleteSlot(slotIndex: number, projectId?: string): void {
    const slots = this.getSlots(projectId);
    slots[slotIndex] = null;
    try {
      const key = this.getSlotsKey(projectId);
      localStorage.setItem(key, JSON.stringify(slots));
    } catch (e) {
      console.warn('[GameStorage] Unable to delete slot:', e);
    }
  }

  /**
   * Load data from a slot
   */
  public static loadSlot(slotIndex: number, projectId?: string): SaveSlotData | null {
    const slots = this.getSlots(projectId);
    return slots[slotIndex] || null;
  }

  /**
   * Quick Save
   */
  public static quickSave(data: Omit<SaveSlotData, 'slotIndex'>, projectId?: string): void {
    const slotData: SaveSlotData = {
      slotIndex: -1,
      projectId: projectId ?? this.activeProjectId ?? undefined,
      ...data,
    };
    try {
      const key = this.getQuickKey(projectId);
      localStorage.setItem(key, JSON.stringify(slotData));
    } catch (e) {
      console.warn('[GameStorage] Unable to write quicksave:', e);
    }
  }

  /**
   * Quick Load
   */
  public static quickLoad(projectId?: string): SaveSlotData | null {
    try {
      const key = this.getQuickKey(projectId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private static getSeenKey(projectId?: string): string {
    const pid = projectId ?? this.activeProjectId;
    const prefix = this.getPrefix();
    return pid ? `${prefix}_${pid}_seen_dialogues` : `${prefix}_seen_dialogues`;
  }

  /**
   * Lấy tập hợp các câu thoại đã đọc của dự án (Read Text Tracking)
   */
  public static getSeenDialogues(projectId?: string): Set<string> {
    try {
      const key = this.getSeenKey(projectId);
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch {
      return new Set();
    }
  }

  /**
   * Lưu danh sách các câu thoại đã đọc vào LocalStorage
   */
  public static saveSeenDialogues(seenSet: Set<string>, projectId?: string): void {
    try {
      const key = this.getSeenKey(projectId);
      const arr = Array.from(seenSet);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {
      console.warn('[GameStorage] Unable to save seen dialogues:', e);
    }
  }

  /**
   * Xóa lịch sử đọc kịch bản
   */
  public static clearSeenDialogues(projectId?: string): void {
    try {
      const key = this.getSeenKey(projectId);
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('[GameStorage] Unable to clear seen dialogues:', e);
    }
  }
}
