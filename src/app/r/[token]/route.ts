import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { loginPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";
import { openSession } from "@/features/redemptions/actions";
import { isToken } from "@/features/redemptions/schemas";

/**
 * The link inside every printed Perqly QR. It only starts the server-side
 * process: the database validates the code, the student and the business.
 * Never cached; the token is not logged.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/r/[token]">) {
  const { token } = await params;
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (!isToken(token)) return go("/student/scan?error=qr_invalid");
  if (!hasSupabaseEnv()) return go("/student/scan?error=unavailable");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return go(loginPath(`/r/${token}`));
  return go(await openSession({ token }));
}
