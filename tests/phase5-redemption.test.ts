import { describe, expect, it } from "vitest";
import { normaliseShortCode, redemptionErrorMessage, SHORT_CODE, tokenFromScan } from "@/features/redemptions/schemas";
import { merchantNavFor } from "@/app/merchant/merchant-nav";

const origin = "https://perqly-eta.vercel.app";
const token = "AbCdEfGhIjKlMnOpQrStU_";

describe("tokenFromScan", () => {
  it("accepts only /r/<22 chars> links on Perqly", () => {
    expect(tokenFromScan(`${origin}/r/${token}`, [origin])).toBe(token);
    expect(tokenFromScan(`${origin}/r/${token}/`, [origin])).toBe(token);
    expect(tokenFromScan(`https://evil.example/r/${token}`, [origin])).toBeNull();
    expect(tokenFromScan(`${origin}/r/short`, [origin])).toBeNull();
    expect(tokenFromScan(`${origin}/student/r/${token}`, [origin])).toBeNull();
    expect(tokenFromScan("not a url", [origin])).toBeNull();
  });
});

describe("short codes", () => {
  it("normalises typing and Crockford look-alikes", () => {
    expect(normaliseShortCode("7k3m-9q2d")).toBe("7K3M9Q2D");
    expect(normaliseShortCode("o1l0 ab cd")).toBe("0110ABCD");
    expect(SHORT_CODE.test("7K3M9Q2D")).toBe(true);
    expect(SHORT_CODE.test("7K3M9Q2U")).toBe(false);
  });
});

describe("messages", () => {
  it("explains limits with the reset date", () => {
    expect(redemptionErrorMessage("limit_reached", { limit: 1, period: "month", resets_at: "2026-12-01T00:00:00Z" })).toMatch(
      /once this month\. It resets on 1 December/,
    );
    expect(redemptionErrorMessage("qr_invalid")).toMatch(/current Perqly code/);
    expect(redemptionErrorMessage("anything")).toBeTruthy();
  });
});

describe("merchant nav", () => {
  it("shows the counter only to live businesses and codes only to managers", () => {
    const cashier = merchantNavFor({ merchantId: "m", displayName: "Shop", role: "cashier", status: "approved" }).map((n) => n.href);
    expect(cashier).toEqual(["/merchant", "/merchant/counter", "/merchant/redemptions"]);
    const draft = merchantNavFor({ merchantId: "m", displayName: "Shop", role: "owner", status: "draft" }).map((n) => n.href);
    expect(draft).not.toContain("/merchant/counter");
    expect(draft).not.toContain("/merchant/codes");
    const manager = merchantNavFor({ merchantId: "m", displayName: "Shop", role: "manager", status: "approved" }).map((n) => n.href);
    expect(manager).toContain("/merchant/codes");
  });
});

describe("account and staff helpers", () => {
  it("lets support look up users but only admins manage the platform", async () => {
    const { canSupport, canManagePlatform } = await import("@/lib/auth/roles");
    const base = {
      userId: "u",
      fullName: null,
      firstName: null,
      signupIntent: null,
      isSuspended: false,
      aal: "aal2" as const,
      institutionRoles: [],
      delegatedInstitutions: [],
      merchantRoles: [],
    };
    expect(canSupport({ ...base, platformRole: "support" })).toBe(true);
    expect(canManagePlatform({ ...base, platformRole: "support" })).toBe(false);
    expect(canSupport({ ...base, platformRole: "reviewer" })).toBe(false);
    expect(canSupport({ ...base, platformRole: null })).toBe(false);
  });
  it("treats /account as private", async () => {
    const { isPrivatePath } = await import("@/lib/auth/paths");
    expect(isPrivatePath("/account/notifications")).toBe(true);
  });
});
