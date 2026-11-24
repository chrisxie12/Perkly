/** Pure helpers for the service worker route, so they can be tested without building anything. */

/** The one failure that only happens at request time: Next's build config isn't in the server bundle. */
export function isMissingBuildTimeModule(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, url, message } = error as { code?: unknown; url?: unknown; message?: unknown };
  const where = `${typeof url === "string" ? url : ""} ${typeof message === "string" ? message : ""}`;
  return code === "ERR_MODULE_NOT_FOUND" && where.includes("next/dist/server/config");
}

/** Browsers keep their current service worker on a 5xx and try the update again later. */
export function unavailable() {
  return new Response("The app update file is being prepared. Try again shortly.", {
    status: 503,
    headers: { "Retry-After": "300", "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
