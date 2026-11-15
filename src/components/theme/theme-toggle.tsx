"use client";

import { Moon, Sun } from "lucide-react";
import { useDarkMode } from "./use-theme";

/** One-tap light/dark switch for the top bar. */
export function ThemeToggle() {
  const { dark, setDark } = useDarkMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      onClick={() => setDark(!dark)}
      className="grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
    >
      {dark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}

/** The same switch as a labelled row, for Account. */
export function DarkModeSwitch() {
  const { dark, setDark } = useDarkMode();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-semibold text-ink-900">Dark mode</span>
        <span className="text-sm text-ink-600">Saved on this device. Until you choose, Perqly follows your phone.</span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input type="checkbox" role="switch" checked={dark} onChange={(e) => setDark(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className="h-7 w-12 rounded-full bg-ink-300 transition-colors peer-checked:bg-blue-500 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2"
        />
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
