/**
 * Digital Asset Links for the Perqly Android app (a Trusted Web Activity).
 *
 * The site vouches for the app only where ANDROID_ASSET_LINK_FINGERPRINTS is set, so each
 * environment decides for itself: staging (Vercel Preview) lists the upload key, production
 * lists the upload key and Google Play's app signing key, and an unset variable means no
 * link at all (the route answers 404). Fingerprints are public certificate hashes, not secrets.
 */
export const ANDROID_PACKAGE_ID = "com.perqly.app";

const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** SHA-256 fingerprints from a comma- or space-separated list; null if any entry is malformed. */
export function parseFingerprints(raw: string | undefined | null): string[] | null {
  const parts = (raw ?? "")
    .split(/[\s,]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 4 || !parts.every((p) => FINGERPRINT.test(p))) return null;
  return [...new Set(parts)];
}

export function assetLinks(fingerprints: string[]) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE_ID, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
