"use server";

import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";
import { REACTIONS, type RoomKind } from "./model";

const uuid = z.string().uuid();
const kind = z.enum(["shop", "friend"]);
const photoPath = z
  .string()
  .regex(/^(shop|friend)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png)$/)
  .nullable();

const ERRORS: Record<string, string> = {
  chat_blocked: "This business isn't taking messages from you.",
  not_friends: "You can only message friends. This chat is closed.",
  message_invalid: "Write a message of up to 1,000 characters.",
  reply_invalid: "That message can't be replied to any more.",
  photo_invalid: "That photo didn't upload. Try again.",
  reaction_invalid: "Pick one of the reactions shown.",
  rate_limited: "You're going too fast. Wait a minute and try again.",
  forbidden: "You can't write in this chat.",
  not_a_student: "Set up your student profile first, then you can message businesses.",
};

function messageFor(error: { message?: string } | null) {
  const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
  return key ? ERRORS[key] : "Couldn't send. Check your connection and try again.";
}

export type RoomSendResult = { ok: true; id: string; createdAt: string } | { ok: false; error: string };

export async function sendRoomMessage(
  k: RoomKind,
  chatId: string,
  body: string,
  replyTo: string | null,
  photo: string | null,
): Promise<RoomSendResult> {
  if (!kind.safeParse(k).success || !uuid.safeParse(chatId).success) return { ok: false, error: ERRORS.forbidden };
  if (replyTo !== null && !uuid.safeParse(replyTo).success) return { ok: false, error: ERRORS.reply_invalid };
  if (!photoPath.safeParse(photo).success) return { ok: false, error: ERRORS.photo_invalid };
  const text = body.trim();
  if (text.length > 1000 || (text.length === 0 && !photo)) return { ok: false, error: ERRORS.message_invalid };
  if (!hasSupabaseEnv()) return { ok: false, error: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { data, error } =
    k === "shop"
      ? await supabase.rpc("send_message", { p_conversation_id: chatId, p_body: text, p_reply_to: replyTo, p_photo_path: photo })
      : await supabase.rpc("send_friend_message", { p_chat_id: chatId, p_body: text, p_reply_to: replyTo, p_photo_path: photo });
  if (error || !data) return { ok: false, error: messageFor(error) };
  deliverNotificationsSoon();
  return { ok: true, id: data as string, createdAt: new Date().toISOString() };
}

export async function reactInRoom(k: RoomKind, messageId: string, emoji: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!kind.safeParse(k).success || !uuid.safeParse(messageId).success) return { ok: false, error: ERRORS.forbidden };
  if (emoji !== null && !(REACTIONS as readonly string[]).includes(emoji)) return { ok: false, error: ERRORS.reaction_invalid };
  if (!hasSupabaseEnv()) return { ok: false, error: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(k === "shop" ? "react_to_message" : "react_to_friend_message", {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  return error ? { ok: false, error: messageFor(error) } : { ok: true };
}

export async function markRoomRead(k: RoomKind, chatId: string) {
  if (!kind.safeParse(k).success || !uuid.safeParse(chatId).success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  if (k === "shop") await supabase.rpc("mark_conversation_read", { p_conversation_id: chatId });
  else await supabase.rpc("mark_friend_chat_read", { p_chat_id: chatId });
}

/** Mute or archive a chat for yourself. Pass null to leave a setting as it is. */
export async function setChatPref(k: RoomKind, chatId: string, muted: boolean | null, archived: boolean | null) {
  if (!kind.safeParse(k).success || !uuid.safeParse(chatId).success || !hasSupabaseEnv()) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chat_pref", { p_kind: k, p_chat_id: chatId, p_muted: muted, p_archived: archived });
  return { ok: !error };
}

const REPORT_REASONS = ["spam", "rude", "scam", "other"] as const;

/** Report a chat to Perqly support. */
export async function reportChat(k: RoomKind, chatId: string, reason: string, details: string): Promise<{ ok: boolean; error?: string }> {
  if (!kind.safeParse(k).success || !uuid.safeParse(chatId).success) return { ok: false, error: ERRORS.forbidden };
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Choose what's wrong." };
  if (details.trim().length > 1000) return { ok: false, error: "Keep the details under 1,000 characters." };
  if (!hasSupabaseEnv()) return { ok: false, error: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_chat", {
    p_kind: k,
    p_chat_id: chatId,
    p_reason: reason,
    p_details: details.trim() || null,
  });
  if (!error) return { ok: true };
  if (error.message.includes("rate_limited")) return { ok: false, error: "You've sent several reports today. Try again tomorrow." };
  return { ok: false, error: "That didn't send. Try again." };
}
