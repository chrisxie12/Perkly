import { describe, expect, it } from "vitest";
import { DAY_COLOURS, dayColourFor, formatPassClock } from "@/lib/day-colour";

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("dayColourFor", () => {
  it("returns a different colour for each day of the week", () => {
    const week = Array.from({ length: 7 }, (_, i) => dayColourFor(new Date(Date.UTC(2026, 10, 15 + i))).hex);
    expect(new Set(week).size).toBe(7);
  });

  it("uses Accra (UTC) days: 23:59 Saturday is still Saturday", () => {
    expect(dayColourFor(new Date("2026-11-14T23:59:59Z")).day).toBe("Saturday");
    expect(dayColourFor(new Date("2026-11-15T00:00:00Z")).day).toBe("Sunday");
  });
});

describe("pass colours are readable", () => {
  it.each(DAY_COLOURS.map((d) => [d.day, d.hex, d.ink] as const))("%s text passes WCAG AA (4.5:1)", (_day, bg, ink) => {
    expect(contrast(bg, ink)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("brand contrast rules", () => {
  it("white on Perkly Blue passes AA", () => expect(contrast("#0066FF", "#FFFFFF")).toBeGreaterThanOrEqual(4.5));
  it("ink on Perk Orange passes AA", () => expect(contrast("#FF6B35", "#1F2937")).toBeGreaterThanOrEqual(4.5));
  it("white on Perk Orange fails AA, so it is never used", () => expect(contrast("#FF6B35", "#FFFFFF")).toBeLessThan(4.5));
  it("ink-500 body text on paper passes AA", () => expect(contrast("#6B7280", "#FFFFFF")).toBeGreaterThanOrEqual(4.5));
});

describe("formatPassClock", () => {
  it("formats HH:MM:SS with leading zeros", () => {
    expect(formatPassClock(new Date("2026-11-14T07:05:09Z"))).toBe("07:05:09");
  });
});
