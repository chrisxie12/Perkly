"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const id = z.string().uuid();

/** Student taps "Chat" on a shop: open (or reopen) the conversation and go to it. */
export async function startConversation(formData: FormData) {
  const merchantId = id.safeParse(formData.get("merchantId"));
  const back = String(formData.get("back") ?? "/student");
  if (!merchantId.success || !hasSupabaseEnv()) redirect(back);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", { p_merchant_id: merchantId.data });
  if (error || !data) {
    const reason = error?.message?.includes("not_a_student") ? "profile" : "unavailable";
    redirect(`${back}${back.includes("?") ? "&" : "?"}chat=${reason}`);
  }
  redirect(`/student/messages/${data}`);
}

export async function setConversationBlocked(formData: FormData) {
  const conversationId = id.safeParse(formData.get("conversationId"));
  if (!conversationId.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("set_conversation_blocked", {
    p_conversation_id: conversationId.data,
    p_blocked: formData.get("blocked") === "true",
  });
  revalidatePath(`/merchant/messages/${conversationId.data}`);
  revalidatePath("/merchant/messages");
}

/** Student blocks or unblocks a business in a shop chat. */
export async function setBusinessBlocked(formData: FormData) {
  const conversationId = id.safeParse(formData.get("conversationId"));
  if (!conversationId.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("student_set_business_blocked", {
    p_conversation_id: conversationId.data,
    p_blocked: formData.get("blocked") === "true",
  });
  revalidatePath(`/student/messages/${conversationId.data}`);
  revalidatePath("/student/messages");
}
