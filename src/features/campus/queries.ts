import "server-only";
import { cache } from "react";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  campusOverviewSchema,
  commentSchema,
  eventPostSchema,
  eventSchema,
  organisationSummarySchema,
  postListSchema,
  postSchema,
  type CampusEvent,
  type CampusEventPost,
  type CampusOverview,
  type CampusPost,
  type Cursor,
} from "./schemas";

/**
 * Campus reads. Every one calls a database function that takes the school from
 * the signed-in user and applies the switches, verification and isolation rules.
 */

export const BUCKET = "campus-media";

export const getCampusEnabled = cache(async (): Promise<{ posts: boolean; comments: boolean }> => {
  if (!hasSupabaseEnv()) return { posts: false, comments: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campus_enabled");
  if (error || !data) return { posts: false, comments: false };
  const parsed = z.object({ posts: z.boolean(), comments: z.boolean() }).safeParse(data);
  return parsed.success ? parsed.data : { posts: false, comments: false };
});

async function rpcList(fn: string, args: Record<string, unknown>): Promise<CampusPost[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} failed (${error.code ?? "unknown"})`);
  return postListSchema.parse(data ?? []);
}

const after = (c: Cursor | null) => ({ p_after_at: c?.at ?? null, p_after_id: c?.id ?? null });

export const getHighlights = () => rpcList("campus_highlights", {});
export const getFeed = (cursor: Cursor | null, followingOnly: boolean) =>
  rpcList("campus_feed", { ...after(cursor), p_following_only: followingOnly });
export const getPublicSchoolFeed = (cursor: Cursor | null) => rpcList("campus_public_school_feed", after(cursor));
export const getSavedPosts = (cursor: Cursor | null) => rpcList("my_saved_posts", after(cursor));
export const getOrganisationPosts = (organisationId: string, cursor: Cursor | null) =>
  rpcList("organisation_posts", { p_organisation_id: organisationId, ...after(cursor) });

export async function getPostDetail(postId: string) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_detail", { p_post_id: postId });
  if (error) throw new Error(`post_detail failed (${error.code ?? "unknown"})`);
  if (!data) return null;
  return postSchema
    .extend({
      comments: z.array(commentSchema).catch([]),
    })
    .parse(data);
}

const directorySchema = z.object({ full: z.boolean(), items: z.array(organisationSummarySchema.extend({ id: z.uuid() })) });

export async function getDirectory(query: string | null, cursor: { name: string; id: string } | null) {
  if (!hasSupabaseEnv()) return { full: false, items: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organisation_directory", {
    p_query: query,
    p_after_name: cursor?.name ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) throw new Error(`organisation_directory failed (${error.code ?? "unknown"})`);
  return directorySchema.parse(data);
}

const profileSchema = organisationSummarySchema.extend({
  id: z.uuid(),
  description: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  following: z.boolean(),
  my_role: z.string().nullable(),
  representatives: z.array(z.object({ name: z.string().nullable(), title: z.string().nullable(), role: z.string() })),
  posts: postListSchema,
});
export type OrganisationProfile = z.infer<typeof profileSchema>;

export async function getOrganisationProfile(slug: string): Promise<OrganisationProfile | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organisation_profile", { p_slug: slug });
  if (error) throw new Error(`organisation_profile failed (${error.code ?? "unknown"})`);
  return data ? profileSchema.parse(data) : null;
}

// Organise area -------------------------------------------------------------------------------

const myOrganisationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  kind: z.string(),
  status: z.string(),
  logo_path: z.string().nullable(),
  badge: z.enum(["verified", "university_official"]).nullable(),
  role: z.string(),
  title: z.string().nullable(),
  effective_role: z.string().nullable(),
  live: z.boolean(),
});
export type MyOrganisation = z.infer<typeof myOrganisationSchema>;

export async function getMyOrganisations(): Promise<MyOrganisation[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_organisations");
  if (error) throw new Error(`my_organisations failed (${error.code ?? "unknown"})`);
  return z.array(myOrganisationSchema).parse(data ?? []);
}

const editorOrganisationSchema = z.object({
  id: z.uuid(),
  institution_id: z.uuid(),
  kind: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logo_path: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  campus_id: z.uuid().nullable(),
  status: z.string(),
  badge: z.enum(["verified", "university_official"]).nullable(),
  my_role: z.string().nullable(),
  can_post_emergency: z.boolean(),
});
export type EditorOrganisation = z.infer<typeof editorOrganisationSchema>;

/** The organisation as its editors see it, or null when the caller can't publish for it. */
export async function getOrganisationForEditor(organisationId: string): Promise<EditorOrganisation | null> {
  if (!hasSupabaseEnv() || !z.uuid().safeParse(organisationId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organisation_for_editor", { p_organisation_id: organisationId });
  if (error || !data) return null;
  return editorOrganisationSchema.parse(data);
}

export async function getPostsForEditor(organisationId: string, cursor: Cursor | null) {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organisation_posts_for_editor", {
    p_organisation_id: organisationId,
    p_after_at: cursor?.at ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) return [];
  return postListSchema.parse(data ?? []);
}

const memberSchema = z.object({ user_id: z.uuid(), name: z.string().nullable(), role: z.string(), title: z.string().nullable() });
export type OrganisationMember = z.infer<typeof memberSchema>;

export async function getMembersForManager(organisationId: string): Promise<OrganisationMember[] | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organisation_members_for_manager", { p_organisation_id: organisationId });
  if (error) return null;
  return z.array(memberSchema).parse(data ?? []);
}

// Admin ---------------------------------------------------------------------------------------

const adminOrganisationSchema = z.object({
  id: z.uuid(),
  institution_id: z.uuid(),
  school: z.string(),
  kind: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  badge: z.enum(["verified", "university_official"]).nullable(),
  owners: z.number(),
  members: z.array(z.object({ user_id: z.uuid(), name: z.string().nullable(), role: z.string(), title: z.string().nullable() })),
});
export type AdminOrganisation = z.infer<typeof adminOrganisationSchema>;

export async function getAdminOrganisations(): Promise<AdminOrganisation[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_organisations", { p_institution_id: null });
  if (error) throw new Error(`admin_list_organisations failed (${error.code ?? "unknown"})`);
  return z.array(adminOrganisationSchema).parse(data ?? []);
}

const reportRowSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  reason: z.string(),
  note: z.string().nullable(),
  school: z.string(),
  target_type: z.enum(["post", "comment", "organisation"]),
  target_id: z.uuid(),
  summary: z.string().nullable(),
  reports_on_target: z.number(),
});
export type ReportRow = z.infer<typeof reportRowSchema>;

export async function getModerationQueue(): Promise<ReportRow[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("moderation_queue", { p_after_at: null, p_after_id: null });
  if (error) throw new Error(`moderation_queue failed (${error.code ?? "unknown"})`);
  return z.array(reportRowSchema).parse(data ?? []);
}

// Images ----------------------------------------------------------------------------------------

/**
 * Signed links for campus images, with the signed-in user's own client: Storage
 * rules decide which files they may see. Unreadable files are simply left out.
 */
export async function signCampusMedia(paths: (string | null | undefined)[], seconds = 600): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (wanted.length === 0 || !hasSupabaseEnv()) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(wanted, seconds);
  const out = new Map<string, string>();
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  return out;
}

/** Every image a list of posts needs: logos and the first image of each post. */
export function mediaPathsFor(posts: CampusPost[], all = false): string[] {
  return posts.flatMap((p) => [p.organisation.logo_path, ...(all ? p.media : p.media.slice(0, 1))].filter((x): x is string => Boolean(x)));
}

/** Schools an admin can create organisations for: listed ones only. */
export async function getListedInstitutions(): Promise<{ id: string; short_name: string; name: string }[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("institutions").select("id, short_name, name").in("status", ["pilot", "active"]).order("short_name");
  return (data ?? []) as { id: string; short_name: string; name: string }[];
}

/** Switches and school agreements, for Perqly admins. Null if not allowed or unavailable. */
export async function getCampusOverview(): Promise<CampusOverview | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_campus_overview");
  if (error || !data) return null;
  const parsed = campusOverviewSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// Events ------------------------------------------------------------------------------------

/** Event details for a post, or null if it isn't an event (or isn't readable). */
export async function getEventDetail(postId: string): Promise<CampusEvent | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_detail", { p_post_id: postId });
  if (error || !data) return null;
  const parsed = eventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function rpcEvents(fn: string, args: Record<string, unknown>): Promise<CampusEventPost[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} failed (${error.code ?? "unknown"})`);
  return z
    .array(eventPostSchema)
    .catch([])
    .parse(data ?? []);
}

export const getUpcomingEvents = (cursor: Cursor | null) =>
  rpcEvents("upcoming_events", { p_after_at: cursor?.at ?? null, p_after_id: cursor?.id ?? null });
export const getMyEvents = () => rpcEvents("my_events", {});
