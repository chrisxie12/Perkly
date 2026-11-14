/**
 * The live redemption pass changes background colour every day, so an old
 * screenshot shows the wrong colour. Every pass on the same day shares the
 * colour, which cashiers learn to expect.
 *
 * Days are computed in Africa/Accra time (UTC+0, no daylight saving).
 */
export const DAY_COLOURS = [
  { day: "Sunday", token: "day-sun", hex: "#7C3AED", ink: "#FFFFFF" },
  { day: "Monday", token: "day-mon", hex: "#0066FF", ink: "#FFFFFF" },
  { day: "Tuesday", token: "day-tue", hex: "#FF6B35", ink: "#1F2937" },
  { day: "Wednesday", token: "day-wed", hex: "#15803D", ink: "#FFFFFF" },
  { day: "Thursday", token: "day-thu", hex: "#F5B800", ink: "#1F2937" },
  { day: "Friday", token: "day-fri", hex: "#C2185B", ink: "#FFFFFF" },
  { day: "Saturday", token: "day-sat", hex: "#0E9F9F", ink: "#1F2937" },
] as const;

export type DayColour = (typeof DAY_COLOURS)[number];

export function dayColourFor(date: Date): DayColour {
  // Accra is UTC+0 all year, so the UTC weekday is the local weekday.
  return DAY_COLOURS[date.getUTCDay()];
}

/** Formats a clock as HH:MM:SS in Accra time. */
export function formatPassClock(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
