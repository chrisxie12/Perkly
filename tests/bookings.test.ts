import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingErrorMessage,
  dayLabel,
  exceptionFormSchema,
  formatBookingTime,
  formatSlotTime,
  isOpen,
  markWindow,
  nextDays,
  requestFormSchema,
  ruleFormSchema,
} from "@/features/bookings/schemas";

vi.mock("server-only", () => ({}));
const { runCloseStaleBookings } = await import("@/lib/jobs/stale-bookings");

const ID = "22222222-2222-4222-8222-222222222222";

describe("booking hours form", () => {
  const base = { branchId: ID, serviceId: ID, weekdays: ["1", "2"], start: "09:00", end: "12:00", slotMinutes: "30", capacity: "1" };
  it("accepts weekly hours", () => {
    const r = ruleFormSchema.safeParse(base);
    expect(r.success && r.data.weekdays).toEqual([1, 2]);
  });
  it("needs a day, closing after opening, and sensible slots", () => {
    expect(ruleFormSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...base, end: "08:00" }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...base, slotMinutes: "2" }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...base, capacity: "0" }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...base, weekdays: ["7"] }).success).toBe(false);
  });
});

describe("closed days", () => {
  it("closes a whole day, or needs replacement hours", () => {
    expect(exceptionFormSchema.safeParse({ branchId: ID, date: "2026-12-25", closed: true }).success).toBe(true);
    expect(exceptionFormSchema.safeParse({ branchId: ID, date: "2026-12-25", closed: false }).success).toBe(false);
    expect(exceptionFormSchema.safeParse({ branchId: ID, date: "2026-12-25", closed: false, start: "10:00", end: "09:00" }).success).toBe(
      false,
    );
    expect(exceptionFormSchema.safeParse({ branchId: ID, date: "25/12", closed: true }).success).toBe(false);
  });
});

describe("booking request", () => {
  it("needs a real slot time and a request id", () => {
    const base = { branchId: ID, serviceId: ID, startsAt: "2026-11-21T10:00:00+00:00", requestId: ID };
    expect(requestFormSchema.safeParse(base).success).toBe(true);
    expect(requestFormSchema.safeParse({ ...base, startsAt: "tomorrow" }).success).toBe(false);
    expect(requestFormSchema.safeParse({ ...base, note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("booking labels", () => {
  it("shows Ghana times", () => {
    expect(formatBookingTime("2026-11-21T10:00:00+00:00")).toBe("Sat 21 Nov, 10:00");
    expect(formatSlotTime("2026-11-21T10:30:00Z")).toBe("10:30");
    expect(dayLabel("2026-11-21")).toBe("Sat 21 Nov");
    expect(nextDays(new Date("2026-11-30T23:00:00Z"), 3)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  it("knows open bookings and when the shop can mark them", () => {
    expect(isOpen("reschedule_requested")).toBe(true);
    expect(isOpen("expired")).toBe(false);
    const now = Date.parse("2026-11-21T10:20:00Z");
    expect(markWindow("2026-11-21T10:00:00Z", now)).toEqual({ done: true, noShow: false });
    expect(markWindow("2026-11-21T09:30:00Z", now)).toEqual({ done: true, noShow: true });
    expect(markWindow("2026-11-21T11:00:00Z", now)).toEqual({ done: false, noShow: false });
  });
  it("explains database refusals", () => {
    expect(bookingErrorMessage("ERROR: slot_unavailable")).toBe("That time was just taken. Choose another.");
    expect(bookingErrorMessage("not_found")).toBe("This isn't available to you.");
    expect(bookingErrorMessage("weird")).toBe("Something went wrong. Try again.");
  });
});

describe("stale bookings job", () => {
  it("reports how many it closed, and never throws", async () => {
    const ok = { rpc: async () => ({ data: 3, error: null }) } as unknown as SupabaseClient;
    await expect(runCloseStaleBookings({ client: () => ok })).resolves.toEqual({ closed: 3 });
    const bad = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as unknown as SupabaseClient;
    await expect(runCloseStaleBookings({ client: () => bad })).resolves.toMatchObject({
      closed: 0,
      error: expect.stringContaining("boom"),
    });
    await expect(
      runCloseStaleBookings({
        client: () => {
          throw new Error("no key");
        },
      }),
    ).resolves.toMatchObject({ error: "no key" });
  });
});

describe("event reminders job", async () => {
  const { runEventReminders } = await import("@/lib/jobs/event-reminders");
  it("reports what it queued, and never throws", async () => {
    const ok = { rpc: async () => ({ data: 4, error: null }) } as unknown as SupabaseClient;
    await expect(runEventReminders({ client: () => ok })).resolves.toEqual({ queued: 4 });
    const bad = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as unknown as SupabaseClient;
    await expect(runEventReminders({ client: () => bad })).resolves.toMatchObject({ queued: 0, error: expect.stringContaining("boom") });
  });
});
