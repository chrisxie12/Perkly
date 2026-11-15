import { NextResponse, type NextRequest } from "next/server";
import { confirmPaystackPayment } from "@/features/billing/confirm";

/** Paystack sends the payer back here with ?reference=. We check with Paystack before recording anything. */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref") ?? "";
  let outcome = "failed";
  try {
    outcome = await confirmPaystackPayment(reference);
  } catch (error) {
    console.error("[billing] return verification failed", error instanceof Error ? error.message : "unknown");
    outcome = "pending";
  }
  const shown = outcome === "already_confirmed" ? "confirmed" : outcome;
  return NextResponse.redirect(new URL(`/merchant/billing?payment=${shown}`, request.nextUrl.origin), 303);
}
