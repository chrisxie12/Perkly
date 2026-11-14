import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ApplicationRow = {
  id: string;
  student_id: string;
  institution_id: string;
  status: string;
  student_id_number: string | null;
  programme: string | null;
  level: string | null;
  grad_year: number | null;
  institutional_email: string | null;
  institutional_email_confirmed: boolean;
  institutional_email_domain_listed: boolean;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  reviewer_note: string | null;
  documents_deleted_at: string | null;
};

const COLUMNS =
  "id, student_id, institution_id, status, student_id_number, programme, level, grad_year, institutional_email, institutional_email_confirmed, institutional_email_domain_listed, submitted_at, decided_at, decided_by, decision_reason, reviewer_note, documents_deleted_at";

/** Applicants' names, through a function that only returns them for applications the caller may review. */
async function namesFor(applicationIds: string[]): Promise<Map<string, string>> {
  if (applicationIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_verification_applicant_names", { p_application_ids: applicationIds });
  return new Map(
    ((data ?? []) as { application_id: string; full_name: string | null }[]).map((row) => [
      row.application_id,
      row.full_name ?? "Name not given",
    ]),
  );
}

export type ReviewableInstitution = { institution_id: string; short_name: string; name: string; via: "institution" | "delegated" };

/**
 * Institutions the caller can decide for right now (the database's own rule).
 * RLS lets support staff read every application, so queues are filtered to
 * these: nobody is shown work they can't act on.
 */
export const getReviewableInstitutions = cache(async (): Promise<ReviewableInstitution[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_reviewable_institutions");
  if (error) throw new Error(`Could not load your institutions (${error.code ?? "unknown"})`);
  return (data ?? []) as ReviewableInstitution[];
});

async function reviewableIds() {
  return (await getReviewableInstitutions()).map((row) => row.institution_id);
}

/** Applications waiting for a decision at institutions the caller can review. */
export async function getQueue() {
  const ids = await reviewableIds();
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_verifications")
    .select(COLUMNS)
    .in("institution_id", ids)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not load the queue (${error.code})`);
  const rows = (data ?? []) as ApplicationRow[];
  const names = await namesFor(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, full_name: names.get(row.id) ?? "Name not given" }));
}

export async function getDecided(limit = 100) {
  const ids = await reviewableIds();
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_verifications")
    .select(COLUMNS)
    .in("institution_id", ids)
    .in("status", ["approved", "rejected", "resubmission_requested"])
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load decisions (${error.code})`);
  const rows = (data ?? []) as ApplicationRow[];
  const names = await namesFor(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, full_name: names.get(row.id) ?? "Name not given" }));
}

export async function getApplication(id: string) {
  const ids = await reviewableIds();
  const supabase = await createClient();
  const { data } = await supabase.from("student_verifications").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const row = data as ApplicationRow;
  if (!ids.includes(row.institution_id)) return null;
  const [names, institution, history] = await Promise.all([
    namesFor([row.id]),
    supabase.from("institutions").select("short_name").eq("id", row.institution_id).maybeSingle(),
    supabase
      .from("student_verifications")
      .select("id, status, decided_at, decision_reason")
      .eq("student_id", row.student_id)
      .neq("id", id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    ...row,
    full_name: names.get(row.id) ?? "Name not given",
    institution_short_name: (institution.data as { short_name: string } | null)?.short_name ?? "",
    history: (history.data ?? []) as { id: string; status: string; decided_at: string | null; decision_reason: string | null }[],
  };
}

/** Five-minute signed links for the documents. The database function checks the reviewer and audits the view. */
export async function getDocumentLinks(
  applicationId: string,
): Promise<{ idCard: string | null; selfie: string | null; deleted: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_verification_document_paths", { p_application_id: applicationId });
  if (error || !data) return { idCard: null, selfie: null, deleted: false, error: error?.message ?? "unavailable" };
  const paths = data as { id_card: string | null; selfie: string | null; deleted_at?: string };
  if (paths.deleted_at) return { idCard: null, selfie: null, deleted: true };
  const sign = async (path: string | null) => {
    if (!path) return null;
    const { data: signed } = await supabase.storage.from("verification-documents").createSignedUrl(path, 300);
    return signed?.signedUrl ?? null;
  };
  const [idCard, selfie] = await Promise.all([sign(paths.id_card), sign(paths.selfie)]);
  return { idCard, selfie, deleted: false };
}

export type InstitutionOverviewRow = {
  institution_id: string;
  short_name: string;
  name: string;
  via: "institution" | "delegated";
  waiting: number;
  oldest_waiting_at: string | null;
  decided_7d: number;
  verified: number;
  expiring_30d: number;
};

export async function getInstitutionOverview() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("institution_overview");
  if (error) throw new Error(`Could not load the overview (${error.code})`);
  return (data ?? []) as InstitutionOverviewRow[];
}

export type InstitutionStudent = {
  student_id: string;
  full_name: string | null;
  programme: string | null;
  level: string | null;
  grad_year: number | null;
  campus: string | null;
  state: "verified" | "expired";
  verified_at: string | null;
  verified_until: string | null;
};

export async function getInstitutionStudents(institutionId: string, query?: string, state: "verified" | "expired" | "all" = "verified") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("institution_students", {
    p_institution_id: institutionId,
    p_query: query ?? null,
    p_state: state,
  });
  if (error) throw new Error(`Could not load students (${error.code})`);
  return (data ?? []) as InstitutionStudent[];
}

export async function getInstitutionSettings(institutionId: string) {
  const supabase = await createClient();
  const [inst, domains, campuses] = await Promise.all([
    supabase
      .from("institutions")
      .select("id, name, short_name, status, review_mode, review_delegated_at, academic_year_end_month, academic_year_end_day")
      .eq("id", institutionId)
      .maybeSingle(),
    supabase.from("institution_email_domains").select("id, domain, is_active").eq("institution_id", institutionId).order("domain"),
    supabase.from("campuses").select("id, name, digital_address, is_active").eq("institution_id", institutionId).order("name"),
  ]);
  return {
    institution: inst.data as {
      id: string;
      name: string;
      short_name: string;
      status: string;
      review_mode: "institution" | "delegated";
      review_delegated_at: string | null;
      academic_year_end_month: number | null;
      academic_year_end_day: number | null;
    } | null,
    domains: (domains.data ?? []) as { id: string; domain: string; is_active: boolean }[],
    campuses: (campuses.data ?? []) as { id: string; name: string; digital_address: string | null; is_active: boolean }[],
  };
}
