import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { z } from "zod";
import { getSiteUrl, hasSupabaseEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import { sendEmail } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVapidPublicKey } from "./vapid";
import { buildNotificationEmail, buildPushPayload } from "./format";

const deliverySchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: z.string(),
  category: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  send_push: z.boolean(),
  send_email: z.boolean(),
  email: z.string().nullable(),
  subscriptions: z.array(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() })),
});
type Delivery = z.infer<typeof deliverySchema>;
type Outcome = "sent" | "failed" | "skipped";

/**
 * Sends the pending push and email notifications the database hands over.
 * Safe to call often: rows are claimed with SKIP LOCKED, so two runs never
 * send the same notification twice. Does nothing until the secret key is set.
 */
export async function dispatchNotifications(limit = 100): Promise<{ delivered: number }> {
  const env = getServerEnv();
  if (!hasSupabaseEnv() || !env.SUPABASE_SECRET_KEY) return { delivered: 0 };

  const publicKey = getVapidPublicKey();
  const pushReady = Boolean(publicKey && env.VAPID_PRIVATE_KEY);
  if (pushReady) webpush.setVapidDetails(env.VAPID_SUBJECT ?? "mailto:support@perqly.app", publicKey!, env.VAPID_PRIVATE_KEY!);
  const emailReady = Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
  const siteUrl = getSiteUrl();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_notification_deliveries", { p_limit: limit });
  if (error) {
    console.error("[notifications] claim failed", error.message);
    return { delivered: 0 };
  }
  const rows = z.array(deliverySchema).safeParse(data ?? []);
  if (!rows.success) {
    console.error("[notifications] unexpected delivery rows");
    return { delivered: 0 };
  }

  let delivered = 0;
  for (const row of rows.data) {
    const [push, email] = await Promise.all([
      row.send_push && pushReady ? sendPush(admin, row) : Promise.resolve<Outcome>("skipped"),
      row.send_email && emailReady && row.email ? sendNotificationEmail(row, siteUrl) : Promise.resolve<Outcome>("skipped"),
    ]);
    if (push === "sent" || email === "sent") delivered += 1;
    const { error: finishError } = await admin.rpc("finish_notification_delivery", { p_id: row.id, p_push: push, p_email: email });
    if (finishError) console.error("[notifications] could not record delivery", finishError.message);
  }
  return { delivered };
}

async function sendPush(admin: ReturnType<typeof createAdminClient>, row: Delivery): Promise<Outcome> {
  const payload = JSON.stringify(buildPushPayload(row));
  let sent = false;
  await Promise.all(
    row.subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: 60 * 60 * 24,
          urgency: row.category === "redemptions" ? "high" : "normal",
          topic: row.id.replaceAll("-", "").slice(0, 32),
        });
        sent = true;
        await admin.rpc("mark_push_endpoint_used", { p_endpoint: sub.endpoint });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the person turned notifications off or removed the app. Forget the device.
        if (status === 404 || status === 410) await admin.rpc("forget_push_endpoint", { p_endpoint: sub.endpoint });
        else console.error("[notifications] push failed", status ?? "network error");
      }
    }),
  );
  return sent ? "sent" : "failed";
}

async function sendNotificationEmail(row: Delivery, siteUrl: string): Promise<Outcome> {
  try {
    await sendEmail({ to: row.email!, ...buildNotificationEmail(row, siteUrl) });
    return "sent";
  } catch (error) {
    console.error("[notifications] email failed", error instanceof Error ? error.message : "unknown error");
    return "failed";
  }
}

/**
 * Call from any server action that may have created notifications. Delivery
 * runs after the response, so it never slows the action or undoes it.
 */
export function deliverNotificationsSoon() {
  after(() => dispatchNotifications().then(() => undefined));
}
