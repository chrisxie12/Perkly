/** Public half of the web push key pair. Safe for the browser; null when push isn't set up. */
export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key && /^[A-Za-z0-9_-]{80,100}$/.test(key) ? key : null;
}
