"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";

const messages: Record<string, string> = {
  forbidden: "Only Perqly admins with two-step verification can do this.",
  cannot_suspend_self: "You can't suspend your own account.",
  reason_required: "Give a reason of at least a few words.",
  user_not_found: "That account no longer exists.",
  request_not_open: "That request was already handled.",
};

export async function setSuspension(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = z.uuid().safeParse(formData.get("userId"));
  const suspend = formData.get("suspend") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!userId.success) return { status: "error", message: "Choose an account." };
  if (suspend && reason.length < 3) return { status: "error", fieldErrors: { reason: "Say why. The person sees this reason." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_suspension", {
    p_user_id: userId.data,
    p_suspended: suspend,
    p_reason: suspend ? reason.slice(0, 300) : null,
  });
  if (error) return { status: "error", message: messages[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/users");
  return { status: "success", message: suspend ? "Suspended. They can't redeem, confirm or change anything until restored." : "Restored." };
}

export async function resolveDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("requestId"));
  const status = z.enum(["completed", "declined"]).safeParse(formData.get("status"));
  const note = String(formData.get("note") ?? "").trim();
  if (!id.success || !status.success) return { status: "error", message: "Choose an outcome." };
  if (note.length < 5) return { status: "error", fieldErrors: { note: "Record what was done." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_account_deletion", {
    p_request_id: id.data,
    p_status: status.data,
    p_note: note.slice(0, 500),
  });
  if (error) return { status: "error", message: messages[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/users");
  return { status: "success", message: "Recorded." };
}
