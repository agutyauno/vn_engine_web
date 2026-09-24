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
}

const STORAGE_KEY_SLOTS = 'vn_engine_save_slots';
const STORAGE_KEY_QUICK = 'vn_engine_quicksave';
export const TOTAL_SLOTS = 12;
export const SLOTS_PER_PAGE = 6;

export class GameStorage {
  /**
   * Get list of 12 save game slots
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
   * Save to a specific slot
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
      console.warn('[GameStorage] Unable to write to localStorage:', e);
    }
  }

  /**
   * Delete data from a slot
   */
  public static deleteSlot(slotIndex: number): void {
    const slots = this.getSlots();
    slots[slotIndex] = null;
    try {
      localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(slots));
    } catch (e) {
      console.warn('[GameStorage] Unable to delete slot:', e);
    }
  }

  /**
   * Load data from a slot
   */
  public static loadSlot(slotIndex: number): SaveSlotData | null {
    const slots = this.getSlots();
    return slots[slotIndex] || null;
  }

  /**
   * Quick Save
   */
  public static quickSave(data: Omit<SaveSlotData, 'slotIndex'>): void {
    const slotData: SaveSlotData = {
      slotIndex: -1,
      ...data,
    };
    try {
      localStorage.setItem(STORAGE_KEY_QUICK, JSON.stringify(slotData));
    } catch (e) {
      console.warn('[GameStorage] Unable to write quicksave:', e);
    }
  }

  /**
   * Quick Load
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
