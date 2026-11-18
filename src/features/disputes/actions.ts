"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { disputeErrorMessage, noteSchema, openFormSchema } from "./schemas";

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

function revalidateAll() {
  revalidatePath("/student/problems");
  revalidatePath("/merchant/problems");
  revalidatePath("/admin/disputes", "layout");
}

export async function openDispute(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = openFormSchema.safeParse({
    redemptionId: text(formData.get("redemptionId")),
    bookingId: text(formData.get("bookingId")),
    reason: text(formData.get("reason")),
    details: text(formData.get("details")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const area = formData.get("area") === "merchant" ? "merchant" : "student";
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_dispute", {
    p_redemption_id: d.redemptionId ?? null,
    p_booking_id: d.bookingId ?? null,
    p_reason: d.reason,
    p_details: d.details,
  });
  if (error) return { status: "error", message: disputeErrorMessage(error.message) };
  revalidateAll();
  redirect(`/${area}/problems?sent=1`);
}

export async function addDisputeNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = noteSchema.safeParse({ disputeId: text(formData.get("disputeId")), body: text(formData.get("body")) });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_dispute_note", {
    p_dispute_id: parsed.data.disputeId,
    p_body: parsed.data.body,
    p_internal: formData.get("internal") === "on",
  });
  if (error) return { status: "error", message: disputeErrorMessage(error.message) };
  revalidateAll();
  return { status: "success", message: "Note added." };
}

/** Perqly support (aal2). */
export async function setDisputeStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(formData.get("disputeId"));
  const status = z.enum(["open", "investigating", "resolved", "dismissed"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return { status: "error", message: "Reload the page and try again." };
  const resolution = text(formData.get("resolution"));
  if ((status.data === "resolved" || status.data === "dismissed") && (!resolution || resolution.length < 5))
    return { status: "error", fieldErrors: { resolution: "Write what was decided (at least 5 characters)." } };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_dispute_status", {
    p_dispute_id: id.data,
    p_status: status.data,
    p_resolution: resolution ?? null,
  });
  if (error) return { status: "error", message: disputeErrorMessage(error.message) };
  revalidateAll();
  return { status: "success", message: "Saved." };
}
