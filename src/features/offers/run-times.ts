/**
 * When a student price runs: every day (the default), or chosen days and a time range.
 * Days are ISO weekdays (1 = Monday ... 7 = Sunday). Times are "HH:MM" or "HH:MM:SS",
 * Ghana time. Ghana uses UTC all year, so UTC getters give Ghana time.
 * Must match private.offer_runs_at in the database.
 */

export type RunTimes = { run_days: number[] | null; run_from: string | null; run_until: string | null };

export const EVERY_DAY: RunTimes = { run_days: null, run_from: null, run_until: null };

export const WEEKDAYS = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
] as const;

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "14:00" → "2 pm", "09:30" → "9:30 am", "12:00" → "12 pm", "00:00" → "12 am". */
export function formatClock(t: string) {
  const total = minutes(t);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2–5 pm", "9:30 am–1 pm". */
export function formatRange(from: string, until: string) {
  const a = formatClock(from);
  const b = formatClock(until);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return sameHalf ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** "Every day", "Mon–Fri", "Weekends", "Tue, Thu". Runs of 3 or more days are joined with a dash. */
export function formatDays(days: number[] | null) {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.join() === "6,7") return "Weekends";
  if (sorted.join() === "1,2,3,4,5") return "Mon–Fri";
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    const name = (d: number) => WEEKDAYS[d - 1].short;
    parts.push(
      j - i >= 2
        ? `${name(sorted[i])}–${name(sorted[j])}`
        : sorted
            .slice(i, j + 1)
            .map(name)
            .join(", "),
    );
    i = j + 1;
  }
  return parts.join(", ");
}

export const isEveryDay = (r: RunTimes) => !r.run_days?.length && !r.run_from;

/** "Every day", "Tue, Thu · 2–5 pm", "Every day · 2–5 pm", "Weekends". */
export function formatRunTimes(r: RunTimes) {
  const days = formatDays(r.run_days);
  return r.run_from && r.run_until ? `${days} · ${formatRange(r.run_from, r.run_until)}` : days;
}

const isoDay = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
const minuteOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

/** Whether the deal runs at this moment. */
export function runsAt(r: RunTimes, at: Date) {
  if (r.run_days?.length && !r.run_days.includes(isoDay(at))) return false;
  if (r.run_from && r.run_until) {
    const m = minuteOfDay(at);
    return m >= minutes(r.run_from) && m < minutes(r.run_until);
  }
  return true;
}

/** When it next starts, as words: "later today at 2 pm", "tomorrow at 2 pm", "Thu at 2 pm", "Sat". Null if running or never. */
export function nextStart(r: RunTimes, at: Date) {
  if (runsAt(r, at)) return null;
  const from = r.run_from ? minutes(r.run_from) : 0;
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = new Date(at.getTime() + ahead * 86_400_000);
    const runsThatDay = !r.run_days?.length || r.run_days.includes(isoDay(day));
    if (!runsThatDay) continue;
    if (ahead === 0 && minuteOfDay(at) >= from) continue; // today's window has passed
    const when = r.run_from ? ` at ${formatClock(r.run_from)}` : "";
    if (ahead === 0) return `later today${when}`;
    if (ahead === 1) return `tomorrow${when}`;
    return `${WEEKDAYS[isoDay(day) - 1].short}${when}`;
  }
  return null;
}

/** Form values ("1".."7", "HH:MM") to what set_offer_run_times takes. Errors are messages for the form. */
export function parseRunTimesForm(input: {
  mode: string;
  days: string[];
  allDay: boolean;
  from?: string;
  until?: string;
}): { ok: true; value: RunTimes } | { ok: false; field: "runDays" | "runUntil"; message: string } {
  if (input.mode !== "set") return { ok: true, value: EVERY_DAY };
  const days = [...new Set(input.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === 0) return { ok: false, field: "runDays", message: "Pick at least one day." };
  if (input.allDay) return { ok: true, value: { run_days: days.length === 7 ? null : days, run_from: null, run_until: null } };
  const valid = (t?: string) => !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (!valid(input.from) || !valid(input.until)) return { ok: false, field: "runUntil", message: "Enter a start and end time." };
  if (minutes(input.until!) <= minutes(input.from!))
    return { ok: false, field: "runUntil", message: "The end time must be after the start, on the same day." };
  return { ok: true, value: { run_days: days.length === 7 ? null : days, run_from: input.from!, run_until: input.until! } };
}

/**
 * Deals with set days or times that still run later today or are on now (every-day deals are
 * left out: they aren't news). On-now first, then by start time.
 */
export function onToday<T extends RunTimes>(deals: T[], at: Date) {
  const m = minuteOfDay(at);
  return deals
    .filter((d) => {
      if (isEveryDay(d)) return false;
      if (d.run_days?.length && !d.run_days.includes(isoDay(at))) return false;
      return !d.run_until || m < minutes(d.run_until);
    })
    .sort((a, b) => {
      const onA = runsAt(a, at) ? 0 : 1;
      const onB = runsAt(b, at) ? 0 : 1;
      return onA - onB || (a.run_from ? minutes(a.run_from) : 0) - (b.run_from ? minutes(b.run_from) : 0);
    });
}
