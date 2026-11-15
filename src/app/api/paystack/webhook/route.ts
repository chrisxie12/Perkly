import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { confirmPaystackPayment } from "@/features/billing/confirm";
import { getServerEnv } from "@/lib/env.server";
import { isValidWebhookSignature } from "@/lib/payments/paystack";

/**
 * Paystack webhook (set in Paystack → Settings → API Keys & Webhooks).
 * Signed with the secret key; even then we only trust what Paystack's own
 * verify endpoint says, so a replayed or forged body can't record a payment.
 */
export async function POST(request: NextRequest) {
  const secret = getServerEnv().PAYSTACK_SECRET_KEY;
  if (!secret) return new NextResponse(null, { status: 503 });

  const raw = await request.text();
  if (raw.length > 100_000 || !isValidWebhookSignature(secret, raw, request.headers.get("x-paystack-signature"))) {
    return new NextResponse(null, { status: 401 });
  }

  const event = z.object({ event: z.string(), data: z.object({ reference: z.string().optional() }).loose() }).safeParse(JSON.parse(raw));
  const reference = event.success ? event.data.data.reference : undefined;
  if (event.success && event.data.event === "charge.success" && reference?.startsWith("PQ-")) {
    try {
      await confirmPaystackPayment(reference);
    } catch (error) {
      console.error("[billing] webhook verification failed", error instanceof Error ? error.message : "unknown");
      // 500 makes Paystack retry later.
      return new NextResponse(null, { status: 500 });
    }
  }
  return new NextResponse(null, { status: 200 });
}
