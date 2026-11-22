import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  formatClock,
  formatDays,
  formatRange,
  formatRunTimes,
  isEveryDay,
  nextStart,
  parseRunTimesForm,
  runsAt,
  onToday,
  type RunTimes,
} from "@/features/offers/run-times";

// Ghana is UTC all year, so these instants are Ghana time. 2026-11-24 is a Tuesday.
const at = (iso: string) => new Date(`${iso}Z`);
const tueThu: RunTimes = { run_days: [2, 4], run_from: "14:00:00", run_until: "17:00:00" };

describe("labels", () => {
  it("writes clock times the way people say them", () => {
    expect(formatClock("14:00")).toBe("2 pm");
    expect(formatClock("09:30:00")).toBe("9:30 am");
    expect(formatClock("12:00")).toBe("12 pm");
    expect(formatClock("00:00")).toBe("12 am");
    expect(formatRange("14:00", "17:00")).toBe("2–5 pm");
    expect(formatRange("09:30", "13:00")).toBe("9:30 am–1 pm");
  });
  it("names days briefly", () => {
    expect(formatDays(null)).toBe("Every day");
    expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(formatDays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDays([6, 7])).toBe("Weekends");
    expect(formatDays([4, 2])).toBe("Tue, Thu");
    expect(formatDays([1, 2, 3, 6])).toBe("Mon–Wed, Sat");
  });
  it("puts days and times together", () => {
    expect(formatRunTimes(tueThu)).toBe("Tue, Thu · 2–5 pm");
    expect(formatRunTimes({ run_days: null, run_from: "18:00", run_until: "21:00" })).toBe("Every day · 6–9 pm");
    expect(isEveryDay({ run_days: null, run_from: null, run_until: null })).toBe(true);
    expect(isEveryDay(tueThu)).toBe(false);
  });
});

describe("whether a deal is on", () => {
  it("matches the database rule: start included, end not", () => {
    expect(runsAt(tueThu, at("2026-11-24T15:00:00"))).toBe(true);
    expect(runsAt(tueThu, at("2026-11-26T14:00:00"))).toBe(true);
    expect(runsAt(tueThu, at("2026-11-24T17:00:00"))).toBe(false);
    expect(runsAt(tueThu, at("2026-11-24T13:59:00"))).toBe(false);
    expect(runsAt(tueThu, at("2026-11-25T15:00:00"))).toBe(false);
  });
  it("says when it next starts", () => {
    expect(nextStart(tueThu, at("2026-11-24T10:00:00"))).toBe("later today at 2 pm");
    expect(nextStart(tueThu, at("2026-11-24T18:00:00"))).toBe("Thu at 2 pm");
    expect(nextStart(tueThu, at("2026-11-25T09:00:00"))).toBe("tomorrow at 2 pm");
    expect(nextStart(tueThu, at("2026-11-24T15:00:00"))).toBeNull();
    expect(nextStart({ run_days: [6, 7], run_from: null, run_until: null }, at("2026-11-25T09:00:00"))).toBe("Sat");
  });
  it("uses the same rule as the database", () => {
    const sql = readFileSync("supabase/migrations/20261122090000_offer_run_times.sql", "utf8");
    expect(sql).toContain("g.t::time >= o.run_from and g.t::time < o.run_until");
    expect(sql).toContain("isodow");
  });
});

describe("the business form", () => {
  it("defaults to every day", () => {
    expect(parseRunTimesForm({ mode: "every", days: ["2"], allDay: false, from: "14:00", until: "17:00" })).toEqual({
      ok: true,
      value: { run_days: null, run_from: null, run_until: null },
    });
  });
  it("saves chosen days and times", () => {
    expect(parseRunTimesForm({ mode: "set", days: ["4", "2", "2"], allDay: false, from: "14:00", until: "17:00" })).toEqual({
      ok: true,
      value: { run_days: [2, 4], run_from: "14:00", run_until: "17:00" },
    });
    expect(parseRunTimesForm({ mode: "set", days: ["6", "7"], allDay: true })).toEqual({
      ok: true,
      value: { run_days: [6, 7], run_from: null, run_until: null },
    });
  });
  it("explains mistakes", () => {
    expect(parseRunTimesForm({ mode: "set", days: [], allDay: true })).toMatchObject({ ok: false, field: "runDays" });
    expect(parseRunTimesForm({ mode: "set", days: ["1"], allDay: false, from: "17:00", until: "14:00" })).toMatchObject({
      ok: false,
      field: "runUntil",
    });
    expect(parseRunTimesForm({ mode: "set", days: ["1"], allDay: false })).toMatchObject({ ok: false, field: "runUntil" });
  });
});

describe("On today row", () => {
  type D = RunTimes & { id: string };
  const deals: D[] = [
    { id: "every", run_days: null, run_from: null, run_until: null },
    { id: "tue-evening", run_days: [2], run_from: "18:00", run_until: "21:00" },
    { id: "tue-afternoon", run_days: [2], run_from: "14:00", run_until: "17:00" },
    { id: "wed", run_days: [3], run_from: null, run_until: null },
    { id: "tue-morning", run_days: [2], run_from: "08:00", run_until: "10:00" },
    { id: "daily-lunch", run_days: null, run_from: "12:00", run_until: "14:00" },
  ];
  it("shows deals on today, on-now first, leaving out every-day and finished ones", () => {
    // Tuesday 3 pm: the afternoon deal is on; the evening one is later; the morning and lunch ones are over.
    expect(onToday(deals, at("2026-11-24T15:00:00")).map((d) => d.id)).toEqual(["tue-afternoon", "tue-evening"]);
    // Tuesday 9 am: the morning deal is on; lunch, afternoon and evening are still to come.
    expect(onToday(deals, at("2026-11-24T09:00:00")).map((d) => d.id)).toEqual([
      "tue-morning",
      "daily-lunch",
      "tue-afternoon",
      "tue-evening",
    ]);
    expect(onToday(deals, at("2026-11-25T10:00:00")).map((d) => d.id)).toEqual(["wed", "daily-lunch"]);
  });
});

describe("shared deal links", () => {
  it("point at the public preview page, which has its own share image", () => {
    const page = readFileSync("src/app/student/offers/[id]/page.tsx", "utf8");
    expect(page).toContain("path={`/d/${offer.offer_id}`}");
    expect(readFileSync("src/app/(marketing)/d/[id]/opengraph-image.tsx", "utf8")).toContain("getDealPreview");
  });
  it("only shows a poster's worth of detail publicly", () => {
    const sql = readFileSync("supabase/migrations/20261122200000_deal_preview.sql", "utf8");
    expect(sql).toContain("grant execute on function public.deal_preview(uuid) to anon");
    expect(sql).not.toMatch(/phone|whatsapp|latitude|email/);
  });
});
