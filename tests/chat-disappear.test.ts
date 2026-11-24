import { describe, expect, it } from "vitest";
import { disappearText, isLive, nextExpiry, toRoomMessage, type RoomMessage } from "@/features/chat/room/model";

const now = Date.parse("2026-11-26T12:00:00Z");
const msg = (over: Partial<RoomMessage>): RoomMessage => ({
  id: "m",
  mine: false,
  body: "hi",
  created_at: "2026-11-26T11:00:00Z",
  reply_to: null,
  photo_path: null,
  ...over,
});

describe("disappearing friend-chat messages", () => {
  it("keeps a message until it expires", () => {
    expect(isLive(msg({ expires_at: "2026-11-26T12:00:01Z" }), now)).toBe(true);
    expect(isLive(msg({ expires_at: "2026-11-26T12:00:00Z" }), now)).toBe(false);
  });
  it("keeps pinned messages and business-chat messages (no expiry)", () => {
    expect(isLive(msg({ expires_at: "2026-11-26T10:00:00Z", pinned_at: "2026-11-26T10:30:00Z" }), now)).toBe(true);
    expect(isLive(msg({}), now)).toBe(true);
  });
  it("finds the next message due to go, ignoring pinned and past ones", () => {
    const list = [
      msg({ id: "a", expires_at: "2026-11-26T15:00:00Z" }),
      msg({ id: "b", expires_at: "2026-11-26T13:00:00Z", pinned_at: "x" }),
      msg({ id: "c", expires_at: "2026-11-26T14:00:00Z" }),
      msg({ id: "d", expires_at: "2026-11-26T11:00:00Z" }),
    ];
    expect(nextExpiry(list, now)).toBe(Date.parse("2026-11-26T14:00:00Z"));
    expect(nextExpiry([msg({})], now)).toBeNull();
  });
  it("reads expiry and view-once from a row", () => {
    const m = toRoomMessage(
      { id: "x", body: "b", created_at: "t", sender_id: "u", expires_at: "2026-11-27T00:00:00Z", once: true },
      { kind: "friend", userId: "u" },
    );
    expect(m).toMatchObject({ mine: true, expires_at: "2026-11-27T00:00:00Z", once: true });
  });
  it("explains each setting", () => {
    expect(disappearText("12h")).toMatch(/12 hours after they're sent/);
    expect(disappearText("seen")).toMatch(/opened/);
  });
});
