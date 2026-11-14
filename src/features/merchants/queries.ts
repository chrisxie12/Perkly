import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/session";
import type { MerchantMembership } from "@/lib/auth/roles";

export const ACTIVE_MERCHANT_COOKIE = "perqly_merchant";

export type MerchantRow = {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string | null;
  category_id: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: "draft" | "pending_review" | "approved" | "rejected" | "suspended";
  status_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export type BranchRow = {
  id: string;
  merchant_id: string;
  name: string;
  address_line: string | null;
  area: string | null;
  city: string;
  digital_address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  opening_hours: string | null;
  is_active: boolean;
};

export type TeamMember = {
  member_id: string;
  user_id: string;
  full_name: string;
  role: "owner" | "manager" | "cashier";
  branch_ids: string[];
  created_at: string;
};

const MERCHANT_COLUMNS =
  "id, slug, display_name, legal_name, category_id, description, phone, email, website, status, status_reason, submitted_at, approved_at, created_at";
const BRANCH_COLUMNS =
  "id, merchant_id, name, address_line, area, city, digital_address, latitude, longitude, phone, opening_hours, is_active";

export const getCategories = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("merchant_categories").select("id, slug, name, icon").eq("is_active", true).order("sort_order");
  return (data ?? []) as { id: string; slug: string; name: string; icon: string }[];
});

/**
 * The business the signed-in person is working on: the one chosen in the
 * switcher (a cookie), else their first. Null if they have none.
 */
export const getActiveMembership = cache(async (): Promise<MerchantMembership | null> => {
  const ctx = await getUserContext();
  if (!ctx || ctx.merchantRoles.length === 0) return null;
  const chosen = (await cookies()).get(ACTIVE_MERCHANT_COOKIE)?.value;
  return ctx.merchantRoles.find((m) => m.merchantId === chosen) ?? ctx.merchantRoles[0];
});

export async function getMerchant(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("merchants").select(MERCHANT_COLUMNS).eq("id", id).maybeSingle();
  return (data as MerchantRow | null) ?? null;
}

export async function getBranches(merchantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("merchant_branches").select(BRANCH_COLUMNS).eq("merchant_id", merchantId).order("name");
  return (data ?? []) as BranchRow[];
}

export async function getTeam(merchantId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_merchant_team", { p_merchant_id: merchantId });
  if (error) return null;
  return (data ?? []) as TeamMember[];
}

/** Staff list of businesses, newest first; pending review first. */
export async function listMerchantsForStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("merchants")
    .select(`${MERCHANT_COLUMNS}, merchant_categories(name)`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load businesses (${error.code})`);
  const rows = (data ?? []) as unknown as (MerchantRow & { merchant_categories: { name: string } | null })[];
  const order = { pending_review: 0, approved: 1, rejected: 2, draft: 3, suspended: 4 } as const;
  return rows.sort((a, b) => order[a.status] - order[b.status]);
}

/** Structured weekly hours for the business's branches, by branch id. */
export async function getBranchHours(branchIds: string[]) {
  const map = new Map<string, { weekday: number; opens: string; closes: string }[]>();
  if (branchIds.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("merchant_branch_hours")
    .select("branch_id, weekday, opens, closes")
    .in("branch_id", branchIds)
    .order("weekday");
  for (const r of (data ?? []) as { branch_id: string; weekday: number; opens: string; closes: string }[]) {
    const list = map.get(r.branch_id) ?? [];
    list.push({ weekday: r.weekday, opens: r.opens.slice(0, 5), closes: r.closes.slice(0, 5) });
    map.set(r.branch_id, list);
  }
  return map;
}
