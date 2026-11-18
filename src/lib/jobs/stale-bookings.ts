import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cancels booking requests whose time passed without an answer (product spec §6),
 * as the "system". Runs after the daily cron has answered (next/server `after`), so
 * it can't change what the cron returned. Until it runs, students and shops already
 * see such requests as "not answered in time". Never throws.
 */
export async function runCloseStaleBookings(deps: { client?: () => SupabaseClient } = {}): Promise<{ closed: number; error?: string }> {
  try {
    const admin = (deps.client ?? createAdminClient)();
    const { data, error } = await admin.rpc("close_stale_bookings");
    if (error) return { closed: 0, error: `close_stale_bookings: ${error.message}` };
    return { closed: (data as number | null) ?? 0 };
  } catch (e) {
    return { closed: 0, error: e instanceof Error ? e.message : "close_stale_bookings failed" };
  }
}
