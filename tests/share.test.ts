import { describe, expect, it } from "vitest";
import { draftFrom, perqlyPath, sharedMessage, SHARE_LIMIT } from "@/features/share/model";

describe("sharedMessage", () => {
  it("joins title, text and link", () => {
    expect(sharedMessage({ title: "Waakye deal", text: "Look at this", url: "https://perqly.online/student/offers/1" })).toBe(
      "Waakye deal\nLook at this\nhttps://perqly.online/student/offers/1",
    );
  });
  it("doesn't repeat a link or title already in the text", () => {
    expect(sharedMessage({ title: "Deal", text: "Deal: https://x.example/a", url: "https://x.example/a" })).toBe(
      "Deal: https://x.example/a",
    );
  });
  it("ignores missing and non-text values", () => {
    expect(sharedMessage({ title: undefined, text: 42, url: ["a"] })).toBe("");
  });
  it("removes control characters and caps the length", () => {
    expect(sharedMessage({ text: "hi\u0000 there" })).toBe("hi there");
    expect(sharedMessage({ text: "a".repeat(5000) })).toHaveLength(SHARE_LIMIT);
  });
});

describe("draftFrom", () => {
  it("keeps plain text and newlines", () => {
    expect(draftFrom("line one\nline two")).toBe("line one\nline two");
  });
  it("caps and handles junk", () => {
    expect(draftFrom("b".repeat(2000))).toHaveLength(SHARE_LIMIT);
    expect(draftFrom(null)).toBe("");
  });
});

describe("perqlyPath", () => {
  const site = "https://perqly.online";
  it("finds a Perqly deal link", () => {
    expect(perqlyPath("check https://perqly.online/student/offers/abc?x=1 now", site)).toBe("/student/offers/abc?x=1");
  });
  it("ignores other sites, even ones that look similar", () => {
    expect(perqlyPath("https://perqly.online.evil.example/student", site)).toBeNull();
    expect(perqlyPath("https://example.com/student", site)).toBeNull();
  });
  it("ignores Perqly pages that aren't for opening from a share", () => {
    expect(perqlyPath("https://perqly.online/admin/users", site)).toBeNull();
  });
  it("copes with a bad site URL", () => {
    expect(perqlyPath("https://perqly.online/student", "not a url")).toBeNull();
  });
});
