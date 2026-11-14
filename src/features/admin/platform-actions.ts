"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";

const messages: Record<string, string> = {
  forbidden: "Only super admins with two-step verification can do this.",
  user_not_found: "No Perqly account uses that email. They need to sign up first.",
  cannot_change_own_role: "You can't change your own role.",
  setting_not_tunable: "That setting can't be changed here.",
  value_out_of_range: "Use a whole number from 1 to 100,000.",
};

export async function setStaffRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.email({ error: "Enter their email address." }).safeParse(String(formData.get("email") ?? "").trim());
  const role = z.enum(["none", "reviewer", "support", "admin", "super_admin"]).safeParse(formData.get("role"));
  if (!email.success) return { status: "error", fieldErrors: { email: "Enter their email address." } };
  if (!role.success) return { status: "error", message: "Choose a role." };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_platform_role_by_email", {
    p_email: email.data,
    p_role: role.data === "none" ? null : role.data,
  });
  if (error) return { status: "error", message: messages[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/staff");
  return { status: "success", message: role.data === "none" ? "Role removed." : "Role saved. They get it at their next sign-in." };
}

export async function saveSetting(_prev: FormState, formData: FormData): Promise<FormState> {
  const key = z
    .string()
    .regex(/^[a-z][a-z0-9_.]{2,80}$/)
    .safeParse(formData.get("key"));
  const value = z.coerce.number().int().min(1).max(100000).safeParse(formData.get("value"));
  if (!key.success) return { status: "error", message: "Unknown setting." };
  if (!value.success) return { status: "error", fieldErrors: { value: "Use a whole number from 1 to 100,000." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_setting", { p_key: key.data, p_value: value.data });
  if (error) return { status: "error", message: messages[error.message] ?? "Couldn't save. Try again." };
  revalidatePath("/admin/settings");
  return { status: "success", message: "Saved. It takes effect immediately." };
}
