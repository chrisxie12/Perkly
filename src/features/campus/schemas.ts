import { z } from "zod";

/** Campus C1: shared types, form rules and messages. No server-only imports: unit tested. */

export const POST_KINDS = [
  { value: "official_announcement", label: "Announcement" },
  { value: "src_programme", label: "SRC programme" },
  { value: "departmental_update", label: "Departmental update" },
  { value: "academic_notice", label: "Academic notice" },
  { value: "campus_news", label: "Campus news" },
  { value: "entertainment", label: "Entertainment" },
  { value: "workshop_seminar", label: "Workshop or seminar" },
  { value: "sports", label: "Sports" },
  { value: "emergency_notice", label: "Emergency notice" },
] as const;
export type PostKind = (typeof POST_KINDS)[number]["value"];
const POST_KIND_VALUES = POST_KINDS.map((k) => k.value) as [PostKind, ...PostKind[]];

export const ORG_KINDS = [
  { value: "src", label: "SRC" },
  { value: "faculty", label: "Faculty" },
  { value: "department", label: "Department" },
  { value: "hall", label: "Hall" },
  { value: "club", label: "Club" },
  { value: "society", label: "Society" },
  { value: "association", label: "Student association" },
  { value: "administration", label: "University administration" },
] as const;
export type OrgKind = (typeof ORG_KINDS)[number]["value"];
const ORG_KIND_VALUES = ORG_KINDS.map((k) => k.value) as [OrgKind, ...OrgKind[]];

export const postKindLabel = (kind: string) => POST_KINDS.find((k) => k.value === kind)?.label ?? "Post";
export const orgKindLabel = (kind: string) => ORG_KINDS.find((k) => k.value === kind)?.label ?? "Organisation";

export type Badge = "verified" | "university_official" | null;

/** The two badges (decision D-C1). "University official" needs a recorded school agreement. */
export function badgeLabel(badge: Badge | undefined): string | null {
  if (badge === "university_official") return "University official";
  if (badge === "verified") return "Verified organisation";
  return null;
}

// Rows as the database functions return them --------------------------------------------

export const organisationSummarySchema = z.object({
  id: z.uuid().optional(),
  name: z.string(),
  slug: z.string(),
  kind: z.string(),
  logo_path: z.string().nullable(),
  badge: z.enum(["verified", "university_official"]).nullable(),
  school_slug: z.string().optional(),
  school: z.string().optional(),
});
export type OrganisationSummary = z.infer<typeof organisationSummarySchema>;

export const postSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  link_url: z.string().nullable(),
  video_url: z.string().nullable(),
  visibility: z.enum(["school", "public"]).optional(),
  status: z.string().optional(),
  publish_at: z.string().nullable(),
  pinned_until: z.string().nullable().optional(),
  is_emergency: z.boolean(),
  organisation: organisationSummarySchema,
  media: z.array(z.string()),
  like_count: z.number().optional(),
  comment_count: z.number().optional(),
  liked: z.boolean().optional(),
  saved: z.boolean().optional(),
  can_edit: z.boolean().optional(),
  created_at: z.string().optional(),
  saved_at: z.string().optional(),
});
export type CampusPost = z.infer<typeof postSchema>;

export const postListSchema = z.array(postSchema).catch([]);

// Cursors: (publish_at, id), opaque to the browser -----------------------------------------

const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() });
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(at: string | null | undefined, id: string): string | null {
  if (!at) return null;
  return Buffer.from(JSON.stringify({ at, id }), "utf8").toString("base64url");
}

export function decodeCursor(value: unknown): Cursor | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The cursor for the page after this one, or null when the page wasn't full. */
export function nextCursor(page: { publish_at: string | null; id: string }[], pageSize = 30): string | null {
  if (page.length < pageSize) return null;
  const last = page[page.length - 1];
  return encodeCursor(last.publish_at, last.id);
}

// Forms ------------------------------------------------------------------------------------

const UUID = z.uuid({ error: "Something went wrong. Reload the page and try again." });
export const MEDIA_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(post|logo)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const optionalHttps = z
  .string()
  .trim()
  .max(500, "Keep links under 500 characters.")
  .regex(/^https:\/\/\S+$/, "Use a full link starting with https://")
  .optional();

export const postFormSchema = z.object({
  organisationId: UUID,
  postId: UUID.optional(),
  kind: z.enum(POST_KIND_VALUES, { error: "Choose what kind of post this is." }),
  title: z.string({ error: "Add a title." }).trim().min(3, "Use at least 3 characters.").max(140, "Keep the title under 140 characters."),
  body: z.string({ error: "Write the post." }).trim().min(1, "Write the post.").max(5000, "Keep the post under 5,000 characters."),
  linkUrl: optionalHttps,
  videoUrl: optionalHttps,
  visibility: z.enum(["school", "public"]).default("school"),
  media: z.array(z.string().regex(MEDIA_PATH, "That image didn't upload properly. Remove it and try again.")).max(6, "Add up to 6 images."),
});

export const memberFormSchema = z.object({
  organisationId: UUID,
  email: z.email({ error: "Enter their Perqly sign-in email." }).trim().toLowerCase(),
  role: z.enum(["owner", "admin", "editor"], { error: "Choose a role." }),
  title: z.string().trim().min(2, "Use at least 2 characters.").max(60, "Keep the title under 60 characters.").optional(),
});

export const organisationFormSchema = z.object({
  organisationId: UUID,
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters.").optional(),
  contactEmail: z.email({ error: "Enter a valid email address." }).trim().optional(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ]{6,19}$/, "Enter a phone number like 024 123 4567 or +233 24 123 4567.")
    .optional(),
  logoPath: z.string().regex(MEDIA_PATH).optional(),
});

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "misleading", label: "False or misleading" },
  { value: "impersonation", label: "Pretends to be someone else" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Something else" },
] as const;

export const reportFormSchema = z.object({
  targetType: z.enum(["post", "comment", "organisation"]),
  targetId: UUID,
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]], { error: "Choose a reason." }),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export const createOrganisationSchema = z.object({
  institutionId: UUID,
  kind: z.enum(ORG_KIND_VALUES, { error: "Choose a kind." }),
  name: z.string({ error: "Add the name." }).trim().min(2, "Add the name.").max(120, "Keep the name under 120 characters."),
  slug: z
    .string({ error: "Add a short web name." })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,64}$/, "Use 2 to 64 lowercase letters, numbers and hyphens, like src or coding-club."),
  description: z.string().trim().max(2000).optional(),
});

/**
 * A schedule time from an <input type="datetime-local">. Ghana is on UTC all
 * year, so the wall-clock time the organiser typed is read as UTC.
 */
export function parseScheduleTime(value: unknown, now = new Date()): { ok: true; iso: string } | { ok: false; message: string } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return { ok: false, message: "Choose a date and time." };
  }
  const at = new Date(`${value}:00Z`);
  if (Number.isNaN(at.getTime())) return { ok: false, message: "Choose a date and time." };
  if (at.getTime() <= now.getTime()) return { ok: false, message: "Choose a time in the future, or publish now." };
  if (at.getTime() > now.getTime() + 60 * 24 * 60 * 60 * 1000) return { ok: false, message: "You can schedule up to 60 days ahead." };
  return { ok: true, iso: at.toISOString() };
}

/** Database error codes as plain sentences. */
const MESSAGES: Record<string, string> = {
  campus_disabled: "Campus isn't available yet.",
  not_authenticated: "Sign in to continue.",
  account_suspended: "Your account is suspended, so you can't do this.",
  forbidden: "You don't have permission to do this.",
  not_found: "This isn't available to you.",
  post_not_found: "This post isn't available.",
  organisation_not_found: "This organisation isn't available.",
  post_invalid: "Check the post: the title, text and links need fixing.",
  image_missing: "One of the images didn't finish uploading. Remove it and add it again.",
  emergency_not_allowed: "Only Perqly or a University official organisation can post emergency notices.",
  publish_time_invalid: "Choose a time in the next 60 days.",
  post_already_live: "This post is already live, so its time can't change.",
  status_invalid: "That change isn't possible for this post right now.",
  pin_invalid: "Pin a published post for up to 30 days.",
  rate_limited: "That's the limit for now. Try again later.",
  member_not_eligible: "That address can't be added. They need a Perqly account and to be a verified student at your school.",
  admin_only: "Perqly adds members to this organisation. Contact Perqly support.",
  last_owner: "Every organisation needs an owner. Add another owner first.",
  member_not_found: "That person isn't a member.",
  role_invalid: "Choose a role.",
  organisation_invalid: "Check the details and try again.",
  campus_invalid: "Choose a campus of this school.",
  slug_taken: "Another organisation at this school already uses that web name.",
  institution_not_listed: "This school isn't listed on Perqly yet.",
  agreement_required: "This needs a signed agreement with the school first.",
  already_reported: "You've already reported this. Perqly will look at it.",
  report_invalid: "Choose a reason.",
  report_not_found: "That report has already been handled.",
  action_invalid: "That action isn't available here.",
  comment_invalid: "Write a comment of up to 1,000 characters.",
  setting_not_tunable: "That setting can't be changed here.",
  agreement_not_found: "There's no agreement on record for this school.",
  event_invalid: "Check the event: it needs a venue, a start within the next year, and an end after the start (up to 14 days).",
  event_not_allowed: "Emergency notices can't be events.",
  capacity_below_going: "More people are already going than that. Choose a bigger number.",
  event_not_found: "This post isn't an event.",
  event_over: "This event has finished.",
  event_full: "This event is full.",
  rsvp_closed: "The organisers have closed RSVPs for this event.",
};

export function campusErrorMessage(raw: string | undefined | null): string {
  if (!raw) return "Something went wrong. Try again.";
  if (MESSAGES[raw]) return MESSAGES[raw];
  // Longest code first, so post_not_found never reads as not_found.
  const code = Object.keys(MESSAGES)
    .sort((a, b) => b.length - a.length)
    .find((k) => raw.includes(k));
  return code ? MESSAGES[code] : "Something went wrong. Try again.";
}

/** "17 Nov, 09:30" in Ghana time (UTC, no daylight saving). */
export function formatPostTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(d);
}

/** Is a post with this publish time still waiting to go live? */
export const isScheduled = (publishAt: string | null | undefined, now = Date.now()) =>
  Boolean(publishAt && new Date(publishAt).getTime() > now);

/** Is a pin still in force? */
export const isPinnedNow = (pinnedUntil: string | null | undefined, now = Date.now()) =>
  Boolean(pinnedUntil && new Date(pinnedUntil).getTime() > now);

// Switches and school agreements (Perqly admins) ---------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const agreementFormSchema = z
  .object({
    institutionId: UUID,
    signedOn: z.string({ error: "Add the date it was signed." }).regex(DAY, "Add the date it was signed."),
    endsOn: z.string().regex(DAY, "Use a full date.").optional(),
    signedByName: z
      .string({ error: "Add who signed for the school." })
      .trim()
      .min(3, "Add who signed for the school.")
      .max(120, "Keep the name under 120 characters."),
    documentRef: z
      .string({ error: "Add where the signed copy is kept." })
      .trim()
      .min(3, "Add where the signed copy is kept.")
      .max(200, "Keep this under 200 characters."),
  })
  .refine((d) => !d.endsOn || d.endsOn > d.signedOn, { path: ["endsOn"], message: "The end date must be after the signing date." });

export const campusOverviewSchema = z.object({
  switches: z.object({ posts: z.boolean(), comments: z.boolean(), push: z.boolean().default(false) }),
  schools: z
    .array(
      z.object({
        institution_id: z.string(),
        short_name: z.string(),
        name: z.string(),
        signed_on: z.string().nullable(),
        ends_on: z.string().nullable(),
        signed_by_name: z.string().nullable(),
        document_ref: z.string().nullable(),
        recorded_at: z.string().nullable(),
        active: z.boolean(),
        organisations: z.number(),
      }),
    )
    .catch([]),
});
export type CampusOverview = z.infer<typeof campusOverviewSchema>;

/** "17 Nov 2026" for a plain date (YYYY-MM-DD). */
export function formatDay(day: string | null | undefined): string {
  if (!day || !DAY.test(day)) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

// Comments and events ----------------------------------------------------------------------

export const commentSchema = z.object({ id: z.uuid(), body: z.string(), created_at: z.string(), author: z.string(), mine: z.boolean() });
export type CampusComment = z.infer<typeof commentSchema>;

export const commentFormSchema = z.object({
  postId: UUID,
  body: z.string({ error: "Write a comment." }).trim().min(1, "Write a comment.").max(1000, "Keep comments under 1,000 characters."),
});

export const eventSchema = z.object({
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  venue: z.string(),
  capacity: z.number().nullable(),
  rsvp_open: z.boolean(),
  going: z.number(),
  i_am_going: z.boolean(),
  over: z.boolean(),
});
export type CampusEvent = z.infer<typeof eventSchema>;

export const eventPostSchema = postSchema.extend({ event: eventSchema });
export type CampusEventPost = z.infer<typeof eventPostSchema>;

/** A wall-clock time from <input type="datetime-local">, read as Ghana time (UTC). */
export function parseLocalTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = new Date(`${value}:00Z`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The value for a datetime-local input, in Ghana time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

export const eventFormSchema = z
  .object({
    postId: UUID,
    organisationId: UUID,
    startsAt: z.string({ error: "Choose when it starts." }),
    endsAt: z.string().optional(),
    venue: z
      .string({ error: "Add where it happens." })
      .trim()
      .min(2, "Add where it happens.")
      .max(160, "Keep the venue under 160 characters."),
    capacity: z.coerce.number().int("Use a whole number.").min(1, "At least 1.").max(100000, "That's too many.").optional(),
    rsvpOpen: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (!parseLocalTime(d.startsAt)) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Choose when it starts." });
    if (d.endsAt !== undefined) {
      const end = parseLocalTime(d.endsAt);
      const start = parseLocalTime(d.startsAt);
      if (!end) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Choose a date and time, or leave it empty." });
      else if (start && end <= start) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start." });
      else if (start && Date.parse(end) - Date.parse(start) > 14 * 24 * 60 * 60 * 1000)
        ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Events can last up to 14 days." });
    }
  });

/** "Sat 21 Nov, 18:00 – 22:00" in Ghana time. */
export function formatEventTime(startsAt: string, endsAt: string | null): string {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });
  const s = new Date(startsAt);
  if (Number.isNaN(s.getTime())) return "";
  const start = `${day.format(s)}, ${time.format(s)}`;
  if (!endsAt) return start;
  const e = new Date(endsAt);
  if (Number.isNaN(e.getTime())) return start;
  return day.format(e) === day.format(s) ? `${start} – ${time.format(e)}` : `${start} – ${day.format(e)}, ${time.format(e)}`;
}

/** "12 going", "12 of 50 going", or "Full". */
export function goingLabel(event: Pick<CampusEvent, "going" | "capacity">): string {
  if (event.capacity !== null && event.going >= event.capacity) return `Full (${event.capacity} going)`;
  return event.capacity !== null ? `${event.going} of ${event.capacity} going` : `${event.going} going`;
}

/** Event list cursor: (starts_at, id), oldest first. */
export function nextEventCursor(page: { id: string; event: { starts_at: string } }[], pageSize = 30): string | null {
  const last = page.at(-1);
  return page.length === pageSize && last ? encodeCursor(last.event.starts_at, last.id) : null;
}
