import { describe, expect, it } from "vitest";
import { discountLabel, limitLabel, offerErrorMessage, offerSchema, previewPrice } from "@/features/offers/schemas";

const id = "11111111-1111-4111-8111-111111111111";
const base = {
  merchantId: id,
  item: `service:${id}`,
  discountType: "percentage",
  discountValue: "20",
  conditions: "Show your pass before paying.",
};

describe("previewPrice matches the spec examples", () => {
  it("percentage rounds half away from zero", () => {
    expect(previewPrice(45, "percentage", 15)).toEqual({ regular: 45, discount: 6.75, final: 38.25 });
    expect(previewPrice(10.05, "percentage", 50)).toEqual({ regular: 10.05, discount: 5.03, final: 5.02 });
  });
  it("fixed amount and fixed price", () => {
    expect(previewPrice(50, "fixed_amount", 10)).toEqual({ regular: 50, discount: 10, final: 40 });
    expect(previewPrice(50, "fixed_price", 35)).toEqual({ regular: 50, discount: 15, final: 35 });
  });
  it("refuses discounts that make the item free or cost more", () => {
    expect(previewPrice(50, "fixed_amount", 50)).toBeNull();
    expect(previewPrice(50, "fixed_price", 60)).toBeNull();
    expect(previewPrice(0, "percentage", 10)).toBeNull();
  });
});

describe("labels", () => {
  it("describes discounts and limits in plain words", () => {
    expect(discountLabel("percentage", 15)).toBe("15% off");
    expect(discountLabel("fixed_amount", 5)).toMatch(/GH₵5\.00 off/);
    expect(discountLabel("fixed_price", 35)).toMatch(/Student price GH₵35\.00/);
    expect(limitLabel(1, "month")).toBe("Once a month");
    expect(limitLabel(3, "offer_lifetime")).toBe("3 times while the offer runs");
  });
  it("maps unknown database codes to a safe message", () => {
    expect(offerErrorMessage("forbidden")).toMatch(/permission/);
    expect(offerErrorMessage("something_else")).toBeTruthy();
  });
});

describe("offerSchema", () => {
  it("accepts a valid offer", () => {
    expect(offerSchema.safeParse(base).success).toBe(true);
  });
  it("caps percentages at 90", () => {
    expect(offerSchema.safeParse({ ...base, discountValue: "95" }).success).toBe(false);
  });
  it("requires conditions and a real item", () => {
    expect(offerSchema.safeParse({ ...base, conditions: "" }).success).toBe(false);
    expect(offerSchema.safeParse({ ...base, item: "service:nope" }).success).toBe(false);
  });
  it("requires the end after the start", () => {
    expect(offerSchema.safeParse({ ...base, startsAt: "2026-12-01T10:00", endsAt: "2026-11-01T10:00" }).success).toBe(false);
  });
});
