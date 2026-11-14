import type { EmailOtpType } from "@supabase/supabase-js";

const ALLOWED_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup"];
const MAX_LENGTH = 512;

export type ConfirmParams = { kind: "token_hash"; tokenHash: string; type: EmailOtpType } | { kind: "code"; code: string };

/**
 * Reads the sign-in link parameters. Returns null for anything malformed, or when
 * Supabase reports an error (an expired or already-used link).
 */
export function parseConfirmParams(searchParams: URLSearchParams): ConfirmParams | null {
  if (searchParams.has("error") || searchParams.has("error_code")) return null;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash) {
    if (!type || !ALLOWED_TYPES.includes(type) || tokenHash.length > MAX_LENGTH) return null;
    return { kind: "token_hash", tokenHash, type };
  }

  const code = searchParams.get("code");
  if (code && code.length <= MAX_LENGTH && /^[A-Za-z0-9-]+$/.test(code)) return { kind: "code", code };

  return null;
}
