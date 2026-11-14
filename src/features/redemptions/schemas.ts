import { money } from "@/features/offers/schemas";

export type SessionStatus = "open" | "awaiting_merchant" | "awaiting_student" | "completed" | "rejected" | "cancelled" | "expired";
export const LIVE_STATUSES: SessionStatus[] = ["open", "awaiting_merchant", "awaiting_student"];

export const REJECT_REASONS = {
  not_this_student: "This isn't the student on the pass",
  item_not_purchased: "The student didn't buy this",
  wrong_item: "The wrong item was selected",
  offer_not_honoured_today: "We can't honour this offer today",
  other: "Something else",
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;

export const PAYMENT_METHODS = {
  mtn_momo: "MTN MoMo",
  telecel_cash: "Telecel Cash",
  at_money: "AT Money",
  cash: "Cash",
  card: "Card",
  other: "Other",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

const TOKEN = /^[A-Za-z0-9_-]{22}$/;
export const SHORT_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Normalises a typed short code: upper case, no spaces or dashes, and the Crockford look-alikes. */
export function normaliseShortCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}

/**
 * Returns the token from a scanned Perqly link, or null. Only `/r/<22 chars>`
 * links on this site (or the configured site) are accepted.
 */
export function tokenFromScan(raw: string, allowedOrigins: string[]): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!allowedOrigins.includes(url.origin)) return null;
  const match = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  return match && TOKEN.test(match[1]) ? match[1] : null;
}

export function isToken(value: string) {
  return TOKEN.test(value);
}

/** The pass's colour of the day, the same for everyone on an Accra calendar day. */
const DAY_COLOURS = ["#2563EB", "#DB2777", "#059669", "#D97706", "#7C3AED", "#DC2626", "#0891B2"] as const;
export function colourOfDay(date = new Date()) {
  const day = Math.floor(date.getTime() / 86_400_000); // Accra is UTC+0 all year.
  return DAY_COLOURS[((day % 7) + 7) % 7];
}

type LimitDetail = { limit?: number; period?: string; resets_at?: string | null };

/** Student-facing messages from the spec (section 9). */
export function redemptionErrorMessage(code: string | undefined, detail: LimitDetail & { merchant_name?: string } = {}): string {
  switch (code) {
    case "not_verified":
      return "Your school needs to verify you before you can redeem discounts.";
    case "verification_expired":
      return "Your verification has expired. Verify again to keep redeeming.";
    case "account_suspended":
      return "Your account is suspended. Contact Perqly support.";
    case "institution_inactive":
      return "Your school isn't taking part in Perqly right now.";
    case "qr_invalid":
      return "This code isn't active. Ask the shop for their current Perqly code.";
    case "merchant_unavailable":
      return "This business isn't taking Perqly discounts right now.";
    case "no_eligible_offers":
      return "There are no student discounts you can use here right now.";
    case "session_in_progress":
      return `You have another redemption open${detail.merchant_name ? ` at ${detail.merchant_name}` : ""}. Finish or cancel it first.`;
    case "limit_reached": {
      const times = detail.limit === 1 ? "once" : `${detail.limit ?? "the maximum"} times`;
      const when = detail.period && detail.period !== "offer_lifetime" ? ` this ${detail.period}` : "";
      const reset = detail.resets_at
        ? ` It resets on ${new Date(detail.resets_at).toLocaleDateString("en-GH", { day: "numeric", month: "long" })}.`
        : "";
      return `You've used this discount ${times}${when}.${reset}`;
    }
    case "offer_unavailable":
      return "This discount isn't available any more.";
    case "session_expired":
      return "This redemption timed out. Scan the code again to start over.";
    case "session_changed":
      return "The student changed their item. Check the updated details.";
    case "already_confirmed":
      return "Another staff member already confirmed this one.";
    case "awaiting_merchant":
      return "Wait for the cashier to confirm first.";
    case "session_locked":
      return "This redemption can't be changed now.";
    case "rate_limited":
      return "Too many attempts. Wait a minute and try again.";
    case "reason_required":
      return "Choose a reason, and add a note for “Something else”.";
    case "forbidden":
      return "You don't have permission to do that.";
    case "session_not_found":
      return "We couldn't find that redemption.";
    case "payment_window_closed":
      return "Payment can only be recorded within 7 days.";
    case "redemption_voided":
      return "This redemption was cancelled by Perqly support.";
    case "merchant_not_approved":
      return "Your business must be live first.";
    default:
      return "Something went wrong. Try again.";
  }
}

export function payLine(finalPrice: number, item: string) {
  return `Confirm you're paying ${money(finalPrice)} for ${item}.`;
}
