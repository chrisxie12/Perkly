import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Paystack, for merchant subscriptions (D18). Only the server talks to
 * Paystack, with the secret key; the browser is sent to Paystack's hosted
 * checkout and comes back to /merchant/billing/return.
 * https://paystack.com/docs/api/transaction/
 */

const API = "https://api.paystack.co";

export class PaystackError extends Error {}

async function call<T>(secretKey: string, path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json().catch(() => null);
  const parsed = z.object({ status: z.boolean(), message: z.string().optional(), data: z.unknown() }).safeParse(body);
  if (!response.ok || !parsed.success || !parsed.data.status) {
    throw new PaystackError(`Paystack ${path.split("?")[0]} failed (${response.status})`);
  }
  const data = schema.safeParse(parsed.data.data);
  if (!data.success) throw new PaystackError(`Paystack ${path.split("?")[0]} returned an unexpected shape`);
  return data.data;
}

export async function initializeTransaction(
  secretKey: string,
  input: { email: string; amountPesewas: number; reference: string; callbackUrl: string; merchantId: string },
) {
  return call(
    secretKey,
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountPesewas,
        currency: "GHS",
        reference: input.reference,
        callback_url: input.callbackUrl,
        channels: ["mobile_money", "card"],
        metadata: { merchant_id: input.merchantId, purpose: "perqly_subscription" },
      }),
    },
    z.object({ authorization_url: z.url().startsWith("https://"), reference: z.string() }),
  );
}

export const verifiedTransactionSchema = z.object({
  status: z.string(),
  reference: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  id: z.union([z.number(), z.string()]).transform(String),
  channel: z.string().nullable().optional(),
});
export type VerifiedTransaction = z.infer<typeof verifiedTransactionSchema>;

export async function verifyTransaction(secretKey: string, reference: string): Promise<VerifiedTransaction> {
  if (!/^PQ-[A-Za-z0-9-]{8,60}$/.test(reference)) throw new PaystackError("Not a Perqly reference");
  return call(secretKey, `/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" }, verifiedTransactionSchema);
}

/** Paystack signs each webhook body with HMAC-SHA512 of the secret key. */
export function isValidWebhookSignature(secretKey: string, rawBody: string, signature: string | null): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
