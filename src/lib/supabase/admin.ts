import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";

/**
 * A client with the secret key. It bypasses RLS, so use it only for the few
 * database functions granted to service_role, and only after checking who the
 * user is with the normal server client.
 */
export function createAdminClient() {
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
