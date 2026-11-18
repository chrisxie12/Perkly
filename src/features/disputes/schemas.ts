import { z } from "zod";

// Problem reports about a redemption or a booking.

export const STUDENT_REASONS = {
  wrong_price: "I was charged the wrong price",
  discount_refused: "The shop refused the discount",
  charged_twice: "I was charged twice",
  service_not_received: "I didn't get the service or item",
  staff_behaviour: "How I was treated",
  booking_problem: "A problem with a booking",
  other: "Something else",
} as const;

export const MERCHANT_REASONS = {
  not_a_student: "The person wasn't the student on the pass",
  wrong_item: "The wrong deal was used",
  left_without_paying: "The student left without paying",
  booking_problem: "A problem with a booking",
  other: "Something else",
} as const;

export const REASON_LABEL: Record<string, string> = { ...STUDENT_REASONS, ...MERCHANT_REASONS };

export const STATUS_LABEL: Record<string, string> = {
  open: "Sent to Perqly",
  investigating: "Being looked into",
  resolved: "Resolved",
  dismissed: "Closed",
};

export const disputeSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  reason: z.string(),
  details: z.string(),
  opened_by_party: z.string(),
  resolution: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  merchant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  redemption: z
    .object({
      id: z.string(),
      transaction_ref: z.string(),
      item_name: z.string(),
      regular_price: z.coerce.number(),
      final_price: z.coerce.number(),
      discount_amount: z.coerce.number(),
      redeemed_at: z.string(),
      voided: z.boolean(),
    })
    .nullable(),
  booking: z.object({ id: z.string(), starts_at: z.string(), status: z.string(), service: z.string().nullable() }).nullable(),
  opened_by_name: z.string().nullable().optional(),
  assigned_to_name: z.string().nullable().optional(),
  events: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        body: z.string().nullable(),
        status: z.string().nullable(),
        actor_party: z.string(),
        mine: z.boolean().nullable(),
        created_at: z.string(),
      }),
    )
    .catch([]),
});
export type Dispute = z.infer<typeof disputeSchema>;

export const disputeRowSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  reason: z.string(),
  opened_by_party: z.string(),
  merchant_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  has_redemption: z.boolean(),
  has_booking: z.boolean(),
});
export type DisputeRow = z.infer<typeof disputeRowSchema>;

const UUID = z.uuid({ error: "Reload the page and try again." });

export const openFormSchema = z
  .object({
    redemptionId: UUID.optional(),
    bookingId: UUID.optional(),
    reason: z.string({ error: "Choose what went wrong." }).min(1, "Choose what went wrong."),
    details: z
      .string({ error: "Tell us what happened." })
      .trim()
      .min(10, "Tell us a bit more (at least 10 characters).")
      .max(2000, "Keep it under 2,000 characters."),
  })
  .refine((d) => Boolean(d.redemptionId) !== Boolean(d.bookingId), { path: ["reason"], message: "Reload the page and try again." });

export const noteSchema = z.object({
  disputeId: UUID,
  body: z.string({ error: "Write a note." }).trim().min(1, "Write a note.").max(2000, "Keep it under 2,000 characters."),
});

const MESSAGES: Record<string, string> = {
  dispute_already_open: "You already reported this. Add a note to the open report instead.",
  details_invalid: "Tell us a bit more (at least 10 characters).",
  reason_invalid: "Choose one of the reasons listed.",
  subject_required: "Reload the page and try again.",
  dispute_closed: "This report is closed. Report a new problem if something else happened.",
  resolution_required: "Write what was decided (at least 5 characters).",
  note_invalid: "Write a note under 2,000 characters.",
  rate_limited: "Too many reports. Try again later.",
  forbidden: "You can't do that here.",
  not_found: "This isn't available to you.",
};

export function disputeErrorMessage(raw: string | undefined | null): string {
  const text = raw ?? "";
  const code = Object.keys(MESSAGES)
    .filter((k) => text.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return code ? MESSAGES[code] : "Something went wrong. Try again.";
}

export const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(iso),
  );
