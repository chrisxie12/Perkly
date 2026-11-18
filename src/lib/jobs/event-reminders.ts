import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Campus event reminders (C4). Runs after the daily cron has answered (next/server
 * `after`), like the other Campus job, so it can't change what the cron returned.
 * The database queues one reminder per RSVP for events 22 to 46 hours away, and does
 * nothing while Campus is off. Never throws.
 */
export async function runEventReminders(deps: { client?: () => SupabaseClient } = {}): Promise<{ queued: number; error?: string }> {
  try {
    const admin = (deps.client ?? createAdminClient)();
    const { data, error } = await admin.rpc("queue_event_reminders");
    if (error) return { queued: 0, error: `queue_event_reminders: ${error.message}` };
    return { queued: (data as number | null) ?? 0 };
  } catch (e) {
    return { queued: 0, error: e instanceof Error ? e.message : "queue_event_reminders failed" };
  }
}
