import { describe, expect, it } from "vitest";
import { isMissingBuildTimeModule, unavailable } from "@/app/serwist/[path]/fallback";

const missingConfig = Object.assign(new Error("Cannot find module '/var/task/node_modules/next/dist/server/config.js'"), {
  code: "ERR_MODULE_NOT_FOUND",
  url: "file:///var/task/node_modules/next/dist/server/config.js",
});

describe("service worker route fallback", () => {
  it("recognises the request-time failure seen on Vercel", () => {
    expect(isMissingBuildTimeModule(missingConfig)).toBe(true);
  });
  it("lets every other error fail loudly", () => {
    expect(isMissingBuildTimeModule(new Error("esbuild failed"))).toBe(false);
    expect(isMissingBuildTimeModule(Object.assign(new Error("x"), { code: "ERR_MODULE_NOT_FOUND", url: "file:///other.js" }))).toBe(false);
    expect(isMissingBuildTimeModule(null)).toBe(false);
    expect(isMissingBuildTimeModule("boom")).toBe(false);
  });
  it("answers 503 with a retry time and no caching", async () => {
    const res = unavailable();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toMatch(/Try again/);
  });
});
