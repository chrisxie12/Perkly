import "server-only";
import { TERMS_VERSION } from "@/config/legal";
import type { createClient } from "@/lib/supabase/server";

/**
 * Records which version of the Terms of use and Privacy notice a new account accepted
 * at sign-up (public.accept_terms). Call it only after the person ticked the consent box.
 * Best effort: a failure is logged and never blocks signing in.
 */
export async function recordTermsAcceptance(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) console.error("[terms] could not record acceptance", error.code);
}
