"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSiteUrl, hasSupabaseEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { initializeTransaction } from "@/lib/payments/paystack";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";

export type PayState = { status: "idle" | "error"; message?: string };

const MESSAGES: Record<string, string> = {
  billing_off: "Perqly is free for now. There's nothing to pay.",
  forbidden: "Only the owner or a manager can pay for this business.",
  merchant_not_approved: "Your business needs to be approved before you can pay.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
};

/** Starts a monthly payment and sends the owner or manager to Paystack's checkout. */
export async function startMerchantPayment(_prev: PayState, formData: FormData): Promise<PayState> {
  const merchantId = z.uuid().safeParse(formData.get("merchantId"));
  if (!merchantId.success) return { status: "error", message: "Something went wrong. Refresh and try again." };
  const env = getServerEnv();
  if (!hasSupabaseEnv() || !env.PAYSTACK_SECRET_KEY) {
    return { status: "error", message: "Online payment isn't set up yet. Contact Perqly to pay another way." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_merchant_payment", { p_merchant_id: merchantId.data });
  if (error) return { status: "error", message: MESSAGES[error.message] ?? "Couldn't start the payment. Try again." };
  const row = z.object({ reference: z.string(), amount_pesewas: z.number().int().positive(), email: z.email() }).safeParse(data?.[0]);
  if (!row.success) return { status: "error", message: "Your account needs an email address to pay online." };

  let url: string;
  try {
    const tx = await initializeTransaction(env.PAYSTACK_SECRET_KEY, {
      email: row.data.email,
      amountPesewas: row.data.amount_pesewas,
      reference: row.data.reference,
      callbackUrl: `${getSiteUrl().replace(/\/$/, "")}/merchant/billing/return`,
      merchantId: merchantId.data,
    });
    url = tx.authorization_url;
  } catch {
    return { status: "error", message: "Paystack didn't respond. Check your connection and try again." };
  }
  redirect(url);
}

// Admin ---------------------------------------------------------------------------

const ADMIN_MESSAGES: Record<string, string> = {
  forbidden: "Only super admins change billing. Make sure you signed in with two-factor.",
  billing_fee_required: "Set a monthly fee before switching billing on.",
  billing_settings_invalid: "Check the numbers: fee up to GH₵100,000, free days 0–365, grace days 0–60.",
  payment_invalid: "Enter 1 to 12 months and an amount above zero.",
};

const billingSettingsSchema = z.object({
  enabled: z.boolean(),
  feeGhs: z.coerce.number().min(0).max(100000),
  trialDays: z.coerce.number().int().min(0).max(365),
  graceDays: z.coerce.number().int().min(0).max(60),
});

export async function saveBillingSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = billingSettingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    feeGhs: formData.get("feeGhs"),
    trialDays: formData.get("trialDays"),
    graceDays: formData.get("graceDays"),
  });
  if (!parsed.success) return { status: "error", message: ADMIN_MESSAGES.billing_settings_invalid };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_billing", {
    p_enabled: parsed.data.enabled,
    p_fee_ghs: parsed.data.feeGhs,
    p_trial_days: parsed.data.trialDays,
    p_grace_days: parsed.data.graceDays,
  });
  if (error) return { status: "error", message: ADMIN_MESSAGES[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/settings");
  return {
    status: "success",
    message: parsed.data.enabled ? "Saved. Billing is on." : "Saved. Billing is off: businesses use Perqly free.",
  };
}

const manualPaymentSchema = z.object({
  merchantId: z.uuid(),
  months: z.coerce.number().int().min(1).max(12),
  amountGhs: z.coerce.number().positive().max(100000),
  note: z.string().trim().max(300).optional(),
});

export async function recordManualPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: ADMIN_MESSAGES.payment_invalid };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  deliverNotificationsSoon();
  const { error } = await supabase.rpc("admin_record_manual_payment", {
    p_merchant_id: parsed.data.merchantId,
    p_months: parsed.data.months,
    p_amount_ghs: parsed.data.amountGhs,
    p_note: parsed.data.note ?? "",
  });
  if (error) return { status: "error", message: ADMIN_MESSAGES[error.message] ?? "Couldn't record the payment. Try again." };
  revalidatePath(`/admin/merchants/${parsed.data.merchantId}`);
  return { status: "success", message: "Payment recorded. The business has been told." };
}
