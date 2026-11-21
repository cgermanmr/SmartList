import { useSyncExternalStore } from 'react';

// Reloj compartido: una sola marca de tiempo que se renueva cada 30 s mientras alguien la usa. En el prerender
// vale 0 (Next no deja leer la hora ahí); en el cliente, la hora real.
const TICK_MS = 30_000;
let current = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach(l => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearInterval(timer);
  };
}

function getSnapshot(): number {
  if (current === 0) current = Date.now();
  return current;
}

/** La hora actual, renovada cada 30 s (para textos como "hace 5 min" sin leer la hora en el render) */
export function useNow(): Date {
  const time = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  return new Date(time);
}
