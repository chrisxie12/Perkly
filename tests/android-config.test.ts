import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANDROID_PACKAGE_ID, assetLinks, parseFingerprints } from "@/lib/android/asset-links";
import { siteConfig } from "@/config/site";

const root = join(__dirname, "..");
const twa = JSON.parse(readFileSync(join(root, "android", "twa-manifest.json"), "utf8"));
const HOSTS = ["perqly-git-main-vision61-studios.vercel.app", "perqly.online"];
const FP = "AB:".repeat(31) + "CD";

describe("android/twa-manifest.json", () => {
  it("keeps the approved package id and app name", () => {
    expect(twa.packageId).toBe("com.perqly.app");
    expect(twa.packageId).toBe(ANDROID_PACKAGE_ID);
    expect(twa.name).toBe(siteConfig.name);
    expect(twa.launcherName).toBe(siteConfig.name);
  });

  it("points at staging or production only, and every URL at that same host", () => {
    expect(HOSTS).toContain(twa.host);
    const urls = [
      twa.fullScopeUrl,
      twa.webManifestUrl,
      twa.iconUrl,
      twa.maskableIconUrl,
      ...twa.shortcuts.map((s: { url: string }) => s.url),
    ];
    for (const url of urls) expect(new URL(url).host).toBe(twa.host);
    expect(twa.startUrl).toBe("/student");
  });

  it("matches the site's colours and stays white in dark mode", () => {
    for (const key of ["themeColor", "themeColorDark", "navigationColor", "navigationColorDark", "backgroundColor"]) {
      expect(twa[key].toUpperCase()).toBe(siteConfig.themeColor.toUpperCase());
    }
  });

  it("never falls back to a WebView, which would break Google sign-in", () => {
    expect(twa.fallbackType).toBe("customtabs");
    expect(twa.enableNotifications).toBe(true);
  });

  it("keeps the signing key outside the repository", () => {
    expect(twa.signingKey.path).toMatch(/^[A-Za-z]:\\perqly-keys\\/);
    expect(twa.signingKey.path).not.toMatch(/\s/);
  });

  it("supports Android 7+ (the TWA library needs API 24) and names the version", () => {
    expect(twa.minSdkVersion).toBe(24);
    expect(twa.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number.isInteger(twa.appVersionCode) && twa.appVersionCode >= 1).toBe(true);
  });

  it("targets Android 16 (API 36) once the project is generated", () => {
    const gradle = join(root, "android", "app", "build.gradle");
    if (!existsSync(gradle)) return;
    const text = readFileSync(gradle, "utf8");
    const target = Number(text.match(/targetSdkVersion\s*=?\s*(\d+)/)?.[1]);
    expect(target).toBeGreaterThanOrEqual(36);
    expect(Number(text.match(/minSdkVersion\s*=?\s*(\d+)/)?.[1])).toBe(twa.minSdkVersion);
    expect(text).toContain(`applicationId "${twa.packageId}"`);
    expect(text).not.toMatch(/storePassword|keyPassword/);
  });
});

describe("asset links", () => {
  it("is off unless fingerprints are set", () => {
    expect(parseFingerprints(undefined)).toBeNull();
    expect(parseFingerprints("")).toBeNull();
  });

  it("refuses anything that isn't a SHA-256 fingerprint", () => {
    expect(parseFingerprints("not-a-fingerprint")).toBeNull();
    expect(parseFingerprints(`${FP}, AB:CD`)).toBeNull();
    const five = Array.from({ length: 5 }, (_, i) => "AB:".repeat(31) + String(10 + i));
    expect(parseFingerprints(five.join(","))).toBeNull();
  });

  it("accepts one or two fingerprints, upper-cases and de-duplicates them", () => {
    expect(parseFingerprints(FP.toLowerCase())).toEqual([FP]);
    const other = "12:".repeat(31) + "34";
    expect(parseFingerprints(`${FP}, ${other}\n${FP}`)).toEqual([FP, other]);
  });

  it("vouches for com.perqly.app only", () => {
    const [statement] = assetLinks([FP]);
    expect(statement.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(statement.target).toEqual({ namespace: "android_app", package_name: "com.perqly.app", sha256_cert_fingerprints: [FP] });
  });
});
