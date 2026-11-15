import { describe, expect, it } from "vitest";
import { buildNotificationEmail, buildPushPayload, safeNotificationPath } from "@/lib/notifications/format";

const base = {
  id: "3f2b8c1e-7a4d-4e1b-9c2a-5d6e7f8a9b0c",
  kind: "deal.new",
  category: "deals",
  title: "New deal at Fresh Fade",
  body: "Haircut",
  link: "/student/offers/abc",
};

describe("notification formatting", () => {
  it("keeps links inside Perqly", () => {
    expect(safeNotificationPath("/student/verify")).toBe("/student/verify");
    expect(safeNotificationPath("https://evil.example")).toBe("/account/notifications");
    expect(safeNotificationPath("//evil.example")).toBe("/account/notifications");
    expect(safeNotificationPath(null)).toBe("/account/notifications");
  });
  it("builds a push payload", () => {
    expect(buildPushPayload(base)).toEqual({
      id: base.id,
      title: base.title,
      body: "Haircut",
      url: "/student/offers/abc",
      tag: "deal.new",
    });
  });
  it("builds an escaped email with a settings link", () => {
    const email = buildNotificationEmail({ ...base, title: "<b>Hi</b>" }, "https://perqly.example/");
    expect(email.subject).toBe("<b>Hi</b>");
    expect(email.html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Hi</b>");
    expect(email.text).toContain("https://perqly.example/student/offers/abc");
    expect(email.text).toContain("https://perqly.example/account/notifications/settings");
  });
});
