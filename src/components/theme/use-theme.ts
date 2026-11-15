"use client";

import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    __perqlyTheme?: (choice: "system" | "light" | "dark") => void;
  }
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Whether the app is dark right now, and a toggle that remembers the choice on this device. */
export function useDarkMode() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );
  const setDark = (next: boolean) => window.__perqlyTheme?.(next ? "dark" : "light");
  return { dark, setDark };
}
