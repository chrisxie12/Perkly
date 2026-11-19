"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import {
  campusErrorMessage,
  createOrganisationSchema,
  memberFormSchema,
  organisationFormSchema,
  parseScheduleTime,
  postFormSchema,
  reportFormSchema,
} from "./schemas";

// Every action calls one database function, which checks the caller, their school,
// their role, the Campus switches and the rate limits. These are conveniences; the
// database decides. Campus never calls the notification dispatcher (C1 is in-app only).

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};
const uuid = z.uuid();

function revalidateCampus(organisationId?: string) {
  revalidatePath("/student/campus", "layout");
  if (organisationId) revalidatePath(`/organise/${organisationId}`, "layout");
  revalidatePath("/organise");
}

// Posts: editors --------------------------------------------------------------------------------

export async function savePost(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = postFormSchema.safeParse({
    organisationId: text(formData.get("organisationId")),
    postId: text(formData.get("postId")),
    kind: text(formData.get("kind")),
    title: text(formData.get("title")),
    body: text(formData.get("body")),
    linkUrl: text(formData.get("linkUrl")),
    videoUrl: text(formData.get("videoUrl")),
    visibility: text(formData.get("visibility")) ?? "school",
    media: formData.getAll("media").filter((m): m is string => typeof m === "string" && m.length > 0),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_post", {
    p_post_id: d.postId ?? null,
    p_organisation_id: d.organisationId,
    p_kind: d.kind,
    p_title: d.title,
    p_body: d.body,
    p_link_url: d.linkUrl ?? null,
    p_video_url: d.videoUrl ?? null,
    p_visibility: d.visibility,
    p_media: d.media,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(d.organisationId);
  if (!d.postId) redirect(`/organise/${d.organisationId}/posts/${data as string}?saved=1`);
  return { status: "success", message: "Saved." };
}

export async function publishPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const postId = uuid.safeParse(formData.get("postId"));
  const organisationId = uuid.safeParse(formData.get("organisationId"));
  if (!postId.success || !organisationId.success) return { status: "error", message: "Reload the page and try again." };
  let at: string | null = null;
  if (formData.get("when") === "schedule") {
    const t = parseScheduleTime(formData.get("publishAt"));
    if (!t.ok) return { status: "error", fieldErrors: { publishAt: t.message } };
    at = t.iso;
  }
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_post", { p_post_id: postId.data, p_publish_at: at });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(organisationId.data);
  const live = (data as { live?: boolean } | null)?.live;
  return { status: "success", message: live ? "Published. It's live now." : "Scheduled. It goes live at the time you chose." };
}

const statusSchema = z.object({
  postId: z.uuid(),
  organisationId: z.uuid(),
  status: z.enum(["hidden", "published", "draft", "removed"]),
});

export async function setPostStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = statusSchema.safeParse({
    postId: formData.get("postId"),
    organisationId: formData.get("organisationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_post_status", { p_post_id: parsed.data.postId, p_status: parsed.data.status });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(parsed.data.organisationId);
  if (parsed.data.status === "removed") redirect(`/organise/${parsed.data.organisationId}?removed=1`);
  const done = { hidden: "Hidden. Students can't see it now.", published: "Visible again.", draft: "Back to draft." } as const;
  return { status: "success", message: done[parsed.data.status] };
}

const pinSchema = z.object({ postId: z.uuid(), organisationId: z.uuid(), days: z.coerce.number().int().min(0).max(30) });

export async function setPostPin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = pinSchema.safeParse({
    postId: formData.get("postId"),
    organisationId: formData.get("organisationId"),
    days: formData.get("days"),
  });
  if (!parsed.success) return { status: "error", message: "Choose how long to pin it, up to 30 days." };
  if (!hasSupabaseEnv()) return unavailable;
  const until = parsed.data.days === 0 ? null : new Date(Date.now() + parsed.data.days * 86_400_000).toISOString();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_post_pin", { p_post_id: parsed.data.postId, p_pinned_until: until });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(parsed.data.organisationId);
  return { status: "success", message: until ? `Pinned for ${parsed.data.days} day${parsed.data.days === 1 ? "" : "s"}.` : "Unpinned." };
}

// Organisation owners and admins ------------------------------------------------------------------

export async function updateOrganisation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = organisationFormSchema.safeParse({
    organisationId: text(formData.get("organisationId")),
    description: text(formData.get("description")),
    contactEmail: text(formData.get("contactEmail")),
    contactPhone: text(formData.get("contactPhone")),
    logoPath: text(formData.get("logoPath")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organisation", {
    p_organisation_id: d.organisationId,
    p_description: d.description ?? null,
    p_contact_email: d.contactEmail ?? null,
    p_contact_phone: d.contactPhone ?? null,
    p_logo_path: d.logoPath ?? null,
    p_campus_id: text(formData.get("campusId")) ?? null,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(d.organisationId);
  return { status: "success", message: "Saved. Students see the new details now." };
}

export async function setOrganisationMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = memberFormSchema.safeParse({
    organisationId: text(formData.get("organisationId")),
    email: text(formData.get("email")),
    role: text(formData.get("role")),
    title: text(formData.get("title")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_organisation_member", {
    p_organisation_id: d.organisationId,
    p_email: d.email,
    p_role: d.role,
    p_title: d.title ?? null,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(d.organisationId);
  return { status: "success", message: "Added. They'll see the organisation next time they open Perqly." };
}

export async function removeOrganisationMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ organisationId: z.uuid(), userId: z.uuid() }).safeParse({
    organisationId: formData.get("organisationId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_organisation_member", {
    p_organisation_id: parsed.data.organisationId,
    p_user_id: parsed.data.userId,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidateCampus(parsed.data.organisationId);
  return { status: "success", message: "Removed." };
}

// Students ---------------------------------------------------------------------------------------

type Result = { ok: true } | { ok: false; message: string };

async function toggle(fn: string, args: Record<string, unknown>): Promise<Result> {
  if (!hasSupabaseEnv()) return { ok: false, message: unavailable.message ?? "" };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: campusErrorMessage(error.message) };
  revalidatePath("/student/campus", "layout");
  return { ok: true };
}

export async function setFollow(organisationId: string, follow: boolean): Promise<Result> {
  if (!uuid.safeParse(organisationId).success) return { ok: false, message: "Reload the page and try again." };
  return toggle("follow_organisation", { p_organisation_id: organisationId, p_follow: follow === true });
}

export async function setLike(postId: string, like: boolean): Promise<Result> {
  if (!uuid.safeParse(postId).success) return { ok: false, message: "Reload the page and try again." };
  return toggle("set_post_like", { p_post_id: postId, p_like: like === true });
}

export async function setSave(postId: string, save: boolean): Promise<Result> {
  if (!uuid.safeParse(postId).success) return { ok: false, message: "Reload the page and try again." };
  return toggle("set_post_save", { p_post_id: postId, p_save: save === true });
}

export async function reportContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = reportFormSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: text(formData.get("reason")),
    note: text(formData.get("note")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_content", {
    p_target_type: d.targetType,
    p_target_id: d.targetId,
    p_reason: d.reason,
    p_note: d.note ?? null,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  return { status: "success", message: "Thanks. Perqly will look at it." };
}

// Perqly admins (two-factor; the database refuses otherwise) -----------------------------------

export async function createOrganisation(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createOrganisationSchema.safeParse({
    institutionId: text(formData.get("institutionId")),
    kind: text(formData.get("kind")),
    name: text(formData.get("name")),
    slug: text(formData.get("slug")),
    description: text(formData.get("description")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_organisation", {
    p_institution_id: d.institutionId,
    p_kind: d.kind,
    p_name: d.name,
    p_slug: d.slug,
    p_campus_id: null,
    p_description: d.description ?? null,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePath("/admin/campus/organisations");
  return { status: "success", message: "Created as a draft. Verify it and appoint an owner next." };
}

export async function setOrganisationStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ organisationId: z.uuid(), status: z.enum(["verified", "suspended", "archived"]) })
    .safeParse({ organisationId: formData.get("organisationId"), status: formData.get("status") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_organisation_status", {
    p_organisation_id: parsed.data.organisationId,
    p_status: parsed.data.status,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePath("/admin/campus/organisations");
  revalidateCampus(parsed.data.organisationId);
  return { status: "success", message: { verified: "Verified.", suspended: "Suspended.", archived: "Archived." }[parsed.data.status] };
}

export async function adminAppointMember(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = memberFormSchema.safeParse({
    organisationId: text(formData.get("organisationId")),
    email: text(formData.get("email")),
    role: text(formData.get("role")),
    title: text(formData.get("title")),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { data: userId, error: findError } = await supabase.rpc("admin_find_user_by_email", { p_email: d.email });
  if (findError) return { status: "error", message: campusErrorMessage(findError.message) };
  if (!userId) return { status: "error", fieldErrors: { email: "No Perqly account uses that email." } };
  const { error } = await supabase.rpc("admin_set_organisation_member", {
    p_organisation_id: d.organisationId,
    p_user_id: userId,
    p_role: d.role,
    p_title: d.title ?? null,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePath("/admin/campus/organisations");
  return { status: "success", message: "Appointed." };
}

export async function moderateReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ reportId: z.uuid(), action: z.enum(["dismiss", "hide", "remove"]) })
    .safeParse({ reportId: formData.get("reportId"), action: formData.get("action") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_report", { p_report_id: parsed.data.reportId, p_action: parsed.data.action });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePath("/admin/campus/moderation");
  revalidatePath("/student/campus", "layout");
  return { status: "success", message: { dismiss: "Dismissed.", hide: "Hidden.", remove: "Removed." }[parsed.data.action] };
}
