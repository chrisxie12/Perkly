import "server-only";
import { cache } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { parseUserContext, type UserContext } from "./roles";

/**
 * The signed-in user's routing context, read once per request.
 * Returns null when signed out or when Supabase isn't configured.
 * Throws if the database can't be reached, so an outage shows an error page
 * instead of looking like a signed-out user.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return null;

  const { data, error } = await supabase.rpc("get_my_context");
  if (error) throw new Error(`Could not load account context (${error.code ?? "unknown"})`);
  if (!data) return null;
  return parseUserContext(data, claimsData.claims.aal);
});
