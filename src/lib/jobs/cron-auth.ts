import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

/**
 * Checks the `Authorization: Bearer <CRON_SECRET>` header Vercel Cron sends.
 * Refuses everything when the secret is missing or too short, so a
 * misconfigured deployment can't be triggered by anyone.
 */
export function isAuthorisedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !authorization) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received);
}
