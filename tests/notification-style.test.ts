import { describe, expect, it } from "vitest";
import { notificationGroup, notificationIcon, notificationTag, threadText } from "@/lib/notifications/style";

describe("notification style", () => {
  it("groups kinds by type", () => {
    expect(notificationGroup("chat.message")).toBe("chat");
    expect(notificationGroup("friendchat.message")).toBe("chat");
    expect(notificationGroup("deal.new")).toBe("deal");
    expect(notificationGroup("friend.share")).toBe("deal");
    expect(notificationGroup("verification.approved")).toBe("verified");
    expect(notificationGroup("booking.confirmed")).toBe("booking");
    expect(notificationGroup("campus.post")).toBe("campus");
    expect(notificationGroup("account.suspended")).toBe("account");
    expect(notificationGroup("something.else")).toBe("general");
    expect(notificationGroup(null)).toBe("general");
  });
  it("points each type at its own picture", () => {
    expect(notificationIcon("chat")).toBe("/icons/notify/chat.png");
  });
  it("gives each chat its own thread and every other type one slot", () => {
    expect(notificationTag("chat.message", "/student/messages/a")).toBe("chat:/student/messages/a");
    expect(notificationTag("chat.message", "/student/messages/a?reply=1")).toBe("chat:/student/messages/a");
    expect(notificationTag("deal.new", "/student/offers/1")).toBe("kind:deal.new");
    expect(notificationTag(null, null)).toBe("perqly");
  });
  it("keeps the latest five lines of a thread, oldest first", () => {
    const t = threadText(["1", "2", "3", "4", "5"], "6");
    expect(t.lines).toEqual(["2", "3", "4", "5", "6"]);
    expect(t.count).toBe(6);
    expect(t.body).toBe("2\n3\n4\n5\n6");
    expect(threadText([], "hi")).toEqual({ lines: ["hi"], count: 1, body: "hi" });
  });
});
