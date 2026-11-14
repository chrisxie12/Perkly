import { z } from "zod";

export const money = (value: number | string | null | undefined) =>
  `GH₵${Number(value ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type DiscountType = "percentage" | "fixed_amount" | "fixed_price";
export type LimitPeriod = "day" | "week" | "month" | "offer_lifetime";

export function discountLabel(type: DiscountType, value: number | string) {
  const v = Number(value);
  if (type === "percentage") return `${Number.isInteger(v) ? v : v.toFixed(1)}% off`;
  if (type === "fixed_amount") return `${money(v)} off`;
  return `Student price ${money(v)}`;
}

export const PERIOD_LABEL: Record<LimitPeriod, string> = {
  day: "day",
  week: "week",
  month: "month",
  offer_lifetime: "while the offer runs",
};

export function limitLabel(limit: number, period: LimitPeriod) {
  const times = limit === 1 ? "Once" : `${limit} times`;
  return period === "offer_lifetime" ? `${times} while the offer runs` : `${times} a ${PERIOD_LABEL[period]}`;
}

/**
 * A preview of the server's price for the merchant's form. Display only: the
 * database's private.price_offer() is the only calculation that is recorded.
 * Rounds half away from zero, as numeric round() does.
 */
export function previewPrice(regular: number, type: DiscountType, value: number) {
  if (!(regular > 0) || !(value > 0)) return null;
  const round2 = (n: number) => (Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON)) / 100;
  const discount = type === "percentage" ? round2((regular * value) / 100) : type === "fixed_amount" ? value : round2(regular - value);
  if (!(discount > 0) || !(discount < regular)) return null;
  return { regular, discount, final: round2(regular - discount) };
}

export const OFFER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "In review",
  active: "Live",
  paused: "Paused",
  expired: "Ended",
  rejected: "Changes needed",
  archived: "Archived",
};

const optional = (schema: z.ZodString) => schema.optional();

export const catalogueItemSchema = z
  .object({
    merchantId: z.uuid(),
    itemId: z.uuid().optional(),
    kind: z.enum(["service", "product"], { error: "Choose service or product." }),
    name: z.string({ error: "Name the item." }).trim().min(2, "Name the item.").max(120),
    regularPrice: z.coerce.number({ error: "Enter the regular price." }).positive("Enter a price above zero.").max(999999),
    description: optional(z.string().max(1000)),
    durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
    sku: optional(z.string().max(60)),
    isActive: z.enum(["true", "false"]).default("true"),
  })
  .refine((v) => Math.round(v.regularPrice * 100) === v.regularPrice * 100, {
    path: ["regularPrice"],
    message: "Use at most 2 decimal places.",
  });

export const offerSchema = z
  .object({
    merchantId: z.uuid(),
    offerId: z.uuid().optional(),
    item: z.string({ error: "Choose the item." }).regex(/^(service|product):[0-9a-f-]{36}$/, "Choose the item."),
    discountType: z.enum(["percentage", "fixed_amount", "fixed_price"], { error: "Choose a discount type." }),
    discountValue: z.coerce.number({ error: "Enter the discount." }).positive("Enter the discount."),
    conditions: z
      .string({ error: "Tell students the conditions." })
      .trim()
      .min(3, "Tell students the conditions, for example Show your pass before paying.")
      .max(500),
    title: optional(z.string().min(3).max(80)),
    description: optional(z.string().max(1000)),
    startsAt: optional(z.string()),
    endsAt: optional(z.string()),
    perStudentLimit: z.coerce.number().int().min(1).max(100).default(1),
    perStudentPeriod: z.enum(["day", "week", "month", "offer_lifetime"]).default("month"),
    totalCap: z.coerce.number().int().min(1).optional(),
    institutionIds: z.array(z.uuid()).default([]),
    branchIds: z.array(z.uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "percentage" && (v.discountValue < 1 || v.discountValue > 90)) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Use a percentage from 1 to 90." });
    }
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." });
    }
  });

export function offerErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "You don't have permission to do that. Business owners need two-step verification.";
    case "merchant_suspended":
      return "This business is suspended, so it can't be changed.";
    case "merchant_not_approved":
      return "Your business must be live before offers can go live.";
    case "item_not_found":
      return "Choose one of your own catalogue items.";
    case "item_kind_invalid":
    case "item_invalid":
      return "Check the item details.";
    case "price_invalid":
      return "Enter a regular price above zero.";
    case "sku_in_use":
      return "Another product already uses that SKU.";
    case "discount_invalid":
      return "Use a percentage from 1 to 90.";
    case "discount_not_below_price":
      return "The discount must leave a price above zero, and a student price must be below the regular price.";
    case "dates_invalid":
      return "The end must be after the start.";
    case "branch_not_found":
      return "Choose your own branches.";
    case "institution_not_found":
      return "One of the chosen schools no longer exists.";
    case "offer_not_found":
      return "That offer no longer exists.";
    case "offer_not_editable":
      return "Pause the offer before changing it. Changes send it back for submission.";
    case "cap_below_used":
      return "The total limit can't be lower than the number already redeemed.";
    case "offer_invalid":
      return "Check the offer details.";
    case "invalid_transition":
      return "That change doesn't apply to the offer's current status.";
    case "reason_required":
      return "Give the business a reason they can act on.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}
