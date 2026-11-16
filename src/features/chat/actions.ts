"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";

const id = z.string().uuid();

const ERRORS: Record<string, string> = {
  chat_blocked: "This business isn't taking messages from you.",
  merchant_not_found: "This business isn't on Perqly right now.",
  message_invalid: "Write a message of up to 1,000 characters.",
  rate_limited: "You're sending messages too fast. Wait a minute and try again.",
  forbidden: "You can't write in this chat.",
  not_a_student: "Set up your student profile first, then you can message businesses.",
  own_business: "This is your own business.",
};

function messageFor(error: { message?: string } | null) {
  const key = Object.keys(ERRORS).find((k) => error?.message?.includes(k));
  return key ? ERRORS[key] : "Couldn't send. Check your connection and try again.";
}

/** Student taps "Chat" on a shop: open (or reopen) the conversation and go to it. */
export async function startConversation(formData: FormData) {
  const merchantId = id.safeParse(formData.get("merchantId"));
  const back = String(formData.get("back") ?? "/student");
  if (!merchantId.success || !hasSupabaseEnv()) redirect(back);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_merchant_id: merchantId.data });
  if (error || !data) {
    const reason = error?.message?.includes("not_a_student") ? "profile" : "unavailable";
    redirect(`${back}${back.includes("?") ? "&" : "?"}chat=${reason}`);
  }
  redirect(`/student/messages/${data}`);
}

export type SendResult = { ok: true; id: string; createdAt: string } | { ok: false; error: string };

export async function sendMessage(conversationId: string, body: string): Promise<SendResult> {
  if (!id.safeParse(conversationId).success) return { ok: false, error: ERRORS.forbidden };
  const text = body.trim();
  if (text.length < 1 || text.length > 1000) return { ok: false, error: ERRORS.message_invalid };
  if (!hasSupabaseEnv()) return { ok: false, error: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", { p_conversation_id: conversationId, p_body: text });
  if (error || !data) return { ok: false, error: messageFor(error) };
  deliverNotificationsSoon();
  return { ok: true, id: data as string, createdAt: new Date().toISOString() };
}

export async function markConversationRead(conversationId: string) {
  if (!id.safeParse(conversationId).success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

export async function setConversationBlocked(formData: FormData) {
  const conversationId = id.safeParse(formData.get("conversationId"));
  if (!conversationId.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("set_conversation_blocked", {
    p_conversation_id: conversationId.data,
    p_blocked: formData.get("blocked") === "true",
  });
  revalidatePath(`/merchant/messages/${conversationId.data}`);
  revalidatePath("/merchant/messages");
}
