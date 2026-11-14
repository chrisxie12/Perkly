"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { adminErrorMessage, appointSchema, campusSchema, domainSchema, institutionSchema, readForm } from "./schemas";

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
  const { error } = await supabase.rpc("appoint_institution_reviewer_by_email", {
    p_institution_id: parsed.data.institutionId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { status: "error", message: adminErrorMessage(error.message) };

  revalidatePath(institutionPath(parsed.data.institutionId));
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
}
