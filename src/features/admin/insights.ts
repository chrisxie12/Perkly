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
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export async function getOpenDeletionRequests() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_deletion_requests")
    .select("id, user_id, note, created_at, profiles!account_deletion_requests_user_id_fkey(full_name)")
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
