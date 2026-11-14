"use client";

import { useState } from "react";
import { DAYS, type DayHours } from "../hours";

/** Seven rows of open/close times, sent as JSON in the "hours" field. */
export function HoursEditor({ initial, disabled }: { initial: DayHours[]; disabled?: boolean }) {
  const [rows, setRows] = useState(() =>
    DAYS.map((_, i) => {
      const found = initial.find((h) => h.weekday === i + 1);
      return { weekday: i + 1, open: Boolean(found), opens: found?.opens ?? "08:00", closes: found?.closes ?? "20:00" };
    }),
  );
  const value = JSON.stringify(rows.filter((r) => r.open).map(({ weekday, opens, closes }) => ({ weekday, opens, closes })));
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold text-ink-900">Opening hours</legend>
      <p className="mb-2 text-sm text-ink-600">
        Students see &ldquo;Open until…&rdquo; or &ldquo;Closed&rdquo; from these. Closing after midnight is fine.
      </p>
      <input type="hidden" name="hours" value={value} />
      {rows.map((r, i) => (
        <div key={r.weekday} className="flex flex-wrap items-center gap-2">
          <label className="flex w-24 items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={r.open}
              onChange={(e) => update(i, { open: e.target.checked })}
              className="size-4 accent-blue-500"
            />
            {DAYS[i]}
          </label>
          {r.open ? (
            <>
              <label className="sr-only" htmlFor={`opens-${r.weekday}`}>
                {DAYS[i]} opens
              </label>
              <input
                id={`opens-${r.weekday}`}
                type="time"
                value={r.opens}
                onChange={(e) => update(i, { opens: e.target.value })}
                className="h-10 rounded-lg px-2 ring-1 ring-ink-300"
              />
              <span aria-hidden>to</span>
              <label className="sr-only" htmlFor={`closes-${r.weekday}`}>
                {DAYS[i]} closes
              </label>
              <input
                id={`closes-${r.weekday}`}
                type="time"
                value={r.closes}
                onChange={(e) => update(i, { closes: e.target.value })}
                className="h-10 rounded-lg px-2 ring-1 ring-ink-300"
              />
            </>
          ) : (
            <span className="text-sm text-ink-600">Closed</span>
          )}
        </div>
      ))}
    </fieldset>
  );
}
