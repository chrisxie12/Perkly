import "server-only";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const paymentSchema = z.object({
  reference: z.string(),
  method: z.enum(["paystack", "manual"]),
  amount_pesewas: z.number().int(),
  months: z.number().int(),
  status: z.enum(["pending", "success", "failed", "abandoned"]),
  channel: z.string().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  created_at: z.string(),
  paid_at: z.string().nullable(),
});

export const billingSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(["off", "none", "trial", "active", "due", "on_hold"]),
  monthly_fee_pesewas: z.number().int(),
  trial_days: z.number().int(),
  grace_days: z.number().int(),
  trial_ends_at: z.string().nullable(),
  paid_until: z.string().nullable(),
  covered_until: z.string().nullable(),
  hold_on: z.string().nullable(),
  payments: z.array(paymentSchema),
});
export type MerchantBilling = z.infer<typeof billingSchema> & { trial_ending_soon: boolean };
export type MerchantPayment = z.infer<typeof paymentSchema>;

export async function getMerchantBilling(merchantId: string): Promise<MerchantBilling | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_merchant_billing", { p_merchant_id: merchantId });
  if (error) return null;
  const parsed = billingSchema.safeParse(data);
  if (!parsed.success) return null;
  const endsIn = parsed.data.trial_ends_at ? new Date(parsed.data.trial_ends_at).getTime() - Date.now() : Infinity;
  return { ...parsed.data, trial_ending_soon: parsed.data.state === "trial" && endsIn < 7 * 86_400_000 };
}

export function formatGhs(pesewas: number) {
  return `GH₵${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: pesewas % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
