/**
 * Content-Security-Policy for every route.
 *
 * Scripts allow 'unsafe-inline' because Next.js nonces need every page to be
 * rendered per request, which is incompatible with the Partial Prerendering
 * this app uses (see docs/PERQLY_IMPLEMENTATION_ROADMAP.md, section 5).
 * Everything else is locked to this site and the configured Supabase project.
 */
export function buildCsp({ supabaseUrl, isDev }: { supabaseUrl?: string; isDev: boolean }): string {
  let supabase = "";
  let supabaseRealtime = "";
  if (supabaseUrl) {
    try {
      const origin = new URL(supabaseUrl).origin;
      supabase = origin;
      supabaseRealtime = origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    } catch {
      // An invalid URL is reported by src/lib/env.ts; leave Supabase out of the policy.
    }
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // OpenStreetMap tiles for the student map.
    "img-src": ["'self'", "data:", "blob:", supabase, "https://tile.openstreetmap.org"].filter(Boolean),
    "font-src": ["'self'"],
    // The service worker fetches map tiles itself, so they need connect-src too.
    "connect-src": ["'self'", supabase, supabaseRealtime, "https://tile.openstreetmap.org", ...(isDev ? ["ws:"] : [])].filter(Boolean),
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    // Shops pay their Perqly subscription on Paystack's hosted checkout.
    "form-action": ["'self'", "https://checkout.paystack.com"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
