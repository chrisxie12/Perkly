"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";

export type RatingReportRow = {
  id: string;
  review_id: string;
  reason: "spam" | "rude" | "false" | "personal" | "other";
  note: string | null;
  status: "open" | "hidden" | "kept";
  reporter_side: "student" | "business";
  created_at: string;
  business: string;
  merchant_slug: string;
  rating: number;
  comment: string | null;
  review_hidden: boolean;
};

/** Null when the viewer can't see the queue (not support, or no second factor). */
export async function listRatingReports(): Promise<RatingReportRow[] | null> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_review_reports");
  if (error) return null;
  return (data ?? []) as RatingReportRow[];
}

export async function resolveRatingReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  const hide = formData.get("hide") === "true";
  if (!id.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_review_report", { p_id: id.data, p_hide: hide });
  if (error)
    return { status: "error", message: error.message.includes("report_not_open") ? "Already handled." : "That didn't save. Try again." };
  revalidatePath("/admin/rating-reports");
  return { status: "success", message: hide ? "Rating hidden." : "Rating kept." };
}
