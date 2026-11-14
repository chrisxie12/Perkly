import { describe, expect, it } from "vitest";
import { colourOfDay, normaliseShortCode, redemptionErrorMessage, SHORT_CODE, tokenFromScan } from "@/features/redemptions/schemas";
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

describe("pass colour", () => {
  it("is the same all day and changes the next day", () => {
    const morning = new Date("2026-11-14T06:00:00Z");
    const night = new Date("2026-11-14T23:59:00Z");
    const tomorrow = new Date("2026-11-15T06:00:00Z");
    expect(colourOfDay(morning)).toBe(colourOfDay(night));
    expect(colourOfDay(tomorrow)).not.toBe(colourOfDay(morning));
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
