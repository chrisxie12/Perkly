import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on each matching request and writes
 * any rotated cookies onto the response.
 *
 * Route protection (redirecting signed-out users away from /student,
 * /merchant, /institution and /admin) is added in Step 3, together with
 * real authentication. A redirect here is only a convenience: the real
 * security boundary is Row Level Security plus server-side checks.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // The public site must keep working before Supabase is configured.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Cache-control headers from Supabase stop CDNs from serving one
        // user's refreshed session cookie to another user.
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  // getClaims() validates the JWT signature; do not replace with getSession().
  await supabase.auth.getClaims();

  return response;
}
