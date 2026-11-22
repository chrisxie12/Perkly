"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";

export type ChatReportRow = {
  id: string;
  kind: "shop" | "friend";
  chat_id: string;
  reason: "spam" | "rude" | "scam" | "other";
  details: string | null;
  status: "open" | "closed";
  created_at: string;
  reporter: string;
  business: string | null;
  reporter_side: "student" | "business";
};

export async function listChatReports(): Promise<ChatReportRow[] | null> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_chat_reports");
  if (error) return null;
  return (data ?? []) as ChatReportRow[];
}

export async function closeChatReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_close_chat_report", { p_id: id.data });
  if (error) return { status: "error", message: "That didn't save. Try again." };
  revalidatePath("/admin/chat-reports");
  return { status: "success", message: "Report closed." };
}
