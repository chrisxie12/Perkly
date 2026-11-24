/** Shared model for business chats ("shop") and friend chats ("friend"). Safe on server and client. */

export type RoomKind = "shop" | "friend";

export type RoomMessage = {
  id: string;
  mine: boolean;
  body: string;
  created_at: string;
  reply_to: string | null;
  photo_path: string | null;
  /** Set while the message is pinned in the chat. */
  pinned_at?: string | null;
  /** Friend chats: when it disappears (pinned messages stay), and whether it goes once seen. */
  expires_at?: string | null;
  once?: boolean;
  /** A short-lived signed URL for the photo, when there is one. */
  photo_url?: string | null;
  pending?: boolean;
  failed?: boolean;
};

/** One person's reaction. `emoji` is null once they take it back. */
export type RoomReaction = { message_id: string; user_id: string; emoji: string | null };

/** Who "me" is in this chat: the side for a business chat, the user id for a friend chat. */
export type RoomMe = { kind: "shop"; side: "student" | "merchant"; userId: string } | { kind: "friend"; userId: string };

type RawRow = {
  id: string;
  body: string;
  created_at: string;
  reply_to?: string | null;
  photo_path?: string | null;
  sender_side?: string | null;
  sender_id?: string | null;
  pinned_at?: string | null;
  expires_at?: string | null;
  once?: boolean | null;
};

export function toRoomMessage(row: RawRow, me: RoomMe): RoomMessage {
  const mine = me.kind === "shop" ? row.sender_side === me.side : row.sender_id === me.userId;
  return {
    id: row.id,
    mine,
    body: row.body ?? "",
    created_at: row.created_at,
    reply_to: row.reply_to ?? null,
    photo_path: row.photo_path ?? null,
    pinned_at: row.pinned_at ?? null,
    expires_at: row.expires_at ?? null,
    once: Boolean(row.once),
  };
}

/** Whether a message is still in the chat: pinned ones stay; the rest go when they expire. */
export function isLive(m: Pick<RoomMessage, "pinned_at" | "expires_at">, now = Date.now()) {
  return Boolean(m.pinned_at) || !m.expires_at || new Date(m.expires_at).getTime() > now;
}

/** The next moment a shown message is due to disappear, so the room can drop it then. */
export function nextExpiry(messages: RoomMessage[], now = Date.now()) {
  let next: number | null = null;
  for (const m of messages) {
    if (m.pinned_at || !m.expires_at) continue;
    const t = new Date(m.expires_at).getTime();
    if (t > now && (next === null || t < next)) next = t;
  }
  return next;
}

export type DisappearMode = "24h" | "12h" | "seen";

export const DISAPPEAR_OPTIONS: { value: DisappearMode; label: string; detail: string }[] = [
  { value: "24h", label: "24 hours", detail: "Messages disappear 24 hours after they're sent." },
  { value: "12h", label: "12 hours", detail: "Messages disappear 12 hours after they're sent." },
  { value: "seen", label: "After viewing", detail: "Messages disappear once they've been opened and the chat is closed." },
];

export function disappearText(mode: DisappearMode) {
  return (DISAPPEAR_OPTIONS.find((o) => o.value === mode) ?? DISAPPEAR_OPTIONS[0]).detail;
}

/** The most recently pinned message, shown under the chat's header. */
export function latestPin(messages: RoomMessage[]) {
  return messages.filter((m) => m.pinned_at).sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime())[0];
}

export function photoPathFor(kind: RoomKind, chatId: string, userId: string, ext: "webp" | "jpg" | "png") {
  return `${kind}/${chatId}/${userId}/${crypto.randomUUID()}.${ext}`;
}

/** The realtime channel used for typing signals. Must match private.can_use_chat_topic. */
export const typingTopic = (kind: RoomKind, chatId: string) => `chat:${kind}:${chatId}`;

/** Messages from the same person within five minutes sit together as one group. */
export const GROUP_GAP_MS = 5 * 60_000;

export type Placed = RoomMessage & { first: boolean; last: boolean; dayLabel: string | null };

const ghanaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const dayFmt = new Intl.DateTimeFormat("en-GH", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });

export function dayLabel(iso: string, now = Date.now()) {
  const d = new Date(iso);
  if (ghanaDay(d) === ghanaDay(new Date(now))) return "Today";
  if (ghanaDay(d) === ghanaDay(new Date(now - 86_400_000))) return "Yesterday";
  return dayFmt.format(d);
}

/** Works out day dividers and where each bubble group starts and ends. */
export function place(messages: RoomMessage[], now = Date.now()): Placed[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const label = dayLabel(m.created_at, now);
    const newDay = !prev || dayLabel(prev.created_at, now) !== label;
    const joinsPrev = !!prev && !newDay && prev.mine === m.mine && gap(prev, m) < GROUP_GAP_MS;
    const joinsNext = !!next && dayLabel(next.created_at, now) === label && next.mine === m.mine && gap(m, next) < GROUP_GAP_MS;
    return { ...m, first: !joinsPrev, last: !joinsNext, dayLabel: newDay ? label : null };
  });
}

const gap = (a: RoomMessage, b: RoomMessage) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

/** The id of my latest sent message, and whether the other person has read it. */
export function seenState(messages: RoomMessage[], otherReadAt: string | null) {
  const last = [...messages].reverse().find((m) => m.mine && !m.pending && !m.failed);
  if (!last) return null;
  // Nothing from them since: the receipt goes under my last message.
  const lastIndex = messages.lastIndexOf(last);
  if (messages.slice(lastIndex + 1).some((m) => !m.mine)) return null;
  const seen = !!otherReadAt && new Date(otherReadAt).getTime() >= new Date(last.created_at).getTime();
  return { id: last.id, seen };
}

/** Reactions on one message, counted per emoji, with whether I'm among them. */
export function tally(reactions: RoomReaction[], messageId: string, myId: string) {
  const out = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    if (r.message_id !== messageId || !r.emoji) continue;
    const t = out.get(r.emoji) ?? { count: 0, mine: false };
    t.count += 1;
    t.mine ||= r.user_id === myId;
    out.set(r.emoji, t);
  }
  return [...out.entries()].map(([emoji, t]) => ({ emoji, ...t }));
}

/** Replace or add one reaction (one per person per message). */
export function upsertReaction(list: RoomReaction[], r: RoomReaction) {
  const rest = list.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id));
  return r.emoji ? [...rest, r] : rest;
}

/** The text to show for a message inside a reply quote or the inbox. */
export function snippet(m: Pick<RoomMessage, "body" | "photo_path"> | undefined) {
  if (!m) return "Message not available";
  const text = m.body.trim();
  if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  return m.photo_path ? "Photo" : "";
}
