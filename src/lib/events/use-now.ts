"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared clock for every countdown on the page: a single interval that runs only while
 * something is listening and stops when the last countdown unmounts. Returns null on the server
 * and during hydration, so the first render matches the server's (no hydration mismatch); show
 * the plain date until it has a value.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = 0;

function tick() {
  current = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    current = Date.now();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => current || Date.now(),
    () => null,
  );
}
