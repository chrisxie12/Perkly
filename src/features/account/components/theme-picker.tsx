"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Choice = "system" | "light" | "dark";

declare global {
  interface Window {
    __perqlyTheme?: (choice: Choice) => void;
  }
}

const OPTIONS: { value: Choice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Same as phone", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-choice"] });
  return () => observer.disconnect();
}
const read = (): Choice => (document.documentElement.dataset.themeChoice as Choice | undefined) ?? "system";

/** Appearance: follow the phone, or always light or dark. Saved on this device. */
export function ThemePicker() {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as Choice);
  return (
    <fieldset>
      <legend className="sr-only">Appearance</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, Icon }) => (
          <label
            key={value}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center text-sm font-semibold text-ink-700 ring-1 ring-ink-200 has-[:checked]:text-ink-900 has-[:checked]:ring-2 has-[:checked]:ring-blue-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={choice === value}
              onChange={() => window.__perqlyTheme?.(value)}
              className="sr-only"
            />
            <Icon className="size-5" aria-hidden />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
