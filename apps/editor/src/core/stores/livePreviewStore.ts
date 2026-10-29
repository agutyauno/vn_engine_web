import { create } from 'zustand';
import type { Instruction, Character, AssetRef } from '@vn-engine/shared-types';

export interface HotReloadPayload {
  program: Instruction[];
  projectId: string;
  characters: Character[];
  assets: AssetRef[];
}

export interface LivePreviewStoreState {
  isPlaying: boolean;
  connectionStatus: 'standby' | 'connected' | 'disconnected';
  pendingProgram: HotReloadPayload | null;
  pendingVariableOverrides: Record<string, unknown>;
  watchedVariables: Record<string, unknown>;

  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => void;
  setConnectionStatus: (status: 'standby' | 'connected' | 'disconnected') => void;
  setPendingProgram: (payload: HotReloadPayload | null) => void;
  clearPendingProgram: () => void;
  setVariableOverride: (name: string, value: unknown) => void;
  clearVariableOverrides: () => void;
  syncVariables: (vars: Record<string, unknown>) => void;
}

export const initialPreviewState: Omit<
  LivePreviewStoreState,
  | 'setIsPlaying'
  | 'togglePlay'
  | 'setConnectionStatus'
  | 'setPendingProgram'
  | 'clearPendingProgram'
  | 'setVariableOverride'
  | 'clearVariableOverrides'
  | 'syncVariables'
> = {
  isPlaying: false,
  connectionStatus: 'standby',
  pendingProgram: null,
  pendingVariableOverrides: {},
  watchedVariables: {},
};

export const usePreviewStore = create<LivePreviewStoreState>((set) => ({
  ...initialPreviewState,

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setPendingProgram: (payload) => set({ pendingProgram: payload }),

  clearPendingProgram: () => set({ pendingProgram: null }),

  setVariableOverride: (name, value) =>
    set((state) => ({
      pendingVariableOverrides: {
        ...state.pendingVariableOverrides,
        [name]: value,
      },
    })),

  clearVariableOverrides: () => set({ pendingVariableOverrides: {} }),

  syncVariables: (vars) => set({ watchedVariables: vars }),
}));

export const useLivePreviewStore = usePreviewStore;

