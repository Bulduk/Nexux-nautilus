import { create } from "zustand";

export type ToastKind = "success" | "error" | "warning" | "info" | "autoexec" | "council";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  durationMs?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    const ms = t.durationMs ?? 5000;
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ms);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(t: Omit<Toast, "id">) {
  useToastStore.getState().push(t);
}
