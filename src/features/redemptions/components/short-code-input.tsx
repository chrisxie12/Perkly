"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { normaliseShortCode } from "../schemas";

/** Big code field that groups the 8 characters as XXXX-XXXX while typing. */
export function ShortCodeInput({ invalid }: { invalid: boolean }) {
  const [value, setValue] = useState("");
  return (
    <input
      id="code"
      name="code"
      value={value}
      onChange={(e) => {
        const raw = normaliseShortCode(e.target.value).slice(0, 8);
        setValue(raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw);
      }}
      autoFocus
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      inputMode="text"
      maxLength={9}
      placeholder="XXXX-XXXX"
      aria-invalid={invalid || undefined}
      className={cn(
        "h-18 rounded-2xl border-2 bg-white text-center font-display text-3xl font-bold tracking-[0.14em] uppercase outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50",
        invalid ? "border-red-600" : "border-ink-300",
      )}
    />
  );
}
