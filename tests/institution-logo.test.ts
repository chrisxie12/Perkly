import { describe, expect, it } from "vitest";
import { institutionLogoUrl } from "@/features/institutions/logo-url";

const id = "3f2b8c1e-7a4d-4e1b-9c2a-5d6e7f8a9b0c";

describe("institutionLogoUrl", () => {
  it("builds the public storage URL", () => {
    expect(institutionLogoUrl("https://abc.supabase.co/", `${id}/logo-1731600000000.svg`)).toBe(
      `https://abc.supabase.co/storage/v1/object/public/institution-logos/${id}/logo-1731600000000.svg`,
    );
  });
  it("returns null without a logo or URL", () => {
    expect(institutionLogoUrl("https://abc.supabase.co", null)).toBeNull();
    expect(institutionLogoUrl(null, `${id}/logo-1.png`)).toBeNull();
  });
  it("rejects paths that aren't an uploaded logo", () => {
    expect(institutionLogoUrl("https://abc.supabase.co", "../secret.png")).toBeNull();
    expect(institutionLogoUrl("https://abc.supabase.co", `${id}/logo-1.gif`)).toBeNull();
  });
});
