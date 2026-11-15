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
  it("serves bundled official logos from the app", () => {
    expect(institutionLogoUrl(null, "bundled/ug.svg")).toBe("/institution-logos/ug.svg");
    expect(institutionLogoUrl("https://abc.supabase.co", "bundled/academic-city.png")).toBe("/institution-logos/academic-city.png");
    expect(institutionLogoUrl(null, "bundled/../secret.png")).toBeNull();
  });
  it("rejects paths that aren't an uploaded logo", () => {
    expect(institutionLogoUrl("https://abc.supabase.co", "../secret.png")).toBeNull();
    expect(institutionLogoUrl("https://abc.supabase.co", `${id}/logo-1.gif`)).toBeNull();
  });
});

describe("bundled logo files", () => {
  it("exist for every institution the migration points at", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261114090022_bundled_institution_logos.sql", "utf8");
    const files = [...sql.matchAll(/'([a-z0-9-]+\.(?:svg|png|webp))'/g)].map((m) => m[1]);
    expect(files.length).toBe(15);
    for (const f of files) expect(existsSync(`public/institution-logos/${f}`), f).toBe(true);
  });
});
