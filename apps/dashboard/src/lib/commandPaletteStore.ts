// Same lightweight pub/sub pattern as components/ui/toast.ts — lets the
// Topbar's search pill open the palette without prop-drilling through AppShell.
let isOpen = false;
let listeners: Array<() => void> = [];

export function getCommandPaletteOpen(): boolean {
  return isOpen;
}

export function setCommandPaletteOpen(next: boolean): void {
  isOpen = next;
  notify();
}

export function toggleCommandPalette(): void {
  isOpen = !isOpen;
  notify();
}

export function subscribeCommandPalette(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
