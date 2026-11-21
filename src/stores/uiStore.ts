import { create } from 'zustand';

interface UIState {
  chatVisible: boolean;
  toggleChat: () => void;
}

/** Client-only UI preferences (server state lives in TanStack Query). */
export const useUIStore = create<UIState>((set) => ({
  chatVisible: false,
  toggleChat: () => set((s) => ({ chatVisible: !s.chatVisible })),
}));
