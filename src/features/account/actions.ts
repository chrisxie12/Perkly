"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";

const nameSchema = z.object({
  fullName: z.string({ error: "Enter your full name." }).trim().min(2, "Enter your full name.").max(120),
  firstName: z.string({ error: "Enter what we should call you." }).trim().min(1, "Enter what we should call you.").max(60),
});

export async function saveName(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = nameSchema.safeParse({ fullName: formData.get("fullName"), firstName: formData.get("firstName") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const ctx = await getUserContext();
  if (!ctx) return { status: "error", message: "Sign in again to continue." };
  const supabase = await createClient();
  // RLS lets people update only their own name, and not while suspended.
  const { error, count } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, first_name: parsed.data.firstName }, { count: "exact" })
    .eq("id", ctx.userId);
  if (error || count === 0)
    return { status: "error", message: ctx.isSuspended ? "Suspended accounts can't be changed." : "Couldn't save. Try again." };
  revalidatePath("/", "layout");
  return { status: "success", message: "Saved." };
}

export async function requestDeletion(formData: FormData): Promise<void> {
  if (!hasSupabaseEnv()) redirect("/account?deletion=failed");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion", { p_note: String(formData.get("note") ?? "").slice(0, 500) || null });
  redirect(error ? "/account?deletion=failed" : "/account?deletion=requested");
}

export async function cancelDeletion(): Promise<void> {
  if (!hasSupabaseEnv()) redirect("/account");
  const supabase = await createClient();
  await supabase.rpc("cancel_account_deletion");
  redirect("/account?deletion=cancelled");
}

export async function markNotificationsRead(): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/account/notifications");
}

// Notifications ----------------------------------------------------------------------

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
});

/** Saves this device for phone notifications. Returns false if it couldn't. */
export async function savePushSubscription(subscription: unknown, deviceLabel: string): Promise<boolean> {
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success || !hasSupabaseEnv()) return false;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_device_label: deviceLabel.slice(0, 120),
  });
  revalidatePath("/account/notifications/settings");
  return !error;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  if (!hasSupabaseEnv() || typeof endpoint !== "string" || endpoint.length > 1000) return;
  const supabase = await createClient();
  await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
  revalidatePath("/account/notifications/settings");
}

const CATEGORIES = ["verification", "deals", "redemptions", "business", "review", "messages", "account"] as const;

export async function saveNotificationSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const shown = formData.getAll("category").filter((c): c is (typeof CATEGORIES)[number] => CATEGORIES.includes(c as never));
  const supabase = await createClient();
  for (const category of new Set(shown)) {
    const { error } = await supabase.rpc("set_notification_preference", {
      p_category: category,
      p_push: formData.get(`${category}:push`) === "on",
      p_email: formData.get(`${category}:email`) === "on",
    });
    if (error) return { status: "error", message: "Couldn't save your settings. Try again." };
  }
  revalidatePath("/account/notifications/settings");
  return { status: "success", message: "Saved." };
}
