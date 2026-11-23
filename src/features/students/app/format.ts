/** Category colours from the prototype, keyed by our category slugs. */
const CATEGORY_TONE: Record<string, { bg: string; fg: string }> = {
  food: { bg: "#FFEBD6", fg: "#9A3F07" },
  printing: { bg: "#DCE8FF", fg: "#0047B3" },
  beauty: { bg: "#FDE2EC", fg: "#9D174D" },
  tech: { bg: "#E2E8F0", fg: "#1E293B" },
  fashion: { bg: "#FEF0C3", fg: "#854D0E" },
  health: { bg: "#D9F2E5", fg: "#0B6B3D" },
  fitness: { bg: "#E0F2FE", fg: "#075985" },
  services: { bg: "#EDE9FE", fg: "#5B21B6" },
};
export const toneFor = (slug: string | null | undefined) => CATEGORY_TONE[slug ?? ""] ?? { bg: "#F1F5F9", fg: "#334155" };

/** The business's initials, from its real name. */
export function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Walking time at 80 m a minute, from the student's campus. Null when either location is unknown. */
export function walkLabel(distance: number | null | undefined) {
  if (distance === null || distance === undefined) return null;
  const minutes = Math.max(1, Math.ceil(distance / 80));
  return minutes <= 45 ? `${minutes} min walk` : `${(distance / 1000).toFixed(1)} km away`;
}

/** "Posted today", "Posted 3 days ago", "Posted 2 weeks ago". Null when unknown or older than 8 weeks. */
export function postedLabel(publishedAt: string | null | undefined, now: Date = new Date()) {
  if (!publishedAt) return null;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return null;
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks > 8) return null;
  return weeks === 1 ? "Posted last week" : `Posted ${weeks} weeks ago`;
}

/** Whole-number share off the normal price, like 20 for 20%. Null when there's no saving. */
export function percentOff(regular: number, final: number) {
  const r = Number(regular);
  const f = Number(final);
  if (!(r > 0) || !(f < r)) return null;
  return Math.max(1, Math.round(((r - f) / r) * 100));
}
