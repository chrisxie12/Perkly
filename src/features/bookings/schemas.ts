import { z } from "zod";

// Bookings (product spec §6). Times are Ghana time, which is UTC all year.

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for the shop",
  confirmed: "Confirmed",
  reschedule_requested: "New time proposed",
  cancelled: "Cancelled",
  completed: "Done",
  no_show: "Missed",
  expired: "Not answered in time",
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const bookingSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  proposed_starts_at: z.string().nullable(),
  proposed_ends_at: z.string().nullable(),
  student_note: z.string().nullable(),
  merchant_note: z.string().nullable(),
  cancelled_by_party: z.string().nullable(),
  cancel_reason: z.string().nullable(),
  merchant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  branch: z.object({ id: z.string(), name: z.string(), area: z.string().nullable() }),
  service: z.object({ id: z.string(), name: z.string(), duration_minutes: z.number().nullable() }),
  offer: z.object({ id: z.string(), title: z.string().nullable() }).nullable(),
  redeemed: z.boolean(),
  created_at: z.string(),
  student_name: z.string().optional(),
});
export type Booking = z.infer<typeof bookingSchema>;

export const bookableServiceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  duration_minutes: z.number().nullable(),
  regular_price: z.coerce.number(),
  branches: z.array(z.object({ id: z.uuid(), name: z.string(), area: z.string().nullable() })).catch([]),
});
export type BookableService = z.infer<typeof bookableServiceSchema>;

export const slotSchema = z.object({ starts_at: z.string(), ends_at: z.string(), places_left: z.number() });
export type Slot = z.infer<typeof slotSchema>;

export const setupSchema = z.object({
  services: z.array(z.object({ id: z.string(), name: z.string(), duration_minutes: z.number().nullable(), is_bookable: z.boolean() })),
  branches: z.array(z.object({ id: z.string(), name: z.string() })),
  rules: z.array(
    z.object({
      id: z.string(),
      branch_id: z.string(),
      service_id: z.string(),
      weekday: z.number(),
      start_time: z.string(),
      end_time: z.string(),
      slot_minutes: z.number(),
      capacity: z.number(),
      is_active: z.boolean(),
    }),
  ),
  exceptions: z.array(
    z.object({
      id: z.string(),
      branch_id: z.string(),
      service_id: z.string().nullable(),
      date: z.string(),
      is_closed: z.boolean(),
      start_time: z.string().nullable(),
      end_time: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
});
export type BookingSetup = z.infer<typeof setupSchema>;

const UUID = z.uuid({ error: "Reload the page and try again." });
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const ruleFormSchema = z
  .object({
    ruleId: UUID.optional(),
    branchId: UUID,
    serviceId: UUID,
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Choose at least one day."),
    start: z.string().regex(TIME, "Choose an opening time."),
    end: z.string().regex(TIME, "Choose a closing time."),
    slotMinutes: z.coerce.number().int("Use whole minutes.").min(5, "At least 5 minutes.").max(480, "At most 8 hours."),
    capacity: z.coerce.number().int("Use a whole number.").min(1, "At least 1.").max(50, "At most 50."),
  })
  .refine((d) => d.end > d.start, { path: ["end"], message: "Closing must be after opening." });

export const exceptionFormSchema = z
  .object({
    branchId: UUID,
    serviceId: UUID.optional(),
    date: z.string().regex(DAY, "Choose a date."),
    closed: z.boolean(),
    start: z.string().regex(TIME).optional(),
    end: z.string().regex(TIME).optional(),
    reason: z.string().trim().max(200, "Keep the reason under 200 characters.").optional(),
  })
  .superRefine((d, ctx) => {
    if (d.closed) return;
    if (!d.start) ctx.addIssue({ code: "custom", path: ["start"], message: "Choose the opening time for that day." });
    if (!d.end) ctx.addIssue({ code: "custom", path: ["end"], message: "Choose the closing time for that day." });
    if (d.start && d.end && d.end <= d.start) ctx.addIssue({ code: "custom", path: ["end"], message: "Closing must be after opening." });
  });

export const requestFormSchema = z.object({
  branchId: UUID,
  serviceId: UUID,
  startsAt: z.iso.datetime({ offset: true, error: "Choose a time." }),
  offerId: UUID.optional(),
  note: z.string().trim().max(500, "Keep your note under 500 characters.").optional(),
  requestId: UUID,
});

const MESSAGES: Record<string, string> = {
  not_verified: "Verify your student status to book.",
  verification_expired: "Your verification has expired. Renew it to book.",
  account_suspended: "Your account is suspended.",
  not_bookable: "This service can't be booked online here.",
  slot_unavailable: "That time was just taken. Choose another.",
  too_many_bookings: "You already have the most open bookings allowed. Wait for one to finish or cancel one.",
  offer_not_available: "That deal can't be used for this booking.",
  booking_not_open: "This booking can't be changed any more.",
  too_early: "It's too early to mark this booking.",
  hours_invalid: "Check the hours: closing must be after opening, and slots at least 5 minutes.",
  date_invalid: "Choose a date within the next year.",
  note_too_long: "Keep notes under 500 characters.",
  rate_limited: "Too many requests. Try again later.",
  forbidden: "Only owners and managers can do this.",
  not_found: "This isn't available to you.",
  service_not_found: "This service isn't available.",
};

export function bookingErrorMessage(raw: string | undefined | null): string {
  const text = raw ?? "";
  const code = Object.keys(MESSAGES)
    .filter((k) => text.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return code ? MESSAGES[code] : "Something went wrong. Try again.";
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** "Sat 21 Nov, 10:00" in Ghana time. */
export function formatBookingTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

export function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

/** The next `count` days from `from` (YYYY-MM-DD, Ghana time). */
export function nextDays(from: Date, count: number): string[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : dayFmt.format(d);
}

/** Open bookings a student can still act on. */
export function isOpen(status: string): boolean {
  return status === "pending" || status === "confirmed" || status === "reschedule_requested";
}

/** Whether the shop can mark a confirmed booking done (from its start) or missed (30 minutes after). */
export function markWindow(startsAt: string, now: number = Date.now()): { done: boolean; noShow: boolean } {
  const start = Date.parse(startsAt);
  return { done: start <= now, noShow: start + 30 * 60 * 1000 <= now };
}
