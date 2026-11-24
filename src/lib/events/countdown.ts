/**
 * Event countdowns, worked out on the device from the event's real start and end (UTC
 * timestamps) and its timezone. Pure functions: the clock comes in as `now`, so screens tick with
 * one shared timer (use-now.ts) and tests can pick any moment.
 *
 * Matches the database: an event with no end is over 3 hours after it starts.
 */

export type CountdownState = "upcoming" | "live" | "ended" | "cancelled" | "invalid";

export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number };

export type Countdown = {
  state: CountdownState;
  /** Milliseconds until the start (upcoming only). */
  remainingMs: number | null;
  parts: CountdownParts | null;
  /** Which units the big countdown shows: days/hours/minutes, hours/minutes/seconds or minutes/seconds. */
  units: (keyof CountdownParts)[];
  /** Short label for cards: "Starts in 7 days", "Starts tomorrow", "Happening now", … */
  label: string | null;
};

export type CountdownInput = {
  startsAt: string | null | undefined;
  endsAt?: string | null;
  timezone?: string | null;
  lifecycle?: string | null;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DEFAULT_LENGTH = 3 * HOUR;

function parse(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : null;
}

/** The calendar date (YYYY-MM-DD) of a moment in a timezone; UTC if the zone is unknown. */
export function calendarDate(ms: number, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Africa/Accra",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Whole calendar days from `now` to `start`, counted in the event's timezone. */
function calendarDaysBetween(now: number, start: number, timezone?: string | null): number {
  const a = Date.parse(`${calendarDate(now, timezone)}T00:00:00Z`);
  const b = Date.parse(`${calendarDate(start, timezone)}T00:00:00Z`);
  return Math.round((b - a) / DAY);
}

export function splitDuration(ms: number): CountdownParts {
  const total = Math.max(0, Math.floor(ms / SECOND));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function countdown(input: CountdownInput, now: number): Countdown {
  const start = parse(input.startsAt);
  const endGiven = parse(input.endsAt ?? null);
  const none: Countdown = { state: "invalid", remainingMs: null, parts: null, units: [], label: null };
  if (start === null || !Number.isFinite(now)) return none;
  const end = endGiven !== null && endGiven > start ? endGiven : start + DEFAULT_LENGTH;

  if (input.lifecycle === "cancelled") return { ...none, state: "cancelled", label: "Cancelled" };
  if (input.lifecycle === "completed" || input.lifecycle === "archived" || now >= end) {
    return { ...none, state: "ended", label: "Event ended" };
  }
  if (now >= start) return { ...none, state: "live", label: "Happening now" };

  const remaining = start - now;
  const parts = splitDuration(remaining);
  let units: (keyof CountdownParts)[];
  let label: string;
  if (remaining >= DAY) {
    units = ["days", "hours", "minutes"];
    const days = calendarDaysBetween(now, start, input.timezone);
    label = days <= 1 ? "Starts tomorrow" : `Starts in ${days} days`;
  } else if (remaining >= HOUR) {
    units = ["hours", "minutes", "seconds"];
    label = `Starts in ${plural(Math.floor(remaining / HOUR), "hour")}`;
  } else {
    units = ["minutes", "seconds"];
    label = remaining < MINUTE ? "Starting now" : `Starts in ${plural(Math.ceil(remaining / MINUTE), "minute")}`;
  }
  return { state: "upcoming", remainingMs: remaining, parts, units, label };
}

/** How often a countdown needs to re-render: every second near the start, else every minute. */
export function tickFor(c: Countdown): number {
  if (c.state !== "upcoming" || c.remainingMs === null) return 60 * SECOND;
  return c.remainingMs < DAY ? SECOND : 30 * SECOND;
}
