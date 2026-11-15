import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { isAuthorisedCronRequest } from "@/lib/jobs/cron-auth";
import { purgeVerificationDocuments } from "@/lib/jobs/verification-retention";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

export const maxDuration = 60;

/**
 * Daily housekeeping, called by Vercel Cron (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`:
 * 1. mark lapsed student verifications as expired;
 * 2. mark offers past their end date as ended, and stale redemption sessions as expired;
 * 3. delete verification photos 30 days after a decision;
 * 4. remind students whose verification ends within 14 days, and send pending notifications.
 * Students never see an ended offer even before this runs: the read
 * functions check the dates themselves.
 */
export async function GET(request: NextRequest) {
  // Read the request first: this keeps the route out of the build-time prerender,
  // so a mistyped secret in Vercel can only break this job, never the deploy.
  const authorization = request.headers.get("authorization");
  const env = getServerEnv();
  if (!isAuthorisedCronRequest(authorization, env.CRON_SECRET)) {
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
  const sessions = await admin.rpc("expire_redemption_sessions");
  if (sessions.error) console.error("[cron] expire_redemption_sessions failed", sessions.error.message);
  const reminders = await admin.rpc("notify_expiring_verifications");
  const billing = await admin.rpc("run_billing_cycle");
  if (billing.error) console.error("[cron] run_billing_cycle failed", billing.error.message);
  if (reminders.error) console.error("[cron] notify_expiring_verifications failed", reminders.error.message);
  // Expiry notices and reminders go out now; anything an earlier delivery missed is retried too.
  const notifications = await dispatchNotifications(500).catch(() => ({ delivered: 0 }));

  try {
    const documents = await purgeVerificationDocuments(admin);
    if (documents.failed > 0) console.error(`[cron] ${documents.failed} verification folders could not be cleared; retrying tomorrow`);
    return NextResponse.json(
      {
        expired: expired.data ?? 0,
        offersEnded: offers.data ?? 0,
        sessionsExpired: sessions.data ?? 0,
        reminders: reminders.data ?? 0,
        billing: billing.data ?? null,
        notificationsDelivered: notifications.delivered,
        documents,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[cron] document retention failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "retention_failed" }, { status: 500 });
  }
}
