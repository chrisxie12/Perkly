import { describe, expect, it } from "vitest";
import { percentOff, postedLabel } from "@/features/students/app/format";

const now = new Date("2026-11-23T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe("postedLabel", () => {
  it("says today, yesterday and days", () => {
    expect(postedLabel(ago(0), now)).toBe("Posted today");
    expect(postedLabel(ago(1), now)).toBe("Posted yesterday");
    expect(postedLabel(ago(4), now)).toBe("Posted 4 days ago");
  });
  it("switches to weeks, then drops old dates", () => {
    expect(postedLabel(ago(8), now)).toBe("Posted last week");
    expect(postedLabel(ago(21), now)).toBe("Posted 3 weeks ago");
    expect(postedLabel(ago(70), now)).toBeNull();
  });
  it("ignores missing, broken and future dates", () => {
    expect(postedLabel(null, now)).toBeNull();
    expect(postedLabel("nope", now)).toBeNull();
    expect(postedLabel(ago(-2), now)).toBeNull();
  });
});

describe("percentOff", () => {
  it("rounds to a whole number", () => {
    expect(percentOff(25, 20)).toBe(20);
    expect(percentOff(30, 20)).toBe(33);
  });
  it("shows at least 1% for a tiny saving", () => expect(percentOff(1000, 999)).toBe(1));
  it("is null with no saving or no price", () => {
    expect(percentOff(20, 20)).toBeNull();
    expect(percentOff(0, 0)).toBeNull();
  });
});
