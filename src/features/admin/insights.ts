import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PlatformMetrics = {
  students: number;
  students_verified: number;
  applications_waiting: number;
  merchants_live: number;
  merchants_waiting: number;
  offers_live: number;
  offers_waiting: number;
  redemptions_7d: number;
  redemptions_30d: number;
  saved_30d: number;
  saved_all: number;
  deletion_requests_open: number;
  by_institution: { institution: string; redemptions: number; saved: number }[];
};

export async function getPlatformMetrics() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_platform_metrics");
  if (error) return null;
  return data as PlatformMetrics;
}

export type RedemptionFlag = {
  kind: "confirmed_not_completed" | "far_from_branch";
  student_id: string;
  student_name: string | null;
  merchant_id: string;
  merchant_name: string;
  occurrences: number;
  last_seen: string;
};

export async function getRedemptionFlags() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_redemption_flags");
  if (error) return [];
  return (data ?? []) as RedemptionFlag[];
}

export type FoundUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  is_suspended: boolean;
  suspended_reason: string | null;
  created_at: string;
  platform_role: string | null;
  institution: string | null;
  verification_status: string | null;
  business_roles: number;
  redemptions: number;
};

export async function findUsers(query: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_find_users", { p_query: query });
  if (error) throw new Error(`Could not search users (${error.code})`);
  return (data ?? []) as FoundUser[];
}

export type DeletionRequest = {
  id: string;
  user_id: string;
  note: string | null;
  source: "app" | "email";
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export type DeletionPreview = {
  blockers: string[];
  deleted: Record<string, number>;
  kept: Record<string, number>;
};

/** What completing a request would remove. Null when the viewer can't see it (no second factor). */
export async function getDeletionPreview(requestId: string): Promise<DeletionPreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_preview_account_deletion", { p_request_id: requestId });
  if (error || !data) return null;
  return data as DeletionPreview;
}

export async function getOpenDeletionRequests() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_deletion_requests")
    .select("id, user_id, note, source, created_at, profiles!account_deletion_requests_user_id_fkey(full_name)")
    .eq("status", "open")
    .order("created_at");
  return (data ?? []) as unknown as DeletionRequest[];
}

export type AuditRow = {
  id: number;
  occurred_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_context: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  merchant_id: string | null;
  institution_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
};

export async function getAuditLog(filters: { action?: string; entityId?: string; beforeId?: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_audit_log", {
    p_action_prefix: filters.action ?? null,
    p_entity_id: filters.entityId ?? null,
    p_before_id: filters.beforeId ?? null,
    p_limit: 100,
  });
  if (error) throw new Error(`Could not load the audit log (${error.code})`);
  return (data ?? []) as AuditRow[];
}

export type MerchantMetrics = {
  redemptions_7d: number;
  redemptions_30d: number;
  students_30d: number;
  discounts_30d: number;
  student_sales_30d: number;
  saves: number;
  confirmed_not_completed_30d: number;
  top_offers: { offer_id: string; title: string; redemptions: number }[];
  by_branch: { branch: string; redemptions: number }[];
};

export async function getMerchantMetrics(merchantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("merchant_metrics", { p_merchant_id: merchantId });
  if (error) return null;
  return data as MerchantMetrics;
}

export type ReportRow = { name: string; redemptions: number; students?: number; saved: number };
export type PlatformReport = {
  days: number;
  since: string;
  totals: { redemptions: number; students: number; businesses: number; saved: number; student_sales: number };
  voided: number;
  new_students_verified: number;
  new_businesses: number;
  by_institution: ReportRow[];
  by_business: ReportRow[];
  by_category: ReportRow[];
  by_day: { day: string; redemptions: number; saved: number }[];
};

export const REPORT_PERIODS = [7, 30, 90, 365] as const;

export async function getPlatformReport(days: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_report", { p_days: days });
  if (error) throw new Error(`Could not load the report (${error.code})`);
  return data as PlatformReport;
}

export type StaffMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  granted_by_name: string | null;
  since: string;
};

export async function getStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_staff");
  if (error) throw new Error(`Could not load staff (${error.code})`);
  return (data ?? []) as StaffMember[];
}

export type PlatformSetting = { key: string; value: number; updated_at: string };

export async function getPlatformSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_settings");
  if (error) throw new Error(`Could not load settings (${error.code})`);
  return (data ?? []) as PlatformSetting[];
}
