import { describe, expect, it } from "vitest";
import { showsTopBar } from "@/components/layout/frame-chrome";

describe("student top bar and tabs", () => {
  it("shows on the main pages", () => {
    for (const p of ["/student", "/student/map", "/student/history", "/student/campus", "/student/messages", "/student/me"]) {
      expect(showsTopBar("student", p)).toBe(true);
    }
  });
  it("steps aside on pages opened from them", () => {
    for (const p of [
      "/student/messages/0b7e",
      "/student/friends/chat/0b7e",
      "/student/offers/0b7e",
      "/student/merchants/studadata",
      "/student/campus/tickets/0b7e",
    ]) {
      expect(showsTopBar("student", p)).toBe(false);
    }
  });
  it("leaves other areas alone", () => {
    expect(showsTopBar("merchant", "/merchant/messages/0b7e")).toBe(true);
  });
});
