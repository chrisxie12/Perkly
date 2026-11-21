import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import type {
  BlockedStudent,
  Classmate,
  Friend,
  FriendChatHeader,
  FriendChatSummary,
  FriendOnDeal,
  FriendRequest,
  SharedDeal,
  SocialSettings,
} from "./schemas";

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, fallback: T): Promise<T> {
  if (!hasSupabaseEnv()) return fallback;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error || data == null) return fallback;
  return data as T;
}

export const getSocialSettings = () => rpc<SocialSettings>("get_social_settings", {}, { findable: false, share_activity: false });
export const listFriends = () => rpc<Friend[]>("list_friends", {}, []);
export const listFriendRequests = () => rpc<FriendRequest[]>("list_friend_requests", {}, []);
export const listBlockedStudents = () => rpc<BlockedStudent[]>("list_blocked_students", {}, []);
export const countFriendRequests = () => rpc<number>("count_friend_requests", {}, 0);
export const friendsOnOffer = (offerId: string) => rpc<FriendOnDeal[]>("friends_on_offer", { p_offer_id: offerId }, []);
export const friendsGoing = (postId: string) => rpc<{ user_id: string; name: string }[]>("friends_going", { p_post_id: postId }, []);
export const listSharedDeals = () => rpc<SharedDeal[]>("list_shared_deals", {}, []);
export const listFriendChats = () => rpc<FriendChatSummary[]>("list_friend_chats", {}, []);
export const getFriendChat = (id: string) => rpc<FriendChatHeader | null>("get_friend_chat", { p_chat_id: id }, null);
export const countUnreadFriendChats = () => rpc<number>("count_unread_friend_chats", {}, 0);

/** Search results, or an error code from the database (shown as a friendly message). */
export async function searchClassmates(q: string): Promise<{ results: Classmate[]; error: string | null }> {
  if (!hasSupabaseEnv()) return { results: [], error: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_classmates", { p_query: q });
  return { results: (data ?? []) as Classmate[], error: error?.message ?? null };
}

export type StudentReportRow = {
  id: string;
  reason: string;
  note: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_id: string | null;
  reported_name: string | null;
  has_chat: boolean;
};
export type StudentReportDetail = Omit<StudentReportRow, "has_chat"> & {
  staff_note: string | null;
  handled_at: string | null;
  messages: { from_reported: boolean; body: string; at: string }[];
};

export const listStudentReports = (status: string | null) => rpc<StudentReportRow[]>("list_student_reports", { p_status: status }, []);
export const getStudentReport = (id: string) => rpc<StudentReportDetail | null>("get_student_report", { p_id: id }, null);
