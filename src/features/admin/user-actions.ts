"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import { getSiteUrl, hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { buildDeletionConfirmationEmail, deletionBlockerText } from "../account/deletion";
import type { FormState } from "@/features/auth/types";

const messages: Record<string, string> = {
  forbidden: "Only Perqly admins with two-step verification can do this.",
  cannot_suspend_self: "You can't suspend your own account.",
  reason_required: "Give a reason of at least a few words.",
  user_not_found: "That account no longer exists.",
  request_not_open: "That request was already handled.",
  use_complete_deletion: "Use “Delete account” so the deletion actually runs.",
  cannot_delete_self: "You can't delete your own account here. Ask another admin.",
  deletion_blocked: "Something has to be handed over first.",
  account_deleted: "That account was deleted. It can't be changed or restored.",
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

export async function declineDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!id.success) return { status: "error", message: "Choose a request." };
  if (note.length < 5) return { status: "error", fieldErrors: { note: "Say why it isn't being deleted." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_account_deletion", {
    p_request_id: id.data,
    p_status: "declined",
    p_note: note.slice(0, 500),
  });
  if (error) return { status: "error", message: messages[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/users");
  return { status: "success", message: "Recorded as not deleted." };
}

const completed = z.object({ email: z.string().nullable(), counts: z.record(z.string(), z.number()) });

export async function completeDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!id.success) return { status: "error", message: "Choose a request." };
  const fieldErrors: Record<string, string> = {};
  if (note.length < 5) fieldErrors.note = "Record how they asked, for example “Asked in the app”.";
  if (confirm !== "DELETE") fieldErrors.confirm = "Type DELETE to confirm. This can't be undone.";
  if (Object.keys(fieldErrors).length > 0) return { status: "error", fieldErrors };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_complete_account_deletion", { p_request_id: id.data, p_note: note.slice(0, 500) });
  if (error) {
    if (error.message === "deletion_blocked") return { status: "error", message: deletionBlockerText(error.details) };
    return { status: "error", message: messages[error.message] ?? "Couldn't delete. Nothing was changed. Try again." };
  }
  revalidatePath("/admin/users");
  const result = completed.safeParse(data);
  const email = result.success ? result.data.email : null;
  if (!email) return { status: "success", message: "Deleted. There was no email address to send the confirmation to." };
  try {
    await sendEmail({ to: email, ...buildDeletionConfirmationEmail(getSiteUrl()) });
    return { status: "success", message: "Deleted, and the confirmation email was sent." };
  } catch {
    // The email address is gone from the database now, so it is only shown here, once.
    return {
      status: "success",
      message: `Deleted, but the confirmation email couldn't be sent. Email ${email} yourself to confirm it's done.`,
    };
  }
}

export async function openDeletionRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = z.uuid().safeParse(formData.get("userId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!userId.success) return { status: "error", message: "Choose an account." };
  if (note.length < 5) return { status: "error", fieldErrors: { note: "Say when and from which address they emailed." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_open_deletion_request", { p_user_id: userId.data, p_note: note.slice(0, 500) });
  if (error) return { status: "error", message: messages[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/users");
  return { status: "success", message: "Recorded. It's now in the deletion requests list with a 30-day deadline." };
}
