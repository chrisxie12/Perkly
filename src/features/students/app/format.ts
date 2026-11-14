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
