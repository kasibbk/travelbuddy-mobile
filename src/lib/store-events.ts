import { useSyncExternalStore } from "react";

let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

// Coalesces bursts of writes (e.g. the first-login sync) into one UI notification.
export function emitStoreChange(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    version += 1;
    listeners.forEach((listener) => listener());
  }, 50);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getVersion = () => version;

export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
