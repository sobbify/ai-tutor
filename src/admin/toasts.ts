import { create } from 'zustand';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}
export const useToasts = create<{ toasts: Toast[]; push: (text: string, tone?: Toast['tone']) => void; dismiss: (id: number) => void }>((set) => ({
  toasts: [],
  push: (text, tone = 'ok') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
