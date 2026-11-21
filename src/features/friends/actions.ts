"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { friendsErrorMessage, reportSchema, shareSchema } from "./schemas";

const uuid = z.string().uuid();
const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

function refresh() {
  revalidatePath("/student/friends", "layout");
}

async function call(fn: string, args: Record<string, unknown>): Promise<FormState> {
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { status: "error", message: friendsErrorMessage(error.message) };
  refresh();
  return { status: "success" };
}

export async function setSocialSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await call("set_social_settings", {
    p_findable: formData.get("findable") === "on",
    p_share_activity: formData.get("share_activity") === "on",
  });
  return result.status === "success" ? { status: "success", message: "Saved." } : result;
}

/** One action for the small buttons on a student row: add, accept, decline, cancel, remove, block, unblock. */
export async function friendAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = uuid.safeParse(formData.get("userId"));
  if (!userId.success) return { status: "error", message: friendsErrorMessage("student_not_found") };
  const p = { p_user_id: userId.data };
  let result: FormState;
  switch (formData.get("op")) {
    case "add":
      result = await call("send_friend_request", p);
      break;
    case "accept":
      result = await call("respond_friend_request", { ...p, p_accept: true });
      break;
    case "decline":
      result = await call("respond_friend_request", { ...p, p_accept: false });
      break;
    case "remove":
      result = await call("remove_friend", p);
      break;
    case "block":
      result = await call("block_student", p);
      break;
    case "unblock":
      result = await call("unblock_student", p);
      break;
    default:
      return { status: "error", message: "Unknown action." };
  }
  if (result.status === "success") deliverNotificationsSoon();
  return result;
}

export async function shareDeal(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = shareSchema.safeParse({
    friendId: text(formData.get("friendId")),
    offerId: text(formData.get("offerId")),
    note: text(formData.get("note")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const result = await call("share_deal", {
    p_user_id: parsed.data.friendId,
    p_offer_id: parsed.data.offerId,
    p_note: parsed.data.note ?? null,
  });
  if (result.status !== "success") return result;
  deliverNotificationsSoon();
  return { status: "success", message: "Sent to your friend." };
}

export async function markSharedDealsSeen() {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("mark_shared_deals_seen");
}

export async function reportStudent(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = reportSchema.safeParse({
    userId: text(formData.get("userId")),
    reason: text(formData.get("reason")),
    note: text(formData.get("note")),
    chatId: text(formData.get("chatId")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const result = await call("report_student", {
    p_user_id: d.userId,
    p_reason: d.reason,
    p_note: d.note ?? null,
    p_chat_id: d.chatId ?? null,
  });
  if (result.status !== "success") return result;
  if (formData.get("block") === "on") await call("block_student", { p_user_id: d.userId });
  deliverNotificationsSoon();
  return { status: "success", message: "Thanks. Perqly support will look at your report." };
}

/** "Message" on a friend: open (or reopen) the chat and go to it. */
export async function openFriendChat(formData: FormData) {
  const userId = uuid.safeParse(formData.get("userId"));
  if (!userId.success || !hasSupabaseEnv()) redirect("/student/friends");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_friend_chat", { p_user_id: userId.data });
  if (error || !data) redirect("/student/friends?chat=unavailable");
  redirect(`/student/friends/chat/${data}`);
}

// Perqly support -----------------------------------------------------------------------------
export async function setStudentReportStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("reportId"));
  const status = z.enum(["open", "resolved", "dismissed"]).safeParse(formData.get("status"));
  const note = text(formData.get("staffNote"));
  if (!id.success || !status.success) return { status: "error", message: "Choose what happened." };
  if (note && note.length > 500) return { status: "error", fieldErrors: { staffNote: "Keep it under 500 characters" } };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_student_report_status", {
    p_id: id.data,
    p_status: status.data,
    p_staff_note: note ?? null,
  });
  if (error) return { status: "error", message: friendsErrorMessage(error.message) };
  revalidatePath("/admin/student-reports", "layout");
  return { status: "success", message: "Saved." };
}
