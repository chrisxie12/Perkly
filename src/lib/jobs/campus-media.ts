import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Campus media clean-up (decision record, clarification 2 and detail 3).
 *
 * Runs after the daily cron has already answered (next/server `after`), so it
 * can never change what the existing steps did or what the cron returned. It:
 *   1. queues uploads nothing has used for 24 hours;
 *   2. claims due files (row-locked, so two runs never take the same file);
 *   3. removes them from the campus-media bucket only, then marks them;
 *   4. clears the text of posts removed more than 30 days ago.
 * A failed file is retried a day later, up to 7 times. It never throws, stops
 * itself after 20 seconds or 200 files, and has nothing to do with notifications.
 */

const BUCKET = "campus-media";
export const CAMPUS_MEDIA_LIMITS = { files: 200, seconds: 20, batch: 50 } as const;

export type CampusMediaResult = { queued: number; removed: number; failed: number; cleared: number; stoppedEarly: boolean; error?: string };

type Deps = { client?: () => SupabaseClient; now?: () => number };

export async function runCampusMediaCleanup(deps: Deps = {}): Promise<CampusMediaResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const result: CampusMediaResult = { queued: 0, removed: 0, failed: 0, cleared: 0, stoppedEarly: false };
  const outOfTime = () => now() - started > CAMPUS_MEDIA_LIMITS.seconds * 1000;
  try {
    const admin = (deps.client ?? createAdminClient)();
    const orphans = await admin.rpc("queue_campus_media_orphans", { p_limit: CAMPUS_MEDIA_LIMITS.files });
    if (orphans.error) throw new Error(`queue_campus_media_orphans: ${orphans.error.message}`);
    result.queued = (orphans.data as number | null) ?? 0;

    let handled = 0;
    while (handled < CAMPUS_MEDIA_LIMITS.files) {
      if (outOfTime()) {
        result.stoppedEarly = true;
        break;
      }
      const claim = await admin.rpc("claim_campus_media_due", {
        p_limit: Math.min(CAMPUS_MEDIA_LIMITS.batch, CAMPUS_MEDIA_LIMITS.files - handled),
      });
      if (claim.error) throw new Error(`claim_campus_media_due: ${claim.error.message}`);
      const paths = ((claim.data ?? []) as string[]).filter((p) => typeof p === "string");
      if (paths.length === 0) break;
      handled += paths.length;
      const removal = await admin.storage.from(BUCKET).remove(paths);
      if (removal.error) {
        // Nothing was removed in this batch: each file is retried tomorrow.
        result.failed += paths.length;
        for (const path of paths)
          await admin.rpc("mark_campus_media_failed", { p_path: path, p_error: removal.error.message.slice(0, 200) });
        continue;
      }
      // A file that was already gone counts as removed: Storage reports no error for it.
      const marked = await admin.rpc("mark_campus_media_purged", { p_paths: paths });
      if (marked.error) throw new Error(`mark_campus_media_purged: ${marked.error.message}`);
      result.removed += (marked.data as number | null) ?? 0;
    }

    if (!outOfTime()) {
      const cleared = await admin.rpc("clear_removed_campus_posts");
      if (!cleared.error) result.cleared = (cleared.data as number | null) ?? 0;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message.slice(0, 200) : "unknown";
  }
  if (result.error || result.failed > 0) {
    console.error(
      `[campus-media] queued ${result.queued}, removed ${result.removed}, failed ${result.failed}${result.error ? `, error: ${result.error}` : ""}`,
    );
  }
  return result;
}
