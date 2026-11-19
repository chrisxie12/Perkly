import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Create a new client per request; never share one across requests.
 * Server Components cannot write cookies, so session refresh happens in
 * src/proxy.ts and the setAll error below is expected there.
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();
  // Supabase Auth reads the clock (Date.now) as soon as the client loads a session. With
  // cacheComponents, Next.js may try to prerender a page with the request's cookies; reading the
  // clock there throws "encountered the unstable value Date.now()". Waiting for the real request
  // first keeps every Supabase-backed render at request time, which it already needs anyway.
  await connection();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there.
          // proxy.ts refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
