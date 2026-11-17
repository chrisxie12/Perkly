import { describe, expect, it } from "vitest";
import {
  badgeLabel,
  campusErrorMessage,
  decodeCursor,
  encodeCursor,
  isPinnedNow,
  isScheduled,
  nextCursor,
  parseScheduleTime,
  postFormSchema,
} from "@/features/campus/schemas";

const ORG = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const PATH = `${ORG}/${ORG}/post/${ID}.jpg`;

describe("campus cursors", () => {
  it("round-trips (publish_at, id)", () => {
    const c = encodeCursor("2026-11-17T10:00:00.123456+00:00", ID);
    expect(decodeCursor(c)).toEqual({ at: "2026-11-17T10:00:00.123456+00:00", id: ID });
  });
  it("rejects anything that isn't a cursor", () => {
    expect(decodeCursor("not base64 json")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ at: "yesterday", id: ID })).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ at: "2026-11-17T10:00:00Z", id: "x" })).toString("base64url"))).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor(["a"])).toBeNull();
  });
  it("gives a next cursor only for a full page, from its last row", () => {
    const page = Array.from({ length: 30 }, (_, i) => ({ publish_at: `2026-11-17T10:${String(59 - i).padStart(2, "0")}:00Z`, id: ID }));
    expect(decodeCursor(nextCursor(page))).toEqual({ at: page[29].publish_at, id: ID });
    expect(nextCursor(page.slice(0, 29))).toBeNull();
  });
});

describe("post form", () => {
  const base = { organisationId: ORG, kind: "campus_news", title: "Elections", body: "Nominations open.", media: [] };
  it("accepts a valid post", () => {
    expect(postFormSchema.safeParse(base).success).toBe(true);
  });
  it("accepts only https links", () => {
    expect(postFormSchema.safeParse({ ...base, linkUrl: "http://x.example" }).success).toBe(false);
    expect(postFormSchema.safeParse({ ...base, videoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(postFormSchema.safeParse({ ...base, linkUrl: "https://x.example/a" }).success).toBe(true);
  });
  it("accepts only campus-media paths, at most 6", () => {
    expect(postFormSchema.safeParse({ ...base, media: [PATH] }).success).toBe(true);
    expect(postFormSchema.safeParse({ ...base, media: ["../pass-photos/x.jpg"] }).success).toBe(false);
    expect(postFormSchema.safeParse({ ...base, media: Array(7).fill(PATH) }).success).toBe(false);
  });
  it("refuses unknown kinds", () => {
    expect(postFormSchema.safeParse({ ...base, kind: "advert" }).success).toBe(false);
  });
});

describe("schedule times (Ghana time = UTC)", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  it("reads the typed wall-clock time as UTC", () => {
    expect(parseScheduleTime("2026-11-18T08:00", now)).toEqual({ ok: true, iso: "2026-11-18T08:00:00.000Z" });
  });
  it("refuses the past, more than 60 days ahead, and junk", () => {
    expect(parseScheduleTime("2026-11-17T09:00", now).ok).toBe(false);
    expect(parseScheduleTime("2027-02-01T08:00", now).ok).toBe(false);
    expect(parseScheduleTime("tomorrow", now).ok).toBe(false);
  });
});

describe("badges and messages", () => {
  it("names the two badges and nothing for unverified", () => {
    expect(badgeLabel("verified")).toBe("Verified organisation");
    expect(badgeLabel("university_official")).toBe("University official");
    expect(badgeLabel(null)).toBeNull();
  });
  it("maps database codes to sentences, longest code first", () => {
    expect(campusErrorMessage("post_not_found")).toBe("This post isn't available.");
    expect(campusErrorMessage("not_found")).toBe("This isn't available to you.");
    expect(campusErrorMessage("ERROR: campus_disabled")).toBe("Campus isn't available yet.");
    expect(campusErrorMessage("something unexpected")).toBe("Something went wrong. Try again.");
  });
  it("knows when a post is scheduled or pinned", () => {
    const now = Date.parse("2026-11-17T10:00:00Z");
    expect(isScheduled("2026-11-17T11:00:00Z", now)).toBe(true);
    expect(isScheduled("2026-11-17T09:00:00Z", now)).toBe(false);
    expect(isPinnedNow("2026-11-18T00:00:00Z", now)).toBe(true);
    expect(isPinnedNow(null, now)).toBe(false);
  });
});
