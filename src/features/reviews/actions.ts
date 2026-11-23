"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";
import type { FormState } from "@/features/auth/types";

const schema = z.object({
  merchantId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
  back: z.string().startsWith("/").max(300),
});

const MESSAGES: Record<string, string> = {
  visit_required: "You can rate a business after a discount there goes through.",
  rating_invalid: "Choose from 1 to 5 stars.",
  comment_too_long: "Keep your comment under 500 characters.",
  rate_limited: "You've rated a lot just now. Try again later.",
  merchant_not_found: "This business isn't on Perqly right now.",
};

export async function submitReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    merchantId: formData.get("merchantId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? undefined,
    back: formData.get("back"),
  });
  if (!parsed.success) return { status: "error", message: "Choose from 1 to 5 stars." };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_merchant_review", {
    p_merchant_id: parsed.data.merchantId,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment || null,
  });
  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    return { status: "error", message: key ? MESSAGES[key] : "Couldn't save your rating. Try again." };
  }
  deliverNotificationsSoon();
  revalidatePath(parsed.data.back);
  return { status: "success", message: "Thanks! Your rating is saved." };
}

export async function deleteReview(formData: FormData) {
  const merchantId = z.string().uuid().safeParse(formData.get("merchantId"));
  const back = String(formData.get("back") ?? "/student");
  if (!merchantId.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("delete_my_review", { p_merchant_id: merchantId.data });
  revalidatePath(back.startsWith("/") ? back : "/student");
}

export async function setReviewHidden(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("reviewId"));
  const back = String(formData.get("back") ?? "/admin");
  if (!id.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("staff_set_review_hidden", { p_review_id: id.data, p_hidden: formData.get("hidden") === "true" });
  revalidatePath(back.startsWith("/") ? back : "/admin");
}

const REPORT_REASONS = ["spam", "rude", "false", "personal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const REPORT_MESSAGES: Record<string, string> = {
  own_review: "That's your own rating. You can change or delete it instead.",
  review_not_found: "That rating has already been removed.",
  report_invalid: "Choose a reason.",
  rate_limited: "You've reported a lot today. Try again tomorrow.",
};

export async function reportReview(reviewId: string, reason: string, note: string): Promise<{ ok: boolean; message: string }> {
  const id = z.string().uuid().safeParse(reviewId);
  const why = z.enum(REPORT_REASONS).safeParse(reason);
  if (!id.success || !why.success) return { ok: false, message: "Choose a reason." };
  if (!hasSupabaseEnv()) return { ok: false, message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_review", {
    p_review_id: id.data,
    p_reason: why.data,
    p_note: note.trim().slice(0, 500) || null,
  });
  if (error) {
    const key = Object.keys(REPORT_MESSAGES).find((k) => error.message.includes(k));
    return { ok: false, message: key ? REPORT_MESSAGES[key] : "Couldn't send the report. Try again." };
  }
  return { ok: true, message: "Thanks. Perqly support will look at this rating." };
}
