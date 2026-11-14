/** Weekly opening hours: ISO weekday 1 = Monday ... 7 = Sunday, "HH:MM" Accra time. */
export type DayHours = { weekday: number; opens: string; closes: string };

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseHours(raw: unknown): DayHours[] | null {
  if (typeof raw !== "string" || raw === "") return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length > 7) return null;
  const out: DayHours[] = [];
  for (const d of data) {
    if (!d || typeof d !== "object") return null;
    const { weekday, opens, closes } = d as Record<string, unknown>;
    if (typeof weekday !== "number" || weekday < 1 || weekday > 7 || !Number.isInteger(weekday)) return null;
    if (typeof opens !== "string" || typeof closes !== "string" || !TIME.test(opens) || !TIME.test(closes) || opens === closes) return null;
    if (out.some((o) => o.weekday === weekday)) return null;
    out.push({ weekday, opens, closes });
  }
  return out.sort((a, b) => a.weekday - b.weekday);
}

/** "Mon–Fri 08:00–20:00, Sat 09:00–14:00": runs of days with the same hours. */
export function summariseHours(hours: DayHours[]): string | null {
  if (hours.length === 0) return null;
  const parts: string[] = [];
  let i = 0;
  while (i < hours.length) {
    let j = i;
    while (
      j + 1 < hours.length &&
      hours[j + 1].weekday === hours[j].weekday + 1 &&
      hours[j + 1].opens === hours[i].opens &&
      hours[j + 1].closes === hours[i].closes
    )
      j++;
    const days = i === j ? DAYS[hours[i].weekday - 1] : `${DAYS[hours[i].weekday - 1]}–${DAYS[hours[j].weekday - 1]}`;
    parts.push(`${days} ${hours[i].opens}–${hours[i].closes}`);
    i = j + 1;
  }
  return parts.join(", ").slice(0, 200);
}

/** "Open, until 21:00" / "Closed, opens tomorrow 08:00" / null when the shop hasn't set hours. */
export function openLabel(d: {
  has_hours?: boolean | null;
  open_now?: boolean | null;
  open_until?: string | null;
  opens_next?: string | null;
}) {
  if (!d.has_hours) return null;
  if (d.open_now) return { open: true, text: d.open_until ? `Open until ${d.open_until.slice(0, 5)}` : "Open now" };
  return { open: false, text: d.opens_next ? `Closed, opens ${d.opens_next}` : "Closed" };
}
