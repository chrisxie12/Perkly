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
  institution_type: "public" | "private" | null;
  official_website: string | null;
  city: string | null;
  region: string | null;
  info_source_url: string | null;
  last_checked_at: string | null;
  accreditation_status: "unverified" | "confirmed" | "not_found" | "closed";
  accreditation_note: string | null;
  accreditation_checked_at: string | null;
  logo_status: "pending" | "official";
  logo_path: string | null;
  logo_source_url: string | null;
};

export type CampusDetail = {
  id: string;
  name: string;
  digital_address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  campus_type: "main" | "satellite" | "city" | "learning_centre";
  address: string | null;
  city: string | null;
  region: string | null;
  is_primary: boolean;
  source_url: string | null;
  info_status: "confirmed" | "unverified";
  last_checked_at: string | null;
};

export type InstitutionRequest = {
  id: string;
  institution_name: string;
  campus_name: string | null;
  city: string | null;
  status: "pending" | "added" | "declined";
  admin_note: string | null;
  created_at: string;
};

const INSTITUTION_COLUMNS =
  "id, slug, name, short_name, status, review_mode, review_delegated_at, academic_year_end_month, academic_year_end_day, institution_type, official_website, city, region, info_source_url, last_checked_at, accreditation_status, accreditation_note, accreditation_checked_at, logo_status, logo_path, logo_source_url";

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
    supabase
      .from("campuses")
      .select(
        "id, name, digital_address, latitude, longitude, is_active, campus_type, address, city, region, is_primary, source_url, info_status, last_checked_at",
      )
      .eq("institution_id", id)
      .order("is_primary", { ascending: false })
      .order("name"),
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
    campuses: (campuses.data ?? []) as CampusDetail[],
    reviewers: reviewerRows.map((row) => ({ ...row, full_name: names.get(row.user_id) ?? "Name not given" })),
  };
}

export async function listInstitutionRequests(status: "pending" | "all" = "pending") {
  const supabase = await createClient();
  let q = supabase
    .from("institution_requests")
    .select("id, institution_name, campus_name, city, status, admin_note, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "pending") q = q.eq("status", "pending");
  const { data } = await q;
  return (data ?? []) as InstitutionRequest[];
}
