"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { deliverNotificationsSoon } from "@/lib/notifications/dispatch";
import {
  adminErrorMessage,
  appointSchema,
  campusDetailsSchema,
  campusSchema,
  directorySchema,
  domainSchema,
  institutionSchema,
  readForm,
} from "./schemas";

// Every action calls a database function that checks the caller is a platform
// admin with two-factor (or, for appointments, an institution admin). The app
// checks nothing on its own: these are conveniences, the database decides.

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const institutionPath = (id: string) => `/admin/institutions/${id}`;

export async function saveInstitution(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = institutionSchema.safeParse(
    readForm(formData, ["slug", "name", "shortName", "status", "reviewMode", "delegatedAt", "yearEndMonth", "yearEndDay"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;

  const value = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_institution", {
    p_slug: value.slug,
    p_name: value.name,
    p_short_name: value.shortName,
    p_status: value.status,
    p_review_mode: value.reviewMode,
    p_review_delegated_at: value.reviewMode === "delegated" ? (value.delegatedAt ?? null) : null,
    p_academic_year_end_month: value.yearEndMonth ?? null,
    p_academic_year_end_day: value.yearEndDay ?? null,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };

  revalidatePath("/admin", "layout");
  redirect(`${institutionPath(data as string)}?saved=institution`);
}

export async function addDomain(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = domainSchema.safeParse(readForm(formData, ["institutionId", "domain"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_institution_domain", {
    p_institution_id: parsed.data.institutionId,
    p_domain: parsed.data.domain,
    p_is_active: true,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };

  revalidatePath(institutionPath(parsed.data.institutionId));
  return { status: "success", message: `Added ${parsed.data.domain}.` };
}

const toggleDomainSchema = z.object({ institutionId: z.uuid(), domain: z.string().min(3).max(253), active: z.enum(["true", "false"]) });

export async function setDomainActive(formData: FormData): Promise<void> {
  const parsed = toggleDomainSchema.safeParse(readForm(formData, ["institutionId", "domain", "active"]));
  if (!parsed.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("admin_set_institution_domain", {
    p_institution_id: parsed.data.institutionId,
    p_domain: parsed.data.domain,
    p_is_active: parsed.data.active === "true",
  });
  revalidatePath(institutionPath(parsed.data.institutionId));
}

export async function saveCampus(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = campusSchema.safeParse(
    readForm(formData, ["institutionId", "campusId", "name", "digitalAddress", "latitude", "longitude"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;

  const value = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_campus", {
    p_institution_id: value.institutionId,
    p_campus_id: value.campusId ?? null,
    p_name: value.name,
    p_digital_address: value.digitalAddress ?? null,
    p_latitude: value.latitude ?? null,
    p_longitude: value.longitude ?? null,
    p_is_active: true,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };

  revalidatePath(institutionPath(value.institutionId));
  return { status: "success", message: `Saved ${value.name}.` };
}

const toggleCampusSchema = z.object({
  institutionId: z.uuid(),
  campusId: z.uuid(),
  name: z.string().min(2).max(120),
  digitalAddress: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  active: z.enum(["true", "false"]),
});

export async function setCampusActive(formData: FormData): Promise<void> {
  const parsed = toggleCampusSchema.safeParse(
    readForm(formData, ["institutionId", "campusId", "name", "digitalAddress", "latitude", "longitude", "active"]),
  );
  if (!parsed.success || !hasSupabaseEnv()) return;
  const value = parsed.data;
  const supabase = await createClient();
  await supabase.rpc("admin_upsert_campus", {
    p_institution_id: value.institutionId,
    p_campus_id: value.campusId,
    p_name: value.name,
    p_digital_address: value.digitalAddress ?? null,
    p_latitude: value.latitude ?? null,
    p_longitude: value.longitude ?? null,
    p_is_active: value.active === "true",
  });
  revalidatePath(institutionPath(value.institutionId));
}

export async function appointReviewer(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = appointSchema.safeParse(readForm(formData, ["institutionId", "email", "role"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;

  const supabase = await createClient();
  deliverNotificationsSoon();
  const { error } = await supabase.rpc("appoint_institution_reviewer_by_email", {
    p_institution_id: parsed.data.institutionId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };

  revalidatePath(institutionPath(parsed.data.institutionId));
  revalidatePath("/institution/reviewers");
  return {
    status: "success",
    message: `Appointed ${parsed.data.email} as ${parsed.data.role === "admin" ? "an institution admin" : "a reviewer"}.`,
  };
}

const removeSchema = z.object({ institutionId: z.uuid(), reviewerId: z.uuid() });

export async function removeReviewer(formData: FormData): Promise<void> {
  const parsed = removeSchema.safeParse(readForm(formData, ["institutionId", "reviewerId"]));
  if (!parsed.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("remove_institution_reviewer", { p_reviewer_id: parsed.data.reviewerId });
  revalidatePath(institutionPath(parsed.data.institutionId));
  revalidatePath("/institution/reviewers");
}

// Institution directory ------------------------------------------------------------------

export async function saveDirectoryDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = directorySchema.safeParse(
    readForm(formData, [
      "institutionId",
      "institutionType",
      "officialWebsite",
      "city",
      "region",
      "infoSourceUrl",
      "accreditationStatus",
      "accreditationNote",
    ]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_institution_directory", {
    p_institution_id: v.institutionId,
    p_institution_type: v.institutionType ?? "",
    p_official_website: v.officialWebsite ?? null,
    p_city: v.city ?? null,
    p_region: v.region ?? null,
    p_info_source_url: v.infoSourceUrl ?? null,
    p_accreditation_status: v.accreditationStatus,
    p_accreditation_note: v.accreditationNote ?? null,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };
  revalidatePath(institutionPath(v.institutionId));
  revalidatePath("/admin/institutions");
  return { status: "success", message: "Saved, with today's date as the last check." };
}

const LOGO_PATH = /^[0-9a-f-]{36}\/logo-[0-9]{10,13}\.(svg|png|webp)$/;

/** Records an uploaded logo (the browser uploads the file to storage first). */
export async function setInstitutionLogo(
  institutionId: string,
  path: string,
  sourceUrl: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, message: unavailable.message };
  if (!LOGO_PATH.test(path) || !path.startsWith(`${institutionId}/`)) return { ok: false, message: adminErrorMessage("path_invalid") };
  if (!/^https:\/\//.test(sourceUrl.trim())) return { ok: false, message: adminErrorMessage("logo_source_required") };
  const supabase = await createClient();
  const { data: old, error } = await supabase.rpc("admin_set_institution_logo", {
    p_institution_id: institutionId,
    p_path: path,
    p_source_url: sourceUrl.trim(),
  });
  if (error) {
    await supabase.storage.from("institution-logos").remove([path]);
    return { ok: false, message: adminErrorMessage(error.message) };
  }
  // Bundled logos ship with the app (public/institution-logos); only uploaded ones live in storage.
  if (typeof old === "string" && old !== path && !old.startsWith("bundled/"))
    await supabase.storage.from("institution-logos").remove([old]);
  revalidatePath(institutionPath(institutionId));
  revalidatePath("/admin/institutions");
  revalidatePath("/student", "layout");
  return { ok: true };
}

export async function saveCampusDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = campusDetailsSchema.safeParse(
    readForm(formData, ["institutionId", "campusId", "campusType", "address", "city", "region", "sourceUrl", "infoStatus"]),
  );
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_campus_details", {
    p_campus_id: v.campusId,
    p_campus_type: v.campusType,
    p_address: v.address ?? null,
    p_city: v.city ?? null,
    p_region: v.region ?? null,
    p_source_url: v.sourceUrl ?? null,
    p_info_status: v.infoStatus,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };
  revalidatePath(institutionPath(v.institutionId));
  return { status: "success", message: "Campus saved." };
}

export async function setPrimaryCampus(formData: FormData): Promise<void> {
  const institutionId = z.uuid().safeParse(formData.get("institutionId"));
  const campusId = z.uuid().safeParse(formData.get("campusId"));
  if (!institutionId.success || !campusId.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase.rpc("admin_set_primary_campus", { p_campus_id: campusId.data });
  revalidatePath(institutionPath(institutionId.data));
}

export async function handleInstitutionRequest(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("requestId"));
  const status = z.enum(["added", "declined"]).safeParse(formData.get("status"));
  if (!id.success || !status.success || !hasSupabaseEnv()) return;
  const supabase = await createClient();
  deliverNotificationsSoon();
  await supabase.rpc("admin_handle_institution_request", {
    p_request_id: id.data,
    p_status: status.data,
    p_note: String(formData.get("note") ?? "").slice(0, 300) || null,
  });
  revalidatePath("/admin/institutions/requests");
  revalidatePath("/admin/institutions");
}
