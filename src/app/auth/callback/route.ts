import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

const INTENT_COOKIE = "perqly_signup_intent";

/**
 * Google sends people back here (through Supabase) with a one-time `code`.
 * Exchanging it needs the PKCE verifier cookie the browser set when it started,
 * so it only works in the browser that pressed "Continue with Google".
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/login?google=${reason}`, request.url));
    response.cookies.delete({ name: INTENT_COOKIE, path: "/auth" });
    return response;
  };
  if (!hasSupabaseEnv()) return fail("failed");
  // The person pressed Cancel on Google's screen.
  if (params.get("error") === "access_denied") return fail("cancelled");
  const code = params.get("code");
  if (!code || code.length > 512 || !/^[A-Za-z0-9-]+$/.test(code)) return fail("failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("failed");

  // New accounts: record whether they said student or business, so the first sign-in goes to the right place.
  const intent = request.cookies.get(INTENT_COOKIE)?.value;
  if (intent === "student" || intent === "merchant") await supabase.rpc("set_signup_intent", { p_intent: intent });

  const next = safeNextPath(params.get("next")) ?? (intent === "merchant" ? "/merchant" : null);
  const response = NextResponse.redirect(new URL(next ? `/auth/continue?next=${encodeURIComponent(next)}` : "/auth/continue", request.url));
  response.cookies.delete({ name: INTENT_COOKIE, path: "/auth" });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
