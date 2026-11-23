import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on app routes only. Skip static assets, images, the service
     * worker, the manifest, icons, public files and Android asset links.
     */
    "/((?!_next/static|_next/image|serwist|\\.well-known|api/android|manifest.webmanifest|icons|images|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
