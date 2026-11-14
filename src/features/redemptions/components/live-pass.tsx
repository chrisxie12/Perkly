"use client";

import { useEffect, useState } from "react";
import { dayColourFor } from "@/lib/day-colour";

const clock = new Intl.DateTimeFormat("en-GH", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Africa/Accra",
});

/** The live pass: a running clock and the colour of the day make screenshots easy to spot. */
export function LivePass({
  firstName,
  institution,
  passCode,
  publicRef,
  expiresAt,
}: {
  firstName: string;
  institution: string;
  passCode: string | null;
  publicRef: string;
  expiresAt: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const colour = dayColourFor(now ?? new Date(expiresAt));
  const left = now ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000)) : null;
  return (
    <div className="overflow-hidden rounded-2xl shadow-soft" style={{ backgroundColor: colour.hex, color: colour.ink }}>
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold opacity-90">Perqly student pass</p>
          <p className="mt-1 font-display text-3xl font-extrabold">{firstName}</p>
          <p className="font-semibold opacity-90">{institution}</p>
        </div>
        {passCode && (
          <div className="rounded-xl bg-white px-4 py-2 text-center text-ink-900">
            <p className="text-xs font-semibold text-ink-600">Pass code</p>
            <p className="font-display text-3xl font-extrabold tracking-widest tabular-nums">{passCode}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-black/20 px-5 py-3 text-sm font-semibold">
        <span className="tabular-nums" aria-live="off">
          {now ? clock.format(now) : "--:--:--"}
        </span>
        <span>{publicRef}</span>
        <span className="tabular-nums">
          {left === null ? "" : left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : "Timed out"}
        </span>
      </div>
    </div>
  );
}
