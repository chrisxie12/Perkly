import { connection } from "next/server";
import { assetLinks, parseFingerprints } from "@/lib/android/asset-links";

/**
 * Served at /.well-known/assetlinks.json (rewrite in next.config.ts). 404 unless this
 * environment sets ANDROID_ASSET_LINK_FINGERPRINTS; see src/lib/android/asset-links.ts.
 */
export async function GET() {
  await connection();
  const fingerprints = parseFingerprints(process.env.ANDROID_ASSET_LINK_FINGERPRINTS);
  if (!fingerprints) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
  }
  return Response.json(assetLinks(fingerprints), {
    headers: { "Cache-Control": "public, max-age=300", "Content-Type": "application/json" },
  });
}
