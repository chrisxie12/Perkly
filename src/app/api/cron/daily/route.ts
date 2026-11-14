import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { isAuthorisedCronRequest } from "@/lib/jobs/cron-auth";
import { purgeVerificationDocuments } from "@/lib/jobs/verification-retention";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Daily housekeeping, called by Vercel Cron (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`:
 * 1. mark lapsed student verifications as expired;
 * 2. mark offers past their end date as ended;
 * 3. delete verification photos 30 days after a decision.
 * Students never see an ended offer even before this runs: the read
 * functions check the dates themselves.
 */
export async function GET(request: NextRequest) {
  const env = getServerEnv();
  if (!isAuthorisedCronRequest(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!hasSupabaseEnv() || !env.SUPABASE_SECRET_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const expired = await admin.rpc("expire_student_verifications");
  if (expired.error) {
    console.error("[cron] expire_student_verifications failed", expired.error.message);
    return NextResponse.json({ error: "expire_failed" }, { status: 500 });
  }

  const offers = await admin.rpc("expire_offers");
  if (offers.error) console.error("[cron] expire_offers failed", offers.error.message);

  try {
    const documents = await purgeVerificationDocuments(admin);
    if (documents.failed > 0) console.error(`[cron] ${documents.failed} verification folders could not be cleared; retrying tomorrow`);
    return NextResponse.json({ expired: expired.data ?? 0, offersEnded: offers.data ?? 0, documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cron] document retention failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "retention_failed" }, { status: 500 });
  }
}
