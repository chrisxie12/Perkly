import "server-only";
import { createClient } from "@/lib/supabase/server";

// Platform staff read these tables through RLS (reviewer and above for
// institutions, domains and campuses; support and above for reviewers and names).

export type InstitutionRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  status: "inactive" | "pilot" | "active";
  review_mode: "institution" | "delegated";
  review_delegated_at: string | null;
  academic_year_end_month: number | null;
  academic_year_end_day: number | null;
};

const INSTITUTION_COLUMNS =
  "id, slug, name, short_name, status, review_mode, review_delegated_at, academic_year_end_month, academic_year_end_day";

export async function listInstitutions() {
  const supabase = await createClient();
  const [institutions, reviewers] = await Promise.all([
    supabase.from("institutions").select(INSTITUTION_COLUMNS).order("name"),
    supabase.from("institution_reviewers").select("institution_id").eq("status", "active"),
  ]);
  if (institutions.error) throw new Error(`Could not load institutions (${institutions.error.code})`);

  const count = (rows: { institution_id: string }[] | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) map.set(row.institution_id, (map.get(row.institution_id) ?? 0) + 1);
    return map;
  };
  const reviewerCounts = count(reviewers.data);
  return (institutions.data as InstitutionRow[]).map((row) => ({
    ...row,
    reviewers: reviewerCounts.get(row.id) ?? 0,
  }));
}

export async function getInstitutionDetail(id: string) {
  const supabase = await createClient();
  const { data: institution } = await supabase.from("institutions").select(INSTITUTION_COLUMNS).eq("id", id).maybeSingle();
  if (!institution) return null;

  const [domains, campuses, reviewers] = await Promise.all([
    supabase.from("institution_email_domains").select("id, domain, is_active").eq("institution_id", id).order("domain"),
    supabase.from("campuses").select("id, name, digital_address, latitude, longitude, is_active").eq("institution_id", id).order("name"),
    supabase
      .from("institution_reviewers")
      .select("id, user_id, role, status, created_at")
      .eq("institution_id", id)
      .eq("status", "active")
      .order("created_at"),
  ]);

  const reviewerRows = (reviewers.data ?? []) as {
    id: string;
    user_id: string;
    role: "reviewer" | "admin";
    status: string;
    created_at: string;
  }[];
  const names = new Map<string, string>();
  if (reviewerRows.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        reviewerRows.map((row) => row.user_id),
      );
    for (const row of (data ?? []) as { id: string; full_name: string | null }[]) names.set(row.id, row.full_name ?? "Name not given");
  }

  return {
    institution: institution as InstitutionRow,
    domains: (domains.data ?? []) as { id: string; domain: string; is_active: boolean }[],
    campuses: (campuses.data ?? []) as {
      id: string;
      name: string;
      digital_address: string | null;
      latitude: number | null;
      longitude: number | null;
      is_active: boolean;
    }[],
    reviewers: reviewerRows.map((row) => ({ ...row, full_name: names.get(row.user_id) ?? "Name not given" })),
  };
}
