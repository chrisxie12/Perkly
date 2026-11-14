import { describe, expect, it } from "vitest";
import { codeSchema, fieldErrors, signInSchema, signUpSchema } from "@/features/auth/schemas";
import { authErrorMessage, isUnknownAccountError } from "@/lib/auth/messages";
import { buildCsp } from "@/lib/security/csp";

describe("sign-in forms", () => {
  it("normalises email addresses", () => {
    expect(signInSchema.parse({ email: "  Ama@Example.COM " }).email).toBe("ama@example.com");
  });

  it("explains invalid sign-up input field by field", () => {
    const result = signUpSchema.safeParse({ fullName: "A", email: "nope", intent: "admin" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["consent", "email", "fullName", "intent"]);
    }
  });

  it("accepts names with accents, hyphens and apostrophes", () => {
    expect(signUpSchema.safeParse({ fullName: "Akosua Asante-Boateng", email: "a@b.co", intent: "student", consent: "on" }).success).toBe(
      true,
    );
    expect(signUpSchema.safeParse({ fullName: "Ɛfua O'Neil", email: "a@b.co", intent: "merchant", consent: "on" }).success).toBe(true);
    expect(signUpSchema.safeParse({ fullName: "<script>", email: "a@b.co", intent: "student", consent: "on" }).success).toBe(false);
  });

  it("accepts a 6-digit code with spaces or a dash", () => {
    expect(codeSchema.parse({ code: "123 456" }).code).toBe("123456");
    expect(codeSchema.parse({ code: "123-456" }).code).toBe("123456");
    expect(codeSchema.safeParse({ code: "12345" }).success).toBe(false);
  });
});

describe("auth error messages", () => {
  it("never reveals whether an account exists", () => {
    expect(isUnknownAccountError("otp_disabled")).toBe(true);
  });

  it("maps known codes and falls back to a generic message", () => {
    expect(authErrorMessage("otp_expired")).toMatch(/expired/);
    expect(authErrorMessage("something_new")).toMatch(/Something went wrong/);
  });
});

describe("buildCsp", () => {
  it("allows only this site and the configured Supabase project", () => {
    const csp = buildCsp({ supabaseUrl: "https://abcd.supabase.co", isDev: false });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' https://abcd.supabase.co wss://abcd.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("works without Supabase and relaxes only what development needs", () => {
    const csp = buildCsp({ isDev: true });
    expect(csp).toContain("connect-src 'self' ws:");
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
