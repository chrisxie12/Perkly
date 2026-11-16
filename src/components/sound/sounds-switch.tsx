"use client";

import { useSyncExternalStore } from "react";
import { playSound, setSoundsEnabled, soundsEnabled } from "@/lib/sound";

const EVENT = "perqly-sounds-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Account setting: app sounds and vibration on this device. */
export function SoundsSwitch() {
  const on = useSyncExternalStore(subscribe, soundsEnabled, () => true);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block font-semibold text-ink-900">Sounds and vibration</span>
        <span className="text-sm text-ink-600">New messages, notifications and finished discounts. Saved on this device.</span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(e) => {
            setSoundsEnabled(e.target.checked);
            window.dispatchEvent(new Event(EVENT));
            if (e.target.checked) playSound("notify");
          }}
          className="peer sr-only"
        />
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
