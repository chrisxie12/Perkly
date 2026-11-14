import { describe, expect, it } from "vitest";
import { openLabel, parseHours, summariseHours } from "@/features/merchants/hours";
import { initials, walkLabel } from "@/features/students/app/format";

describe("opening hours", () => {
  it("accepts a valid week and rejects bad input", () => {
    expect(parseHours('[{"weekday":1,"opens":"08:00","closes":"20:00"}]')).toEqual([{ weekday: 1, opens: "08:00", closes: "20:00" }]);
    expect(parseHours("")).toEqual([]);
    expect(parseHours('[{"weekday":8,"opens":"08:00","closes":"20:00"}]')).toBeNull();
    expect(parseHours('[{"weekday":1,"opens":"08:00","closes":"08:00"}]')).toBeNull();
    expect(parseHours('[{"weekday":1,"opens":"8am","closes":"20:00"}]')).toBeNull();
    expect(parseHours("not json")).toBeNull();
  });
  it("summarises runs of days with the same hours", () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens: "08:00", closes: "20:00" }));
    expect(summariseHours([...week, { weekday: 6, opens: "09:00", closes: "14:00" }])).toBe("Mon–Fri 08:00–20:00, Sat 09:00–14:00");
    expect(summariseHours([])).toBeNull();
  });
  it("says nothing when a shop hasn't set hours", () => {
    expect(openLabel({ has_hours: false })).toBeNull();
    expect(openLabel({ has_hours: true, open_now: true, open_until: "21:00:00" })).toEqual({ open: true, text: "Open until 21:00" });
    expect(openLabel({ has_hours: true, open_now: false, opens_next: "tomorrow 08:00" })).toEqual({
      open: false,
      text: "Closed, opens tomorrow 08:00",
    });
  });
});

describe("student app labels", () => {
  it("shows walking time only when both places are known", () => {
    expect(walkLabel(null)).toBeNull();
    expect(walkLabel(160)).toBe("2 min walk");
    expect(walkLabel(5000)).toBe("5.0 km away");
  });
  it("makes initials from the real business name", () => {
    expect(initials("Fresh Fade Barbers")).toBe("FF");
    expect(initials("Auntie Esi's Waakye")).toBe("AE");
  });
});
