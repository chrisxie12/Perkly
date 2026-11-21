import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";

export type ChatSide = "student" | "merchant";

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
  /** When the other side last opened the chat (for "Seen"). */
  other_read_at?: string | null;
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

export async function countUnreadChats(merchantId?: string) {
  if (!hasSupabaseEnv()) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_unread_chats", merchantId ? { p_merchant_id: merchantId } : {});
  return typeof data === "number" ? data : 0;
}
