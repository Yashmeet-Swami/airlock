export type ToastTone = "success" | "error";

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  text: string;
}

let toasts: ToastMessage[] = [];
let listeners: Array<() => void> = [];
let nextId = 1;

const TOAST_DURATION_MS = 4000;

export function showToast(tone: ToastTone, text: string): void {
  const toast: ToastMessage = { id: nextId++, tone, text };
  toasts = [...toasts, toast];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    notify();
  }, TOAST_DURATION_MS);
}

export function getToasts(): ToastMessage[] {
  return toasts;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
