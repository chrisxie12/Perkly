import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildDeletionConfirmationEmail, deletionBlockerText, deletionDaysLeft, deletionDueDate } from "@/features/account/deletion";

const DAY = 24 * 60 * 60 * 1000;

describe("deletion deadline", () => {
  const asked = "2026-11-01T10:00:00.000Z";
  it("is 30 days after the request", () => {
    expect(deletionDueDate(asked).toISOString()).toBe("2026-12-01T10:00:00.000Z");
  });
  it("counts down and goes negative once overdue", () => {
    const t = new Date(asked).getTime();
    expect(deletionDaysLeft(asked, t)).toBe(30);
    expect(deletionDaysLeft(asked, t + 20 * DAY)).toBe(10);
    expect(deletionDaysLeft(asked, t + 30 * DAY)).toBe(0);
    expect(deletionDaysLeft(asked, t + 31 * DAY)).toBe(-1);
  });
});

describe("blockers", () => {
  it("explains each one", () => {
    expect(deletionBlockerText("business_owner,last_club_owner")).toContain("new owner");
    expect(deletionBlockerText("business_owner,last_club_owner")).toContain("Campus club");
  });
  it("still says something for unknown codes", () => {
    expect(deletionBlockerText(undefined)).toMatch(/handed over/);
  });
});

describe("confirmation email", () => {
  const email = buildDeletionConfirmationEmail("https://perqly.online/");
  it("links to the public deletion page", () => {
    expect(email.text).toContain("https://perqly.online/delete-account");
    expect(email.html).toContain('href="https://perqly.online/delete-account"');
  });
  it("says what was deleted, what was kept and the backup period", () => {
    expect(email.subject).toBe("Your Perqly account has been deleted");
    expect(email.text).toMatch(/chats with businesses/);
    expect(email.text).toMatch(/without your name/);
    expect(email.text).toMatch(/14 days/);
  });
  it("escapes the apostrophes in its own text", () => {
    expect(email.html).not.toMatch(/business's/);
  });
});

describe("wording matches the database", () => {
  const sql = readFileSync("supabase/migrations/20261125090000_account_deletion.sql", "utf8");
  it("deletes the things the page promises", () => {
    for (const table of [
      "conversations",
      "merchant_reviews",
      "favourites",
      "friendships",
      "push_subscriptions",
      "student_profiles",
      "post_comments",
    ])
      expect(sql).toMatch(new RegExp(`delete from public\\.${table} `));
  });
  it("queues the photo buckets", () => {
    for (const bucket of ["pass-photos", "chat-photos", "verification-documents"]) expect(sql).toContain(`'${bucket}'`);
  });
});
