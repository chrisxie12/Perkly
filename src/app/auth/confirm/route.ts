import { NextResponse, type NextRequest } from "next/server";
import { parseConfirmParams } from "@/lib/auth/confirm-params";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Backup for the code: the link in the sign-in email lands here.
 *
 * Two link formats arrive:
 * - Perqly's own templates link here with `token_hash` and `type`.
 * - Supabase's default templates (used until custom SMTP is set up, which is
 *   what unlocks template editing) go through Supabase first, which then
 *   redirects here with a one-time `code`. Exchanging it needs the PKCE
 *   verifier cookie set when the code was requested, so this only works in the
 *   browser that asked for the email.
 */
export async function GET(request: NextRequest) {
  const failed = new URL("/login?link=expired", request.url);
  const params = parseConfirmParams(request.nextUrl.searchParams);
  if (!hasSupabaseEnv() || !params) return NextResponse.redirect(failed);

  const supabase = await createClient();
  const { error } =
    params.kind === "token_hash"
      ? await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type })
      : await supabase.auth.exchangeCodeForSession(params.code);
  if (error) return NextResponse.redirect(failed);

  const response = NextResponse.redirect(new URL("/auth/continue", request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
