"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { campusErrorMessage, commentFormSchema, eventFormSchema, eventSchema, parseLocalTime, type CampusEvent } from "./schemas";

// Comments (C2) and events (C3). Each action calls one database function, which checks
// the caller, their school, their role, the switches and the limits. No notifications.

const unavailable: FormState = { status: "error", message: "This isn't available in this environment yet." };
const text = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};
const uuid = z.uuid();
const reload: FormState = { status: "error", message: "Reload the page and try again." };

function revalidatePost(postId: string, organisationId?: string) {
  revalidatePath(`/student/campus/posts/${postId}`);
  revalidatePath("/student/campus/events");
  if (organisationId) revalidatePath(`/organise/${organisationId}/posts/${postId}`);
}

// Comments ------------------------------------------------------------------------------------

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = commentFormSchema.safeParse({ postId: text(formData.get("postId")), body: text(formData.get("body")) });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_comment", { p_post_id: parsed.data.postId, p_body: parsed.data.body });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePost(parsed.data.postId);
  return { status: "success", message: "Comment added." };
}

export async function removeComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const commentId = uuid.safeParse(formData.get("commentId"));
  const postId = uuid.safeParse(formData.get("postId"));
  if (!commentId.success || !postId.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_own_comment", { p_comment_id: commentId.data });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePost(postId.data);
  return { status: "success", message: "Deleted." };
}

/** Organisation editors on their own posts, and Perqly support anywhere. */
export async function hideComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const commentId = uuid.safeParse(formData.get("commentId"));
  const postId = uuid.safeParse(formData.get("postId"));
  if (!commentId.success || !postId.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_comment", { p_comment_id: commentId.data });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePost(postId.data);
  return { status: "success", message: "Hidden." };
}

// Events --------------------------------------------------------------------------------------

export async function setRsvp(postId: string, going: boolean): Promise<{ ok: true; event: CampusEvent } | { ok: false; message: string }> {
  if (!uuid.safeParse(postId).success) return { ok: false, message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return { ok: false, message: "This isn't available in this environment yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_rsvp", { p_post_id: postId, p_going: going === true });
  if (error) return { ok: false, message: campusErrorMessage(error.message) };
  const event = eventSchema.safeParse(data);
  if (!event.success) return { ok: false, message: "Something went wrong. Try again." };
  revalidatePost(postId);
  return { ok: true, event: event.data };
}

export async function saveEventDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = eventFormSchema.safeParse({
    postId: text(formData.get("postId")),
    organisationId: text(formData.get("organisationId")),
    startsAt: text(formData.get("startsAt")),
    endsAt: text(formData.get("endsAt")),
    venue: text(formData.get("venue")),
    capacity: text(formData.get("capacity")),
    rsvpOpen: formData.get("rsvpOpen") === "on",
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return unavailable;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_details", {
    p_post_id: d.postId,
    p_starts_at: parseLocalTime(d.startsAt)!,
    p_ends_at: d.endsAt ? parseLocalTime(d.endsAt) : null,
    p_venue: d.venue,
    p_capacity: d.capacity ?? null,
    p_rsvp_open: d.rsvpOpen,
  });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePost(d.postId, d.organisationId);
  return { status: "success", message: "Event details saved." };
}

export async function removeEventDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const postId = uuid.safeParse(formData.get("postId"));
  const organisationId = uuid.safeParse(formData.get("organisationId"));
  if (!postId.success || !organisationId.success) return reload;
  if (!hasSupabaseEnv()) return unavailable;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_event_details", { p_post_id: postId.data });
  if (error) return { status: "error", message: campusErrorMessage(error.message) };
  revalidatePost(postId.data, organisationId.data);
  return { status: "success", message: "This post is no longer an event. Its RSVPs were removed." };
}
