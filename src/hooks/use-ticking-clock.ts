"use client";

import { useSyncExternalStore } from "react";

/**
 * A once-per-second clock shared by every subscriber. Returns null during
 * server rendering and hydration, so the server and client HTML match.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let currentSecond = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    currentSecond = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      currentSecond = Math.floor(Date.now() / 1000);
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentSecond || Math.floor(Date.now() / 1000);
const getServerSnapshot = () => null;

/** Current time in whole seconds since the epoch, or null on the server. */
export function useTickingClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
