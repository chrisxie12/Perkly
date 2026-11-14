import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthPage, isPrivatePath, loginPath } from "@/lib/auth/paths";

/**
 * Refreshes the Supabase session cookie on every request and does the coarse
 * redirects: signed-out users away from private areas, signed-in users away
 * from the sign-in pages. This is a convenience only; area layouts check roles
 * on the server and RLS enforces access in the database.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname, search } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    // No Supabase configured: nobody can be signed in, so private areas go to the sign-in page.
    if (isPrivatePath(pathname)) return NextResponse.redirect(new URL(loginPath(pathname + search), request.url));
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Keep any refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  };

  if (!signedIn && isPrivatePath(pathname)) return redirectTo(loginPath(pathname + search));
  if (signedIn && isAuthPage(pathname) && pathname !== "/login/mfa") {
    const next = request.nextUrl.searchParams.get("next");
    return redirectTo(next ? `/auth/continue?next=${encodeURIComponent(next)}` : "/auth/continue");
  }

  if (isPrivatePath(pathname) || pathname.startsWith("/auth")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}
