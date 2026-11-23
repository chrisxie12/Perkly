"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { resourceErrorMessage, resourceFormSchema, STATUSES } from "./model";

// Admin-only: the database functions check for a Perqly admin with two-factor, write the
// audit log, and refuse anyone else.

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

function revalidateResources() {
  revalidatePath("/admin/resources", "layout");
  revalidatePath("/student/resources", "layout");
  revalidatePath("/student");
}

export async function saveResource(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resourceFormSchema.safeParse({
    id: str(formData.get("id")) || null,
    name: str(formData.get("name")),
    slug: str(formData.get("slug")),
    provider: str(formData.get("provider")),
    category: str(formData.get("category")),
    offerType: str(formData.get("offerType")),
    offerLabel: str(formData.get("offerLabel")),
    summary: str(formData.get("summary")),
    description: str(formData.get("description")),
    benefits: str(formData.get("benefits")),
    requirementsNote: str(formData.get("requirementsNote")),
    eligibility: str(formData.get("eligibility")),
    availability: str(formData.get("availability")),
    needsSchoolEmail: formData.get("needsSchoolEmail") === "on",
    needsStudentProof: formData.get("needsStudentProof") === "on",
    needsInstitutionListed: formData.get("needsInstitutionListed") === "on",
    needsPaymentCard: formData.get("needsPaymentCard") === "on",
    minAge: str(formData.get("minAge")),
    officialUrl: str(formData.get("officialUrl")),
    sourceUrl: str(formData.get("sourceUrl")),
    checkedOn: str(formData.get("checkedOn")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_student_resource", {
    p_id: v.id,
    p_slug: v.slug,
    p_name: v.name,
    p_provider: v.provider,
    p_category: v.category,
    p_offer_type: v.offerType,
    p_offer_label: v.offerLabel,
    p_summary: v.summary,
    p_description: v.description,
    p_benefits: v.benefits,
    p_requirements_note: v.requirementsNote,
    p_eligibility: v.eligibility,
    p_availability: v.availability,
    p_needs_school_email: v.needsSchoolEmail,
    p_needs_student_proof: v.needsStudentProof,
    p_needs_institution_listed: v.needsInstitutionListed,
    p_needs_payment_card: v.needsPaymentCard,
    p_min_age: v.minAge,
    p_official_url: v.officialUrl,
    p_source_url: v.sourceUrl,
    p_checked_on: v.checkedOn,
  });
  if (error) return { status: "error", message: resourceErrorMessage(error.message) };
  revalidateResources();
  if (!v.id && typeof data === "string") redirect(`/admin/resources/${data}?saved=1`);
  return { status: "success", message: "Saved." };
}

export async function setResourceStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ id: z.string().uuid(), status: z.enum(STATUSES) })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_student_resource_status", { p_id: parsed.data.id, p_status: parsed.data.status });
  if (error) return { status: "error", message: resourceErrorMessage(error.message) };
  revalidateResources();
  const done = { published: "Approved and published.", archived: "Archived.", draft: "Moved back to drafts.", pending: "Sent for review." };
  return { status: "success", message: done[parsed.data.status] };
}

export async function setResourceFeatured(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ id: z.string().uuid(), featured: z.enum(["1", "0"]) })
    .safeParse({ id: formData.get("id"), featured: formData.get("featured") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const on = parsed.data.featured === "1";
  const { error } = await supabase.rpc("admin_set_student_resource_featured", { p_id: parsed.data.id, p_featured: on });
  if (error) return { status: "error", message: resourceErrorMessage(error.message) };
  revalidateResources();
  return { status: "success", message: on ? "Featured." : "No longer featured." };
}
