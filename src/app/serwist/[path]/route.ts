import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";
import { isMissingBuildTimeModule, unavailable } from "./fallback";

// Version the offline page by commit, so a new deploy refreshes it.
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

const route = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});

export const { dynamic, dynamicParams, revalidate, generateStaticParams } = route;

/**
 * The service worker is built once, at build time, and served as a static file. Now and then
 * the host runs this route live instead, where Next's build config isn't shipped, so building
 * it fails. Answer "try again later" then: browsers keep the service worker they have and check
 * again. Any other error, and every error during the build, still fails loudly.
 */
export async function GET(...args: Parameters<typeof route.GET>) {
  try {
    return await route.GET(...args);
  } catch (error) {
    if (!isMissingBuildTimeModule(error)) throw error;
    console.warn("[serwist] the service worker can't be rebuilt at request time; answered 503 so browsers retry later");
    return unavailable();
  }
}
