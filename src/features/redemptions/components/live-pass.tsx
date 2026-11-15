"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Sun } from "lucide-react";

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Africa/Accra",
});
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });

/**
 * The live pass: moving background, running clock with seconds and a countdown,
 * so a screenshot is easy to spot. Everything shown comes from the session.
 */
export function LivePass({
  firstName,
  institution,
  offerTitle,
  place,
  passCode,
  publicRef,
  expiresAt,
  windowSeconds = 600,
  photoUrl,
  children,
}: {
  firstName: string;
  institution: string;
  offerTitle: string;
  place: string;
  passCode: string | null;
  publicRef: string;
  expiresAt: string;
  windowSeconds?: number;
  photoUrl?: string | null;
  children?: React.ReactNode;
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
  const left = now ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000)) : null;
  const pct = left === null ? 100 : Math.min(100, (left / windowSeconds) * 100);

  return (
    <div className="theme-fixed relative flex min-h-dvh flex-col overflow-hidden bg-[#0A1430] text-white">
      <div className="pass-bg" aria-hidden />
      <div className="pt-safe pb-safe relative z-10 flex flex-1 flex-col px-5 pb-5">
        <div className="flex min-h-12 items-center justify-between">
          <span className="flex items-center gap-2 text-[0.9375rem] font-bold">
            <span className="live-dot" aria-hidden /> Live pass
          </span>
          <span className="flex items-center gap-1.5 text-[0.8125rem] opacity-85">
            <Sun className="size-4" aria-hidden /> Turn brightness up
          </span>
        </div>
        <div className="mt-1 flex flex-col items-center rounded-3xl bg-white px-5 pt-6 pb-5 text-center text-ink-900 shadow-[0_12px_40px_rgba(15,23,42,0.16)]">
          <div
            className="relative grid size-24 place-items-center rounded-full bg-ink-900 font-display text-3xl font-bold text-white ring-4 ring-white outline-2 outline-offset-4 outline-emerald-600"
            aria-hidden
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={photoUrl} alt="" className="size-full rounded-full object-cover" />
            ) : (
              firstName.slice(0, 1).toUpperCase()
            )}
            <span className="absolute -right-0.5 -bottom-0.5 grid size-7 place-items-center rounded-full bg-emerald-600 ring-3 ring-white">
              <BadgeCheck className="size-4 text-white" />
            </span>
          </div>
          <p className="mt-3 font-display text-[1.625rem] font-bold tracking-tight">{firstName}</p>
          <p className="text-sm font-semibold text-emerald-700">Verified student, {institution}</p>
          <div className="mt-3.5 w-full border-t border-dashed border-ink-300 pt-3.5">
            <b className="block text-lg">{offerTitle}</b>
            <span className="text-sm text-ink-600">{place}</span>
          </div>
          {passCode && (
            <>
              <p className="mt-3.5 text-xs font-bold tracking-[0.12em] text-ink-600">CASHIER CODE</p>
              <p
                className="ml-[0.14em] font-display text-[3.5rem] leading-none font-extrabold tracking-[0.14em] tabular-nums"
                aria-label={`Cashier code ${passCode.split("").join(" ")}`}
              >
                {passCode}
              </p>
            </>
          )}
          <p className="mt-3 flex items-center gap-2 text-lg font-bold tabular-nums" aria-live="off">
            {now ? clock.format(now) : "--:--:--"}{" "}
            <span className="text-[0.9375rem] font-medium text-ink-600">{now ? day.format(now) : ""}</span>
          </p>
          <div className="mt-3 w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
              <i
                className="block h-full rounded-full bg-blue-500 transition-[width] duration-1000 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[0.8125rem] text-ink-600 tabular-nums">
              <span>{left === 0 ? "Timed out" : "Pass expires in"}</span>
              <span>{left === null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-600">{publicRef}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
