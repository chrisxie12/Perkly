import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GROUP_GAP_MS,
  REACTIONS,
  photoPathFor,
  place,
  seenState,
  snippet,
  tally,
  toRoomMessage,
  typingTopic,
  upsertReaction,
  type RoomMessage,
} from "@/features/chat/room/model";
import { fitWithin } from "@/features/chat/room/photo";
import { filterInbox, mergeInbox, type InboxItem } from "@/features/chat/inbox-model";

const at = (min: number) => new Date(Date.UTC(2026, 10, 21, 10, min)).toISOString();
const msg = (id: string, mine: boolean, min: number, extra: Partial<RoomMessage> = {}): RoomMessage => ({
  id,
  mine,
  body: id,
  created_at: at(min),
  reply_to: null,
  photo_path: null,
  ...extra,
});
const NOW = new Date(Date.UTC(2026, 10, 21, 12, 0)).getTime();

describe("who sent a message", () => {
  it("uses the side in business chats and the user id in friend chats", () => {
    const row = { id: "1", body: "hi", created_at: at(0), sender_side: "merchant", sender_id: "u2" };
    expect(toRoomMessage(row, { kind: "shop", side: "merchant", userId: "x" }).mine).toBe(true);
    expect(toRoomMessage(row, { kind: "shop", side: "student", userId: "x" }).mine).toBe(false);
    expect(toRoomMessage(row, { kind: "friend", userId: "u2" }).mine).toBe(true);
    expect(toRoomMessage(row, { kind: "friend", userId: "u1" }).mine).toBe(false);
  });
});

describe("grouping bubbles", () => {
  it("joins messages from the same person a few minutes apart", () => {
    const p = place([msg("a", true, 0), msg("b", true, 1), msg("c", false, 2), msg("d", false, 30)], NOW);
    expect(p.map((m) => [m.first, m.last])).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [true, true],
    ]);
    expect(GROUP_GAP_MS).toBe(300_000);
  });
  it("puts a day label on the first message of each day", () => {
    const yesterday = new Date(NOW - 86_400_000).toISOString();
    const p = place([msg("a", true, 0, { created_at: yesterday }), msg("b", true, 0), msg("c", true, 1)], NOW);
    expect(p.map((m) => m.dayLabel)).toEqual(["Yesterday", "Today", null]);
    expect(p[0].last).toBe(true);
  });
});

describe("seen receipts", () => {
  it("sits under my last message until they reply", () => {
    const list = [msg("a", false, 0), msg("b", true, 1), msg("c", true, 2)];
    expect(seenState(list, null)).toEqual({ id: "c", seen: false });
    expect(seenState(list, at(1))).toEqual({ id: "c", seen: false });
    expect(seenState(list, at(2))).toEqual({ id: "c", seen: true });
    expect(seenState([...list, msg("d", false, 3)], at(3))).toBeNull();
  });
  it("ignores messages still sending or that failed", () => {
    expect(seenState([msg("a", true, 0), msg("b", true, 1, { pending: true })], at(0))).toEqual({ id: "a", seen: true });
  });
});

describe("reactions", () => {
  it("allows the six reactions the database allows", () => {
    const sql = readFileSync("supabase/migrations/20261121120000_chat_upgrade.sql", "utf8");
    for (const e of REACTIONS) expect(sql).toContain(e);
  });
  it("keeps one per person and counts them", () => {
    let list = upsertReaction([], { message_id: "m", user_id: "me", emoji: "👍" });
    list = upsertReaction(list, { message_id: "m", user_id: "them", emoji: "👍" });
    list = upsertReaction(list, { message_id: "m", user_id: "me", emoji: "😂" });
    expect(tally(list, "m", "me")).toEqual([
      { emoji: "👍", count: 1, mine: false },
      { emoji: "😂", count: 1, mine: true },
    ]);
    list = upsertReaction(list, { message_id: "m", user_id: "me", emoji: null });
    expect(tally(list, "m", "me")).toEqual([{ emoji: "👍", count: 1, mine: false }]);
  });
});

describe("photos and typing", () => {
  it("builds upload paths the storage rules accept", () => {
    const p = photoPathFor("friend", "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "webp");
    expect(p).toMatch(/^friend\/1{8}-1{4}-4111-8111-1{12}\/2{8}-2{4}-4222-8222-2{12}\/[0-9a-f-]{36}\.webp$/);
    expect(typingTopic("shop", "abc")).toBe("chat:shop:abc");
  });
  it("shrinks big photos and leaves small ones", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("describes photo-only messages", () => {
    expect(snippet({ body: "", photo_path: "x" })).toBe("Photo");
    expect(snippet(undefined)).toBe("Message not available");
    expect(snippet({ body: "a".repeat(100), photo_path: null })).toHaveLength(80);
  });
});

describe("one inbox", () => {
  const item = (key: string, kind: "shop" | "friend", title: string, min: number, unread = 0): InboxItem => ({
    key,
    kind,
    title,
    href: "/",
    photo: null,
    preview: "hello",
    fromMe: false,
    at: at(min),
    unread,
    closed: false,
  });
  const items = mergeInbox([item("s1", "shop", "StudaData", 5, 2)], [item("f1", "friend", "Kojo", 9), item("f2", "friend", "Ama", 1)]);
  it("puts friends and businesses together, newest first", () => {
    expect(items.map((i) => i.key)).toEqual(["f1", "s1", "f2"]);
  });
  it("filters and searches", () => {
    expect(filterInbox(items, "unread", "").map((i) => i.key)).toEqual(["s1"]);
    expect(filterInbox(items, "friend", "").map((i) => i.key)).toEqual(["f1", "f2"]);
    expect(filterInbox(items, "all", "stud").map((i) => i.key)).toEqual(["s1"]);
    expect(filterInbox(items, "shop", "kojo")).toEqual([]);
  });
});
