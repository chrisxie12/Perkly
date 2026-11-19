import { z } from "zod";

/** Friends: students at the same school (see supabase/migrations/20261120090000_friends.sql). */

export type Relation = "none" | "requested" | "incoming" | "friends";

export type Classmate = { user_id: string; name: string; programme: string | null; level: string | null; relation: Relation };
export type Friend = { user_id: string; name: string; programme: string | null; level: string | null; since: string };
export type FriendRequest = {
  user_id: string;
  name: string;
  programme: string | null;
  direction: "incoming" | "outgoing";
  created_at: string;
};
export type BlockedStudent = { user_id: string; name: string; blocked_at: string };
export type SocialSettings = { findable: boolean; share_activity: boolean };
export type FriendOnDeal = { user_id: string; name: string; kind: "used" | "saved" };
export type SharedDeal = {
  id: string;
  offer_id: string;
  offer_title: string;
  merchant_name: string;
  sender_id: string;
  sender_name: string;
  note: string | null;
  created_at: string;
  seen: boolean;
  live: boolean;
};
export type FriendChatSummary = {
  id: string;
  friend_id: string;
  friend_name: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_from_me: boolean;
  unread: number;
  can_send: boolean;
};
export type FriendChatHeader = { id: string; friend_id: string; friend_name: string; can_send: boolean; blocked: boolean };
export type FriendMessage = { id: string; sender_id: string | null; body: string; created_at: string };

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "spam", label: "Spam or scams" },
  { value: "fake_profile", label: "Pretending to be someone else" },
  { value: "inappropriate", label: "Inappropriate messages" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const searchSchema = z.object({ q: z.string().trim().min(2, "Type at least 2 letters").max(60, "Keep it under 60 letters") });
export const shareSchema = z.object({
  friendId: z.string().uuid("Choose a friend"),
  offerId: z.string().uuid(),
  note: z.string().trim().max(140, "Keep the note under 140 characters").optional(),
});
export const reportSchema = z.object({
  userId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [ReportReason, ...ReportReason[]], { message: "Choose a reason" }),
  note: z.string().trim().max(500, "Keep it under 500 characters").optional(),
  chatId: z.string().uuid().optional(),
});

const ERRORS: Record<string, string> = {
  not_verified: "Get verified first. Friends are for verified students.",
  verification_expired: "Your verification has expired. Renew it to use Friends.",
  account_suspended: "Your account is suspended.",
  student_not_found: "That student can't be added right now.",
  request_not_found: "That request is no longer there.",
  not_friends: "You can only do this with friends.",
  offer_not_found: "This deal isn't available for your friend right now.",
  note_invalid: "Keep the note under 140 characters.",
  message_invalid: "Write a message of up to 1,000 characters.",
  query_invalid: "Type 2 to 60 letters of a name.",
  reason_invalid: "Choose a reason.",
  rate_limited: "You're doing that too fast. Wait a little and try again.",
  forbidden: "You can't do that.",
};

export function friendsErrorMessage(message?: string | null) {
  const key = Object.keys(ERRORS).find((k) => message?.includes(k));
  return key ? ERRORS[key] : "Something went wrong. Check your connection and try again.";
}
