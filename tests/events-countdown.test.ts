import { describe, expect, it } from "vitest";
import { calendarDate, countdown, splitDuration, tickFor } from "@/lib/events/countdown";

const at = (iso: string) => Date.parse(iso);
const START = "2026-12-10T18:00:00Z"; // 18:00 in Accra (UTC+0)

describe("event countdowns", () => {
  it("more than seven days away: days, hours and minutes", () => {
    const c = countdown({ startsAt: START }, at("2026-12-01T12:00:00Z"));
    expect(c.state).toBe("upcoming");
    expect(c.units).toEqual(["days", "hours", "minutes"]);
    expect(c.parts).toEqual({ days: 9, hours: 6, minutes: 0, seconds: 0 });
    expect(c.label).toBe("Starts in 9 days");
  });

  it("tomorrow, by the calendar in the event's timezone", () => {
    expect(countdown({ startsAt: START }, at("2026-12-09T10:00:00Z")).label).toBe("Starts tomorrow");
    expect(countdown({ startsAt: START }, at("2026-12-08T10:00:00Z")).label).toBe("Starts in 2 days");
  });

  it("less than 24 hours: hours, minutes and seconds", () => {
    const c = countdown({ startsAt: START }, at("2026-12-10T14:59:30Z"));
    expect(c.units).toEqual(["hours", "minutes", "seconds"]);
    expect(c.parts).toMatchObject({ hours: 3, minutes: 0, seconds: 30 });
    expect(c.label).toBe("Starts in 3 hours");
    expect(countdown({ startsAt: START }, at("2026-12-10T16:30:00Z")).label).toBe("Starts in 1 hour");
  });

  it("less than an hour: minutes and seconds", () => {
    const c = countdown({ startsAt: START }, at("2026-12-10T17:35:10Z"));
    expect(c.units).toEqual(["minutes", "seconds"]);
    expect(c.parts).toMatchObject({ minutes: 24, seconds: 50 });
    expect(c.label).toBe("Starts in 25 minutes");
  });

  it("the last minute, then the start", () => {
    expect(countdown({ startsAt: START }, at("2026-12-10T17:59:30Z")).label).toBe("Starting now");
    expect(countdown({ startsAt: START }, at("2026-12-10T18:00:00Z")).label).toBe("Happening now");
  });

  it("happening now until it ends, including multi-day events", () => {
    const conf = { startsAt: START, endsAt: "2026-12-13T17:00:00Z" };
    expect(countdown(conf, at("2026-12-12T09:00:00Z")).state).toBe("live");
    expect(countdown(conf, at("2026-12-13T17:00:00Z")).state).toBe("ended");
  });

  it("ended: at the end, or 3 hours after the start when there is no end (as the database)", () => {
    expect(countdown({ startsAt: START }, at("2026-12-10T20:59:59Z")).state).toBe("live");
    const c = countdown({ startsAt: START }, at("2026-12-10T21:00:00Z"));
    expect(c.state).toBe("ended");
    expect(c.label).toBe("Event ended");
    expect(countdown({ startsAt: START, lifecycle: "completed" }, at("2026-12-01T00:00:00Z")).state).toBe("ended");
  });

  it("cancelled events say so instead of counting down", () => {
    const c = countdown({ startsAt: START, lifecycle: "cancelled" }, at("2026-12-01T00:00:00Z"));
    expect(c.state).toBe("cancelled");
    expect(c.label).toBe("Cancelled");
    expect(c.parts).toBeNull();
  });

  it("a rescheduled event counts to its new time", () => {
    const now = at("2026-12-10T12:00:00Z");
    const before = countdown({ startsAt: START }, now);
    const after = countdown({ startsAt: "2026-12-17T18:00:00Z" }, now);
    expect(before.label).toBe("Starts in 6 hours");
    expect(after.label).toBe("Starts in 7 days");
    expect(after.remainingMs! - before.remainingMs!).toBe(7 * 24 * 3600 * 1000);
  });

  it("uses the real instant, whatever the viewer's or event's timezone", () => {
    // 09:00 in London in summer is 08:00 UTC; the remaining time is the same everywhere.
    const c = countdown({ startsAt: "2027-07-01T08:00:00Z", timezone: "Europe/London" }, at("2027-07-01T07:00:00Z"));
    expect(c.remainingMs).toBe(3600 * 1000);
    // Calendar days follow the event's timezone: 23:30 UTC on 30 June is already 1 July in London.
    expect(calendarDate(at("2027-06-30T23:30:00Z"), "Europe/London")).toBe("2027-07-01");
    expect(calendarDate(at("2027-06-30T23:30:00Z"), "Africa/Accra")).toBe("2027-06-30");
    expect(countdown({ startsAt: "2027-07-02T10:00:00Z", timezone: "Europe/London" }, at("2027-06-30T23:30:00Z")).label).toBe(
      "Starts tomorrow",
    );
  });

  it("missing or invalid dates are handled safely", () => {
    expect(countdown({ startsAt: null }, Date.now()).state).toBe("invalid");
    expect(countdown({ startsAt: "not a date" }, Date.now()).label).toBeNull();
    expect(countdown({ startsAt: START, timezone: "Mars/Base" }, at("2026-12-01T00:00:00Z")).label).toBe("Starts in 9 days");
    expect(countdown({ startsAt: START, endsAt: "2026-12-01T00:00:00Z" }, at("2026-12-10T19:00:00Z")).state).toBe("live");
  });

  it("splits durations and picks a sensible refresh", () => {
    expect(splitDuration(3 * 86400000 + 12 * 3600000 + 45 * 60000 + 20000)).toEqual({ days: 3, hours: 12, minutes: 45, seconds: 20 });
    expect(tickFor(countdown({ startsAt: START }, at("2026-12-10T17:00:00Z")))).toBe(1000);
    expect(tickFor(countdown({ startsAt: START }, at("2026-12-01T00:00:00Z")))).toBe(30000);
  });
});
