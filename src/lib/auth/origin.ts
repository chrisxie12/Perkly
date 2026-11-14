import "server-only";
import { headers } from "next/headers";
import { getSiteUrl } from "@/lib/env";

/**
 * The origin the current request came in on, for links in sign-in emails.
 * Supabase only accepts redirect URLs on its allow-list, so a forged Host
 * header can't send people elsewhere (docs/SUPABASE_SETUP.md, section 3.2).
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return getSiteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}
