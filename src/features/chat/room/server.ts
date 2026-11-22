import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { toRoomMessage, type RoomKind, type RoomMe, type RoomMessage, type RoomReaction } from "./model";

const TABLES = {
  shop: { messages: "messages", chatColumn: "conversation_id", sender: "sender_side", reactions: "message_reactions" },
  friend: { messages: "friend_messages", chatColumn: "chat_id", sender: "sender_id", reactions: "friend_message_reactions" },
} as const;

/** Photos stay private; links last an hour, long enough for a chat session. */
export const PHOTO_URL_SECONDS = 3600;

/** The latest 200 messages (oldest first), their reactions and photo links. Row security limits it to the chat's people. */
export async function loadRoom(kind: RoomKind, chatId: string, me: RoomMe) {
  const empty = { messages: [] as RoomMessage[], reactions: [] as RoomReaction[] };
  if (!hasSupabaseEnv()) return empty;
  const t = TABLES[kind];
  const supabase = await createClient();
  const { data } = await supabase
    .from(t.messages)
    .select(`id, ${t.sender}, body, created_at, reply_to, photo_path`)
    .eq(t.chatColumn, chatId)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as unknown as Parameters<typeof toRoomMessage>[0][]).reverse();
  const messages = rows.map((r) => toRoomMessage(r, me));
  if (messages.length === 0) return empty;

  const [reactionsRes, signed] = await Promise.all([
    supabase
      .from(t.reactions)
      .select("message_id, user_id, emoji")
      .in(
        "message_id",
        messages.map((m) => m.id),
      )
      .not("emoji", "is", null),
    signPhotos(messages.flatMap((m) => (m.photo_path ? [m.photo_path] : []))),
  ]);
  for (const m of messages) if (m.photo_path) m.photo_url = signed.get(m.photo_path) ?? null;
  return { messages, reactions: (reactionsRes.data ?? []) as RoomReaction[] };
}

async function signPhotos(paths: string[]) {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("chat-photos").createSignedUrls(paths, PHOTO_URL_SECONDS);
  for (const s of data ?? []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl);
  return out;
}

export type ChatPref = { kind: RoomKind; chat_id: string; muted: boolean; archived_at: string | null };

/** My mute and archive settings for every chat that has any. */
export async function getMyChatPrefs(): Promise<ChatPref[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("chat_prefs").select("kind, chat_id, muted, archived_at");
  return (data ?? []) as ChatPref[];
}

/** My settings for one chat. */
export async function getChatPref(kind: RoomKind, chatId: string) {
  if (!hasSupabaseEnv()) return { muted: false, archived: false };
  const supabase = await createClient();
  const { data } = await supabase.from("chat_prefs").select("muted, archived_at").eq("kind", kind).eq("chat_id", chatId).maybeSingle();
  return { muted: Boolean(data?.muted), archived: Boolean(data?.archived_at) };
}
