"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { agreementFormSchema, campusErrorMessage } from "./schemas";

// Campus switches and school agreements. Super admins with two-factor only: the
// database functions check that, write the audit log, and refuse anyone else.

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

function revalidateAll() {
  revalidatePath("/admin/campus", "layout");
  revalidatePath("/student", "layout");
  revalidatePath("/organise", "layout");
}

export async function setCampusSwitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ key: z.enum(["campus.posts_enabled", "campus.comments_enabled"]), on: z.enum(["1", "0"]) })
    .safeParse({ key: formData.get("key"), on: formData.get("on") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const on = parsed.data.on === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_campus_switch", { p_key: parsed.data.key, p_on: on });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateAll();
  const what = parsed.data.key === "campus.posts_enabled" ? "Campus" : "Comments";
  return { status: "success", message: `${what} switched ${on ? "on" : "off"}.` };
}

export async function recordAgreement(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = agreementFormSchema.safeParse({
    institutionId: text(formData.get("institutionId")),
    signedOn: text(formData.get("signedOn")),
    endsOn: text(formData.get("endsOn")),
    signedByName: text(formData.get("signedByName")),
    documentRef: text(formData.get("documentRef")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_record_campus_agreement", {
    p_institution_id: d.institutionId,
    p_signed_on: d.signedOn,
    p_ends_on: d.endsOn ?? null,
    p_signed_by_name: d.signedByName,
    p_document_ref: d.documentRef,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateAll();
  return { status: "success", message: "Agreement recorded." };
}

export async function endAgreement(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ institutionId: z.uuid() }).safeParse({ institutionId: formData.get("institutionId") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  // Ends today (Ghana is on UTC): from now on the school's administration has no official badge.
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_end_campus_agreement", { p_institution_id: parsed.data.institutionId, p_ends_on: today });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateAll();
  return { status: "success", message: "Agreement ended today." };
}
