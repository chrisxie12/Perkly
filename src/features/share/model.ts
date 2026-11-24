/**
 * "Share to Perqly" from another app (Web Share Target, and the Android app's share menu).
 * Pure helpers: the shared title, text and link come straight from another app, so
 * they are treated as plain text, trimmed and capped, and never rendered as HTML.
 */

export const SHARE_LIMIT = 1000;

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  // Drop control characters except newlines and tabs, then trim.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/** One message from what was shared: title, text and link, without repeating the link. */
export function sharedMessage(input: { title?: unknown; text?: unknown; url?: unknown }): string {
  const title = clean(input.title);
  const text = clean(input.text);
  const url = clean(input.url);
  const parts: string[] = [];
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join("\n").slice(0, SHARE_LIMIT).trim();
}

/** A chat draft from a ?draft= value: plain text, capped like a message. */
export function draftFrom(value: unknown): string {
  return clean(value).slice(0, SHARE_LIMIT);
}

const OPENABLE = /^\/(student|r|campus)(\/|$)/;

/**
 * If the shared text holds a link to Perqly itself (for example a deal a friend sent),
 * the path inside Perqly to open, else null. Only Perqly's own pages, never another site.
 */
export function perqlyPath(shared: string, siteUrl: string): string | null {
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return null;
  }
  for (const match of shared.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    try {
      const link = new URL(match[0]);
      if (link.host !== site.host) continue;
      const path = link.pathname + link.search;
      if (OPENABLE.test(link.pathname)) return path;
    } catch {
      // not a link
    }
  }
  return null;
}
