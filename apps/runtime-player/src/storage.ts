// ==========================================
// QUẢN LÝ LƯU TRỮ TRẠNG THÁI (LOCALSTORAGE SAVE/LOAD)
// ==========================================

export interface SaveSlotData {
  slotIndex: number;
  timestamp: number;
  sceneName: string;
  thumbnail: string;
  vmStateJson: string;
  dialoguePreview: string;
}

const STORAGE_KEY_SLOTS = 'vn_engine_save_slots';
const STORAGE_KEY_QUICK = 'vn_engine_quicksave';
export const TOTAL_SLOTS = 12;
export const SLOTS_PER_PAGE = 6;

export class GameStorage {
  /**
   * Lấy danh sách 12 slots lưu game
   */
  public static getSlots(): (SaveSlotData | null)[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SLOTS);
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
   * Lưu vào một slot cụ thể
   */
  public static saveSlot(slotIndex: number, data: Omit<SaveSlotData, 'slotIndex'>): void {
    const slots = this.getSlots();
    slots[slotIndex] = {
      slotIndex,
      ...data,
    };
    try {
      localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(slots));
    } catch (e) {
      console.warn('[GameStorage] Không thể ghi vào localStorage:', e);
    }
  }

  /**
   * Xóa dữ liệu một slot
   */
  public static deleteSlot(slotIndex: number): void {
    const slots = this.getSlots();
    slots[slotIndex] = null;
    try {
      localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(slots));
    } catch (e) {
      console.warn('[GameStorage] Không thể xóa slot:', e);
    }
  }

  /**
   * Tải dữ liệu từ một slot
   */
  public static loadSlot(slotIndex: number): SaveSlotData | null {
    const slots = this.getSlots();
    return slots[slotIndex] || null;
  }

  /**
   * Lưu nhanh (Quick Save)
   */
  public static quickSave(data: Omit<SaveSlotData, 'slotIndex'>): void {
    const slotData: SaveSlotData = {
      slotIndex: -1,
      ...data,
    };
    try {
      localStorage.setItem(STORAGE_KEY_QUICK, JSON.stringify(slotData));
    } catch (e) {
      console.warn('[GameStorage] Không thể ghi quicksave:', e);
    }
  }

  /**
   * Tải nhanh (Quick Load)
   */
  public static quickLoad(): SaveSlotData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_QUICK);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
