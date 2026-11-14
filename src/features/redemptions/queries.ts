import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DiscountType, LimitPeriod } from "@/features/offers/schemas";
import type { PaymentMethod, RejectReason, SessionStatus } from "./schemas";

export type SessionOffer = {
  offer_id: string;
  title: string;
  item_name: string;
  regular_price: number;
  discount_amount: number;
  final_price: number;
  discount_type: DiscountType;
  discount_value: number;
  conditions: string;
  per_student_limit: number;
  per_student_period: LimitPeriod;
  uses_left: number;
  resets_at: string | null;
};

export type RedemptionSession = {
  id: string;
  public_ref: string;
  status: SessionStatus;
  expires_at: string;
  merchant_name: string;
  merchant_slug: string;
  branch_name: string;
  offer_id: string | null;
  item_name: string | null;
  regular_price: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  discount_amount: number | null;
  final_price: number | null;
  pass_code: string | null;
  merchant_confirmed: boolean;
  completed_at: string | null;
  rejected_reason: RejectReason | null;
  rejected_note: string | null;
  first_name: string | null;
  institution: string;
  offers: SessionOffer[];
};

export async function getRedemptionSession(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_redemption_session", { p_session_id: id });
  if (error) throw new Error(`Could not load the redemption (${error.code})`);
  return (data as RedemptionSession | null) ?? null;
}

export async function getMyLiveSession() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_live_session");
  return (data as string | null) ?? null;
}

export type MyRedemption = {
  redemption_id: string;
  transaction_ref: string;
  merchant_name: string;
  merchant_slug: string;
  branch_name: string;
  item_name: string;
  regular_price: number;
  discount_amount: number;
  final_price: number;
  redeemed_at: string;
  voided: boolean;
};

export async function getMyHistory() {
  const supabase = await createClient();
  const [list, savings] = await Promise.all([
    supabase.rpc("list_my_redemptions", { p_limit: 100, p_offset: 0 }),
    supabase.from("student_savings").select("total_saved, total_spent_at_student_price, redemption_count, first_redeemed_at").maybeSingle(),
  ]);
  if (list.error) throw new Error(`Could not load your history (${list.error.code})`);
  return {
    redemptions: (list.data ?? []) as MyRedemption[],
    savings:
      (savings.data as {
        total_saved: number;
        total_spent_at_student_price: number;
        redemption_count: number;
        first_redeemed_at: string | null;
      } | null) ?? null,
  };
}

export type CounterSession = {
  session_id: string;
  public_ref: string;
  status: SessionStatus;
  branch_id: string;
  branch_name: string;
  student_first_name: string | null;
  institution: string;
  item_name: string | null;
  regular_price: number | null;
  discount_amount: number | null;
  final_price: number | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  pass_code: string | null;
  expires_at: string;
  merchant_confirmed_at: string | null;
  confirmed_by_me: boolean | null;
  location_signal: "near" | "far" | "unknown";
};

export async function getCounterSessions(merchantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_counter_sessions", { p_merchant_id: merchantId });
  if (error) throw new Error(`Could not load the counter (${error.code})`);
  return (data ?? []) as CounterSession[];
}

export type BranchCode = {
  branch_id: string;
  branch_name: string;
  qr_code_id: string | null;
  token: string | null;
  short_code: string | null;
  version: number | null;
  issued_at: string | null;
  last_scanned_at: string | null;
};

export async function getBranchCodes(merchantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_branch_codes", { p_merchant_id: merchantId });
  if (error) return null;
  return (data ?? []) as BranchCode[];
}

export type MerchantRedemption = {
  id: string;
  transaction_ref: string;
  item_name: string;
  regular_price: number;
  discount_amount: number;
  final_price: number;
  redeemed_at: string;
  payment_method: PaymentMethod | null;
  payment_status: "paid" | "unpaid" | null;
  voided_at: string | null;
  merchant_branches: { name: string } | null;
};

/** RLS limits cashiers to their branches; managers and owners see the whole business. */
export async function getMerchantRedemptions(merchantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("redemptions")
    .select(
      "id, transaction_ref, item_name, regular_price, discount_amount, final_price, redeemed_at, payment_method, payment_status, voided_at, merchant_branches(name)",
    )
    .eq("merchant_id", merchantId)
    .order("redeemed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load redemptions (${error.code})`);
  return (data ?? []) as unknown as MerchantRedemption[];
}

export type StaffRedemption = MerchantRedemption & { merchants: { id: string; display_name: string } | null; void_reason: string | null };

export async function getRedemptionsForStaff(ref?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("redemptions")
    .select(
      "id, transaction_ref, item_name, regular_price, discount_amount, final_price, redeemed_at, payment_method, payment_status, voided_at, void_reason, merchant_branches(name), merchants(id, display_name)",
    )
    .order("redeemed_at", { ascending: false })
    .limit(100);
  if (ref) query = query.eq("transaction_ref", ref);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load redemptions (${error.code})`);
  return (data ?? []) as unknown as StaffRedemption[];
}

export async function getNotifications() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }[];
}

export type SavingsSummary = {
  total_saved: number;
  redemptions: number;
  shops: number;
  best: number | null;
  first_at: string | null;
  by_month: { month: string; saved: number }[];
};

export async function getSavingsSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_savings_summary");
  if (error) throw new Error(`Could not load your savings (${error.code ?? "unknown"})`);
  return (data as SavingsSummary | null) ?? { total_saved: 0, redemptions: 0, shops: 0, best: null, first_at: null, by_month: [] };
}

export type CounterToday = {
  students: number;
  returning: number;
  discount_given: number;
  recent: {
    session_id: string;
    first_name: string | null;
    item: string | null;
    outcome: "confirmed" | "declined";
    reason: string | null;
    at: string;
    public_ref: string;
  }[];
};

export async function getCounterToday(merchantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("counter_today", { p_merchant_id: merchantId });
  if (error) return null;
  return data as CounterToday;
}
