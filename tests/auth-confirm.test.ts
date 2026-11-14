import { describe, expect, it } from "vitest";
import { parseConfirmParams } from "@/lib/auth/confirm-params";

const parse = (query: string) => parseConfirmParams(new URLSearchParams(query));

describe("sign-in link parameters", () => {
  it("accepts Perqly's own token-hash links", () => {
    expect(parse("token_hash=abc123&type=email")).toEqual({ kind: "token_hash", tokenHash: "abc123", type: "email" });
    expect(parse("token_hash=abc123&type=signup")?.kind).toBe("token_hash");
  });

  it("rejects token-hash links with a missing or unexpected type", () => {
    expect(parse("token_hash=abc123")).toBeNull();
    expect(parse("token_hash=abc123&type=recovery")).toBeNull();
    expect(parse("token_hash=abc123&type=email_change")).toBeNull();
  });

  it("accepts the one-time code Supabase's default template redirects with", () => {
    expect(parse("code=8c1f0e2a-4b7d-4e55-9f3e-2a1b0c9d8e7f")).toEqual({
      kind: "code",
      code: "8c1f0e2a-4b7d-4e55-9f3e-2a1b0c9d8e7f",
    });
  });

  it("rejects malformed or oversized values", () => {
    expect(parse("code=abc%20def")).toBeNull();
    expect(parse("code=<script>")).toBeNull();
    expect(parse(`code=${"a".repeat(513)}`)).toBeNull();
    expect(parse(`token_hash=${"a".repeat(513)}&type=email`)).toBeNull();
    expect(parse("")).toBeNull();
  });

  it("treats Supabase error redirects as a failed link", () => {
    expect(parse("error=access_denied&error_code=otp_expired&code=abc")).toBeNull();
    expect(parse("error_code=otp_expired")).toBeNull();
  });
});
