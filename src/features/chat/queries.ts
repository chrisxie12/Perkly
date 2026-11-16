import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";

export type ChatSide = "student" | "merchant";

export type ChatMessage = { id: string; sender_side: ChatSide; body: string; created_at: string };

export type ConversationSummary = {
  id: string;
  title: string;
  href: string;
  /** Set on the student side. */
  merchant_id?: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_sender: ChatSide | null;
  unread: number;
  blocked: boolean;
};

export type ConversationHeader = {
  id: string;
  side: ChatSide;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  merchant_phone: string | null;
  merchant_whatsapp: string | null;
  student_name: string | null;
  blocked: boolean;
};

export async function listMyConversations(): Promise<ConversationSummary[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_my_conversations");
  return ((data ?? []) as (Omit<ConversationSummary, "title" | "href"> & { merchant_name: string })[]).map((c) => ({
    ...c,
    title: c.merchant_name,
    href: `/student/messages/${c.id}`,
  }));
}

export async function listMerchantConversations(merchantId: string): Promise<ConversationSummary[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_merchant_conversations", { p_merchant_id: merchantId });
  return ((data ?? []) as (Omit<ConversationSummary, "title" | "href"> & { student_name: string })[]).map((c) => ({
    ...c,
    title: c.student_name,
    href: `/merchant/messages/${c.id}`,
  }));
}

export async function getConversation(id: string) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_conversation", { p_conversation_id: id });
  return (data as ConversationHeader | null) ?? null;
}

/** The latest 200 messages, oldest first. */
export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_side, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as ChatMessage[]).reverse();
}

export async function countUnreadChats(merchantId?: string) {
  if (!hasSupabaseEnv()) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_unread_chats", merchantId ? { p_merchant_id: merchantId } : {});
  return typeof data === "number" ? data : 0;
}
