export const AREAS = ["student", "merchant", "institution", "admin"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_HOME: Record<Area, string> = {
  student: "/student",
  merchant: "/merchant",
  institution: "/institution",
  admin: "/admin",
};

export const AREA_LABEL: Record<Area, string> = {
  student: "Student",
  merchant: "Merchant",
  institution: "Institution reviewer",
  admin: "Perqly staff",
};

/** Paths that need a signed-in user. Also NetworkOnly in the service worker. */
export const PRIVATE_PREFIXES = ["/student", "/merchant", "/institution", "/admin", "/r"] as const;

/** Sign-in pages: signed-in users are sent on from these. */
export const AUTH_PAGES = ["/login", "/register"] as const;

const ORIGIN = "https://perqly.invalid";

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function areaOfPath(pathname: string): Area | null {
  return AREAS.find((area) => matchesPrefix(pathname, AREA_HOME[area])) ?? null;
}

/**
 * Returns a same-site path that's safe to redirect to after sign-in, or null.
 * Rejects absolute and protocol-relative URLs, backslash tricks, control
 * characters, and the sign-in pages themselves (to avoid loops).
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  if (isAuthPage(url.pathname) || matchesPrefix(url.pathname, "/auth")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPath(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
