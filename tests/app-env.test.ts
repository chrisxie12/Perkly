import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAppEnv } from "@/lib/env";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("resolveAppEnv", () => {
  it("uses NEXT_PUBLIC_APP_ENV when it is set", () => {
    expect(resolveAppEnv("staging", "production")).toBe("staging");
    expect(resolveAppEnv(" Production ", undefined)).toBe("production");
  });

  it("falls back to Vercel's environment", () => {
    expect(resolveAppEnv(undefined, "production")).toBe("production");
    expect(resolveAppEnv(undefined, "preview")).toBe("staging");
    expect(resolveAppEnv(undefined, "development")).toBe("development");
  });

  it("treats anything unknown as development, never production", () => {
    expect(resolveAppEnv(undefined, undefined)).toBe("development");
    expect(resolveAppEnv("live", undefined)).toBe("development");
    expect(resolveAppEnv("", undefined)).toBe("development");
  });
});

describe("robots and sitemap", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keep every crawler out of staging", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(sitemap()).toEqual([]);
  });

  it("allow the public pages in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://perqly.online");
    const result = robots();
    expect(result.sitemap).toBe("https://perqly.online/sitemap.xml");
    expect(JSON.stringify(result.rules)).toContain('"allow":"/"');
    expect(sitemap().map((entry) => entry.url)).toContain("https://perqly.online/");
  });
});
