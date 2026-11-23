import "server-only";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { parseResources, resourceSchema, type Category, type ResourceFilter, type ResourceStatus } from "./model";

/** Published resources for signed-in users, with optional search, category and filter. */
export async function listResources(opts: { q?: string; category?: Category; filter?: ResourceFilter } = {}) {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_student_resources", {
    p_query: opts.q?.slice(0, 80) || undefined,
    p_category: opts.category,
    p_filter: opts.filter,
  });
  if (error) return [];
  return parseResources(data);
}

export async function getResource(slug: string) {
  if (!hasSupabaseEnv() || !/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_student_resource", { p_slug: slug });
  if (error || !data) return null;
  const parsed = resourceSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Every resource for the admin screens; null when the caller isn't a Perqly admin with two-factor. */
export async function adminListResources(status?: ResourceStatus) {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_student_resources", { p_status: status });
  if (error) return null;
  return parseResources(data);
}

export async function adminGetResource(id: string) {
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_student_resource", { p_id: id });
  if (error || !data) return null;
  const parsed = resourceSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
