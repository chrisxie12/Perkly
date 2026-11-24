import { describe, expect, it, vi } from "vitest";
import { EDGE, isOpenSwipe } from "@/components/layout/profile-drawer-gesture";

vi.mock("server-only", () => ({}));
const { shortDistance } = await import("@/features/students/app/deal-card");

const W = 390;
const at = (x: number, y = 400, blocked = false) => ({ x, y, blocked });

describe("swipe right to open the profile panel", () => {
  it("opens on a clear sideways swipe to the right", () => {
    expect(isOpenSwipe(at(80), { x: 200, y: 410 }, W)).toBe(true);
  });
  it("ignores short or mostly-vertical moves (scrolling the page)", () => {
    expect(isOpenSwipe(at(80), { x: 130, y: 400 }, W)).toBe(false);
    expect(isOpenSwipe(at(80), { x: 200, y: 520 }, W)).toBe(false);
  });
  it("ignores swipes to the left", () => {
    expect(isOpenSwipe(at(300), { x: 100, y: 400 }, W)).toBe(false);
  });
  it("leaves the screen edges to Android's back gesture", () => {
    expect(isOpenSwipe(at(EDGE - 1), { x: 200, y: 400 }, W)).toBe(false);
    expect(isOpenSwipe(at(W - EDGE + 1), { x: W, y: 400 }, W)).toBe(false);
  });
  it("leaves sideways rows and text fields alone", () => {
    expect(isOpenSwipe(at(80, 400, true), { x: 250, y: 400 }, W)).toBe(false);
  });
});

describe("shortDistance", () => {
  it("shows metres under a kilometre and one decimal above", () => {
    expect(shortDistance(347)).toBe("350 m");
    expect(shortDistance(4)).toBe("10 m");
    expect(shortDistance(1234)).toBe("1.2 km");
    expect(shortDistance(null)).toBeNull();
  });
});
