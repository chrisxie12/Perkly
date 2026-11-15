import { describe, expect, it } from "vitest";
import { MAPS_LINK_RE, coordsFromMapsLink, directionsUrl, shopChecklist, whatsappUrl } from "@/features/merchants/shop";
import { branchLocationSchema, shopDetailsSchema } from "@/features/merchants/schemas";

describe("Google Maps links", () => {
  it("accepts share links and full links only", () => {
    expect(MAPS_LINK_RE.test("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(MAPS_LINK_RE.test("https://www.google.com/maps/place/Shop/@5.61,-0.23,17z")).toBe(true);
    expect(MAPS_LINK_RE.test("https://evil.example/maps")).toBe(false);
    expect(MAPS_LINK_RE.test("http://maps.app.goo.gl/x")).toBe(false);
  });
  it("reads the pin from full links", () => {
    expect(coordsFromMapsLink("https://www.google.com/maps/place/X/@5.6151,-0.2321,17z")).toEqual({ latitude: 5.6151, longitude: -0.2321 });
    expect(coordsFromMapsLink("https://www.google.com/maps/place/X/data=!3d5.6152!4d-0.2322")).toEqual({
      latitude: 5.6152,
      longitude: -0.2322,
    });
    expect(coordsFromMapsLink("https://maps.google.com/?q=5.6,-0.2")).toEqual({ latitude: 5.6, longitude: -0.2 });
    expect(coordsFromMapsLink("https://maps.app.goo.gl/AbC123")).toBeNull();
  });
  it("directions prefer the business's own link", () => {
    expect(directionsUrl({ maps_url: "https://maps.app.goo.gl/a", latitude: 1, longitude: 2 })).toBe("https://maps.app.goo.gl/a");
    expect(directionsUrl({ latitude: 5.6, longitude: -0.2 })).toContain("query=5.6,-0.2");
    expect(directionsUrl({})).toBeNull();
  });
});

describe("contact links", () => {
  it("turns a Ghana number into a wa.me link", () => {
    expect(whatsappUrl("024 123 4567")).toBe("https://wa.me/233241234567");
    expect(whatsappUrl("+233 24 123 4567")).toBe("https://wa.me/233241234567");
  });
});

describe("shop details", () => {
  it("strips @ and profile URLs from handles", () => {
    const r = shopDetailsSchema.parse({
      merchantId: "00000000-0000-4000-8000-000000000000",
      instagram: "@auntieakos",
      tiktok: "https://www.tiktok.com/@auntie.akos",
    });
    expect(r.instagram).toBe("auntieakos");
    expect(r.tiktok).toBe("auntie.akos");
  });
  it("refuses unknown ways to pay", () => {
    expect(shopDetailsSchema.safeParse({ merchantId: "00000000-0000-4000-8000-000000000000", paymentMethods: ["Bitcoin"] }).success).toBe(
      false,
    );
  });
  it("refuses map links that aren't Google Maps", () => {
    expect(
      branchLocationSchema.safeParse({ branchId: "00000000-0000-4000-8000-000000000000", mapsUrl: "https://evil.example/maps" }).success,
    ).toBe(false);
  });
});

describe("completeness", () => {
  it("counts only what the business has filled in", () => {
    const empty = shopChecklist({
      photos: 0,
      description: null,
      phone: null,
      whatsapp: null,
      branches: [],
      socials: {},
      payment_methods: [],
    });
    expect(empty.done).toBe(0);
    const full = shopChecklist({
      photos: 3,
      description: "Home-style jollof, waakye and banku, five minutes from the GCTU gate.",
      phone: "0241234567",
      whatsapp: "0241234567",
      branches: [{ maps_url: "https://maps.app.goo.gl/a", latitude: null, landmark: "Opposite the gate", has_hours: true }],
      socials: { instagram: "x" },
      payment_methods: ["Cash"],
    });
    expect(full.done).toBe(full.total);
  });
});
