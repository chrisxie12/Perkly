"use server";

import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";

const schema = z.object({
  email: z.email({ error: "Enter an email address, like ama@gmail.com." }).max(254),
  source: z.enum(["hero", "final"]),
});

/** Adds an email to the GCTU waitlist. Single opt-in; the same reply whether or not it was already there. */
export async function joinWaitlist(_prev: FormState, formData: FormData): Promise<FormState> {
  // Honeypot: people never see or fill this field, simple bots do.
  if (String(formData.get("website") ?? "") !== "") return { status: "success", message: "You're on the list." };
  const parsed = schema.safeParse({ email: String(formData.get("email") ?? "").trim(), source: formData.get("source") });
  if (!parsed.success) return { status: "error", fieldErrors: { email: "Enter an email address, like ama@gmail.com." } };
  if (!hasSupabaseEnv()) return { status: "error", message: "The waitlist isn't available here yet." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_waitlist", { p_email: parsed.data.email, p_source: parsed.data.source });
  if (error) {
    if (error.message.includes("email_invalid"))
      return { status: "error", fieldErrors: { email: "Enter an email address, like ama@gmail.com." } };
    if (error.message.includes("rate_limited")) return { status: "error", message: "Too many tries. Try again tomorrow." };
    return { status: "error", message: "That didn't go through. Check your connection and try again." };
  }
  return { status: "success", message: "You're on the list. We'll email you once, when GCTU sign-up opens." };
}
