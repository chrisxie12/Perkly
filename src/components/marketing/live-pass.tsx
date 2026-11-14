"use client";

import { BadgeCheck } from "lucide-react";
import { useTickingClock } from "@/hooks/use-ticking-clock";
import { DAY_COLOURS, dayColourFor, formatPassClock, type DayColour } from "@/lib/day-colour";
import { cn } from "@/lib/utils";

/**
 * A product illustration of the live redemption pass. It ticks like the
 * real one will, and takes today's colour. It is not a working pass.
 */
export function LivePass({ className }: { className?: string }) {
  const epochSeconds = useTickingClock();
  const now = epochSeconds === null ? null : new Date(epochSeconds * 1000);
  // The illustration counts down from 9:47 and loops every 10 minutes, like a real pass.
  const secondsLeft = epochSeconds === null ? 587 : 600 - (epochSeconds % 600);

  const colour: DayColour = now ? dayColourFor(now) : DAY_COLOURS[1];
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div
      className={cn("relative overflow-hidden rounded-[1.6rem] p-5 shadow-lift", className)}
      style={{ backgroundColor: colour.hex, color: colour.ink }}
      aria-label={`Example live pass. Today's pass colour is ${colour.day}.`}
      role="img"
    >
      {/* Moving stripes: a still screenshot looks different from the live pass */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -right-10 left-0 animate-[stripes_1.6s_linear_infinite] opacity-[0.14] will-change-transform"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 22px)" }}
      />

      <div className="relative flex items-center gap-3">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-full font-display text-lg font-extrabold ring-2 ring-current/40"
          style={{ backgroundColor: colour.ink, color: colour.hex }}
          aria-hidden
        >
          AK
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-bold">Ama K.</p>
          <p className="flex items-center gap-1 text-sm font-medium whitespace-nowrap opacity-90">
            <BadgeCheck className="size-4" aria-hidden /> Verified student, GCTU
          </p>
        </div>
      </div>

      <div className="relative mt-5 rounded-2xl bg-white/95 p-4 text-ink-900">
        <p className="text-sm font-medium text-ink-600">Auntie Esi&apos;s Waakye</p>
        <p className="mt-0.5 font-display text-xl leading-snug font-bold">15% off any plate</p>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-600">Cashier code</p>
            <p className="font-display text-[2.25rem] leading-none font-extrabold tracking-[0.06em] tabular-nums">4821</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-ink-600">Live clock</p>
            <p className="font-display text-lg font-bold tabular-nums sm:text-xl" suppressHydrationWarning>
              {now ? formatPassClock(now) : "--:--:--"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3 text-sm font-semibold whitespace-nowrap">
        <span>{colour.day}</span>
        <span className="tabular-nums" suppressHydrationWarning>
          {minutes}:{seconds} left
        </span>
      </div>
    </div>
  );
}
