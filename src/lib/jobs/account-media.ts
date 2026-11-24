import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Account deletion clean-up, run by the daily cron after it has answered.
 *
 *   1. reminds admins about deletion requests open for 20 days (once each), and deletes
 *      friend-chat messages that have disappeared (queueing their photos);
 *   2. claims files queued by admin_complete_account_deletion (row-locked);
 *   3. removes them from their bucket, then marks them.
 * A failed file is retried on the next run, up to 7 times. It never throws and
 * stops itself after 20 seconds or 200 files.
 */

export const ACCOUNT_MEDIA_LIMITS = { files: 200, seconds: 20, batch: 50 } as const;

export type AccountMediaResult = {
  reminded: number;
  chatMessages: number;
  removed: number;
  failed: number;
  stoppedEarly: boolean;
  error?: string;
};

type Deps = { client?: () => SupabaseClient; now?: () => number; dispatch?: () => Promise<unknown> };
type Claimed = { bucket: string; path: string };

export function groupByBucket(rows: Claimed[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (typeof row?.bucket !== "string" || typeof row?.path !== "string") continue;
    groups.set(row.bucket, [...(groups.get(row.bucket) ?? []), row.path]);
  }
  return groups;
}

export async function runAccountMediaCleanup(deps: Deps = {}): Promise<AccountMediaResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const result: AccountMediaResult = { reminded: 0, chatMessages: 0, removed: 0, failed: 0, stoppedEarly: false };
  const outOfTime = () => now() - started > ACCOUNT_MEDIA_LIMITS.seconds * 1000;
  try {
    const admin = (deps.client ?? createAdminClient)();
    const reminders = await admin.rpc("remind_overdue_account_deletions");
    if (reminders.error) console.error("[account-media] remind_overdue_account_deletions failed", reminders.error.message);
    else result.reminded = (reminders.data as number | null) ?? 0;
    // The cron sent its notifications before this ran, so send the reminders now.
    if (result.reminded > 0) await (deps.dispatch ?? (() => dispatchNotifications(50)))().catch(() => undefined);

    // Friend-chat messages past their time are deleted, and their photos join the queue below.
    const chats = await admin.rpc("purge_expired_friend_messages");
    if (chats.error) console.error("[account-media] purge_expired_friend_messages failed", chats.error.message);
    else result.chatMessages = (chats.data as number | null) ?? 0;

    let handled = 0;
    while (handled < ACCOUNT_MEDIA_LIMITS.files) {
      if (outOfTime()) {
        result.stoppedEarly = true;
        break;
      }
      const claim = await admin.rpc("claim_account_media_due", {
        p_limit: Math.min(ACCOUNT_MEDIA_LIMITS.batch, ACCOUNT_MEDIA_LIMITS.files - handled),
      });
      if (claim.error) throw new Error(`claim_account_media_due: ${claim.error.message}`);
      const rows = (claim.data ?? []) as Claimed[];
      if (rows.length === 0) break;
      handled += rows.length;
      for (const [bucket, paths] of groupByBucket(rows)) {
        const removal = await admin.storage.from(bucket).remove(paths);
        if (removal.error) {
          result.failed += paths.length;
          for (const path of paths)
            await admin.rpc("mark_account_media_failed", { p_bucket: bucket, p_path: path, p_error: removal.error.message.slice(0, 200) });
          continue;
        }
        // A file that was already gone counts as removed: Storage reports no error for it.
        const marked = await admin.rpc("mark_account_media_purged", { p_bucket: bucket, p_paths: paths });
        if (marked.error) throw new Error(`mark_account_media_purged: ${marked.error.message}`);
        result.removed += (marked.data as number | null) ?? 0;
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message.slice(0, 200) : "unknown";
  }
  if (result.error || result.failed > 0) {
    console.error(`[account-media] removed ${result.removed}, failed ${result.failed}${result.error ? `, error: ${result.error}` : ""}`);
  }
  return result;
}
