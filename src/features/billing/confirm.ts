import "server-only";
import { getServerEnv } from "@/lib/env.server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { verifyTransaction } from "@/lib/payments/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConfirmOutcome = "confirmed" | "already_confirmed" | "mismatch" | "failed" | "pending" | "unavailable";

/**
 * Asks Paystack itself whether a payment went through, then records it.
 * Used by both the return page and the webhook, so a payment counts once
 * whichever arrives first; the database ignores a second confirmation.
 */
export async function confirmPaystackPayment(reference: string): Promise<ConfirmOutcome> {
  const env = getServerEnv();
  if (!env.PAYSTACK_SECRET_KEY || !env.SUPABASE_SECRET_KEY) return "unavailable";

  const tx = await verifyTransaction(env.PAYSTACK_SECRET_KEY, reference);
  const admin = createAdminClient();

  if (tx.status !== "success") {
    if (tx.status === "failed" || tx.status === "abandoned") {
      await admin.rpc("close_merchant_payment", { p_reference: reference, p_status: tx.status });
      return "failed";
    }
    return "pending";
  }

  const { data, error } = await admin.rpc("confirm_merchant_payment", {
    p_reference: reference,
    p_amount_pesewas: tx.amount,
    p_currency: tx.currency,
    p_transaction_id: tx.id,
    p_channel: tx.channel ?? "unknown",
  });
  if (error) throw new Error(`confirm_merchant_payment failed: ${error.message}`);
  // The "payment received" notice goes out now rather than at the next delivery run.
  await dispatchNotifications(50).catch(() => undefined);
  return data as ConfirmOutcome;
}
