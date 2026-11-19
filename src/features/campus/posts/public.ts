import "server-only";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decodeCursor, postSchema } from "../schemas";

/**
 * Public Campus pages (decision record, details 1 and 5).
 *
 * Signed-out visitors can't read Storage at all. So the page first asks the
 * database, with the normal anonymous client, whether the post or organisation
 * is public and live. Only for the image paths that answer returns does the
 * server sign links with the admin client, valid for 10 minutes. No path ever
 * comes from the browser.
 */

const BUCKET = "campus-media";
const LINK_SECONDS = 600;

const publicPostSchema = postSchema
  .pick({
    id: true,
    kind: true,
    title: true,
    body: true,
    link_url: true,
    video_url: true,
    publish_at: true,
    is_emergency: true,
    media: true,
  })
  .extend({
    organisation: z.object({
      name: z.string(),
      slug: z.string(),
      kind: z.string(),
      logo_path: z.string().nullable(),
      badge: z.enum(["verified", "university_official"]).nullable(),
      school_slug: z.string(),
      school: z.string(),
    }),
  });
export type PublicPost = z.infer<typeof publicPostSchema>;

const publicOrganisationSchema = z.object({
  name: z.string(),
  slug: z.string(),
  kind: z.string(),
  description: z.string().nullable(),
  logo_path: z.string().nullable(),
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  badge: z.enum(["verified", "university_official"]).nullable(),
  school: z.string(),
  school_slug: z.string(),
  posts: z.array(publicPostSchema),
});
export type PublicOrganisation = z.infer<typeof publicOrganisationSchema>;

type Signer = (paths: string[]) => Promise<Map<string, string>>;

async function adminSigner(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS);
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  return out;
}

/** Signs exactly the paths the database returned for this public content. Exported for tests. */
export async function signReturnedPaths(paths: (string | null | undefined)[], sign: Signer = adminSigner) {
  const wanted = [...new Set(paths.filter((p): p is string => typeof p === "string" && p.length > 0))];
  return wanted.length === 0 ? new Map<string, string>() : sign(wanted);
}

export async function getPublicPost(postId: string): Promise<{ post: PublicPost; images: Map<string, string> } | null> {
  if (!hasSupabaseEnv() || !z.uuid().safeParse(postId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_post", { p_post_id: postId });
  if (error || !data) return null;
  const post = publicPostSchema.parse(data);
  return { post, images: await signReturnedPaths([post.organisation.logo_path, ...post.media]) };
}

export async function getPublicOrganisation(
  schoolSlug: string,
  orgSlug: string,
  after: unknown,
): Promise<{ organisation: PublicOrganisation; images: Map<string, string> } | null> {
  if (!hasSupabaseEnv()) return null;
  const cursor = decodeCursor(after);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_organisation", {
    p_school_slug: schoolSlug,
    p_org_slug: orgSlug,
    p_after_at: cursor?.at ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error || !data) return null;
  const organisation = publicOrganisationSchema.parse(data);
  const paths = [organisation.logo_path, ...organisation.posts.flatMap((p) => p.media.slice(0, 1))];
  return { organisation, images: await signReturnedPaths(paths) };
}
