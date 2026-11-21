"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { label: string; href: string; value: string | null };

/** "Sort: Nearest ▾" — one compact button instead of a second row of chips. */
export function SortMenu({ current, options }: { current: string | null; options: Option[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const active = options.find((o) => o.value === current) ?? options[0];

  // Close when tapping outside or pressing Escape.
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative shrink-0">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full bg-white px-3.5 text-[0.8125rem] font-semibold text-ink-700 ring-1 ring-ink-200 [&::-webkit-details-marker]:hidden">
        <ArrowUpDown className="size-3.5 text-ink-600" aria-hidden />
        <span className="sr-only">Sort deals by</span>
        {active.label}
        <ChevronDown className="size-4 text-ink-600" aria-hidden />
      </summary>
      <ul className="absolute right-0 z-20 mt-2 w-48 rounded-2xl bg-white p-1.5 shadow-[0_16px_40px_-12px_rgba(0,31,82,0.3)] ring-1 ring-ink-200">
        {options.map((o) => {
          const on = o.value === active.value;
          return (
            <li key={o.label}>
              <Link
                href={o.href}
                aria-current={on ? "true" : undefined}
                onClick={() => ref.current && (ref.current.open = false)}
                className={cn(
                  "flex min-h-11 items-center justify-between rounded-xl px-3 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100",
                  on && "font-semibold",
                )}
              >
                {o.label}
                {on && <Check className="size-4 text-blue-600" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
