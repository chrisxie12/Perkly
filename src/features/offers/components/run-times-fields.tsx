"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { WEEKDAYS, formatRunTimes, isEveryDay, type RunTimes } from "../run-times";

/**
 * "When does the student price run?" Every day, or chosen days with an optional time range.
 * Posts: runMode ("every" | "set"), runDays (1–7, repeated), runAllDay ("on"), runFrom, runUntil.
 */
export function RunTimesFields({ initial, errors }: { initial?: RunTimes; errors?: { runDays?: string; runUntil?: string } }) {
  const start = initial ?? { run_days: null, run_from: null, run_until: null };
  const [mode, setMode] = useState<"every" | "set">(isEveryDay(start) ? "every" : "set");
  const [days, setDays] = useState<number[]>(start.run_days ?? (start.run_from ? [1, 2, 3, 4, 5, 6, 7] : []));
  const [allDay, setAllDay] = useState(!start.run_from);
  const [from, setFrom] = useState(start.run_from?.slice(0, 5) ?? "14:00");
  const [until, setUntil] = useState(start.run_until?.slice(0, 5) ?? "17:00");

  const preview =
    mode === "every" || days.length === 0
      ? null
      : formatRunTimes({ run_days: days, run_from: allDay ? null : from, run_until: allDay ? null : until });

  const choice = (value: "every" | "set", title: string, text: string) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 transition-colors",
        mode === value ? "bg-blue-50 ring-2 ring-blue-500" : "bg-white ring-ink-200 hover:bg-ink-50",
      )}
    >
      <input
        type="radio"
        name="runMode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="mt-1 size-4 accent-blue-600"
      />
      <span>
        <span className="block font-semibold text-ink-900">{title}</span>
        <span className="block text-sm text-ink-600">{text}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold text-ink-900">When does the student price run?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {choice("every", "Every day", "Whenever you're open.")}
        {choice("set", "Set days and times", "For example, Tuesdays and Thursdays from 2 to 5 pm.")}
      </div>

      {mode === "set" && (
        <div className="space-y-4 rounded-2xl bg-ink-50 p-4">
          <div>
            <p id="run-days-label" className="mb-2 text-sm font-medium text-ink-900">
              Days
            </p>
            <div role="group" aria-labelledby="run-days-label" className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.day);
                return (
                  <label
                    key={d.day}
                    className={cn(
                      "grid h-11 min-w-12 cursor-pointer place-items-center rounded-full px-3 text-sm font-semibold ring-1 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue-500",
                      on ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="runDays"
                      value={d.day}
                      checked={on}
                      onChange={() => setDays((list) => (on ? list.filter((x) => x !== d.day) : [...list, d.day]))}
                      className="sr-only"
                    />
                    <span aria-hidden>{d.short}</span>
                    <span className="sr-only">{d.long}</span>
                  </label>
                );
              })}
            </div>
            {errors?.runDays && <FieldError>{errors.runDays}</FieldError>}
          </div>

          <label className="flex items-center gap-2.5 text-sm font-medium text-ink-900">
            <input
              type="checkbox"
              name="runAllDay"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-4 accent-blue-600"
            />
            All day on those days
          </label>

          {!allDay && (
            <div className="grid max-w-md gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="runFrom">From</Label>
                <Input id="runFrom" name="runFrom" type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="runUntil">Until</Label>
                <Input
                  id="runUntil"
                  name="runUntil"
                  type="time"
                  step={900}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  invalid={Boolean(errors?.runUntil)}
                />
              </div>
              {errors?.runUntil && (
                <div className="sm:col-span-2">
                  <FieldError>{errors.runUntil}</FieldError>
                </div>
              )}
            </div>
          )}

          <FieldHint>
            {preview ? `Students will see: ${preview}. ` : ""}
            Outside these times students still see the deal, but they can&apos;t use it. Times are Ghana time.
          </FieldHint>
        </div>
      )}
    </fieldset>
  );
}
