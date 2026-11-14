import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DiscountType, LimitPeriod } from "./schemas";

export type OfferListing = {
  offer_id: string;
  title: string;
  item_name: string;
  item_kind: "service" | "product";
  merchant_id: string;
  merchant_slug: string;
  merchant_name: string;
  category_slug: string;
  category_name: string;
  category_icon: string;
  regular_price: number;
  discount_amount: number;
  final_price: number;
  discount_type: DiscountType;
  discount_value: number;
  ends_at: string | null;
  per_student_limit: number;
  per_student_period: LimitPeriod;
  is_favourite: boolean;
};

export type OfferDetail = {
  offer_id: string;
  title: string;
  item_name: string;
  item_kind: "service" | "product";
  item_description: string | null;
  duration_minutes: number | null;
  description: string | null;
  conditions: string;
  discount_type: DiscountType;
  discount_value: number;
  regular_price: number;
  discount_amount: number;
  final_price: number;
  starts_at: string;
  ends_at: string | null;
  per_student_limit: number;
  per_student_period: LimitPeriod;
  merchant: { id: string; slug: string; display_name: string; category: string; phone: string | null };
  branches: {
    id: string;
    name: string;
    address: string;
    digital_address: string | null;
    opening_hours: string | null;
    latitude: number | null;
    longitude: number | null;
  }[];
  is_favourite: boolean;
};

export type MerchantPage = {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  category: string;
  category_icon: string;
  is_favourite: boolean;
  branches: {
    id: string;
    name: string;
    address: string;
    digital_address: string | null;
    opening_hours: string | null;
    phone: string | null;
  }[];
};

export async function listOffers(params: { query?: string; category?: string; merchantId?: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_offers", {
    p_query: params.query ?? null,
    p_category: params.category ?? null,
    p_merchant_id: params.merchantId ?? null,
    p_limit: 60,
    p_offset: 0,
  });
  if (error) throw new Error(`Could not load offers (${error.code ?? "unknown"})`);
  return (data ?? []) as OfferListing[];
}

export async function getOffer(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_offer", { p_offer_id: id });
  return (data as OfferDetail | null) ?? null;
}

export async function getMerchantPage(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_merchant_page", { p_slug: slug });
  return (data as MerchantPage | null) ?? null;
}

export async function listFavourites() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_favourite_merchants");
  return (data ?? []) as {
    merchant_id: string;
    slug: string;
    display_name: string;
    category_name: string;
    category_icon: string;
    live_offers: number;
  }[];
}

// Merchant side --------------------------------------------------------------------
export type CatalogueItem = {
  id: string;
  kind: "service" | "product";
  name: string;
  description: string | null;
  regular_price: number;
  duration_minutes: number | null;
  sku: string | null;
  is_active: boolean;
};

export async function getCatalogue(merchantId: string): Promise<CatalogueItem[]> {
  const supabase = await createClient();
  const [services, products] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, description, regular_price, duration_minutes, is_active")
      .eq("merchant_id", merchantId)
      .order("name"),
    supabase.from("products").select("id, name, description, regular_price, sku, is_active").eq("merchant_id", merchantId).order("name"),
  ]);
  return [
    ...((services.data ?? []) as Omit<CatalogueItem, "kind" | "sku">[]).map((s) => ({ ...s, kind: "service" as const, sku: null })),
    ...((products.data ?? []) as Omit<CatalogueItem, "kind" | "duration_minutes">[]).map((p) => ({
      ...p,
      kind: "product" as const,
      duration_minutes: null,
    })),
  ];
}

export type MerchantOffer = {
  id: string;
  service_id: string | null;
  product_id: string | null;
  title: string | null;
  description: string | null;
  conditions: string;
  discount_type: DiscountType;
  discount_value: number;
  starts_at: string;
  ends_at: string | null;
  status: string;
  status_reason: string | null;
  per_student_limit: number;
  per_student_period: LimitPeriod;
  total_cap: number | null;
  redemption_count: number;
  offer_branches: { branch_id: string }[];
  offer_institutions: { institution_id: string }[];
};

const OFFER_COLUMNS =
  "id, service_id, product_id, title, description, conditions, discount_type, discount_value, starts_at, ends_at, status, status_reason, per_student_limit, per_student_period, total_cap, redemption_count, offer_branches(branch_id), offer_institutions(institution_id)";

export async function getMerchantOffers(merchantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as MerchantOffer[];
}

export async function getMerchantOffer(merchantId: string, offerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("offers").select(OFFER_COLUMNS).eq("merchant_id", merchantId).eq("id", offerId).maybeSingle();
  return (data as unknown as MerchantOffer | null) ?? null;
}

export async function getListedInstitutions() {
  const supabase = await createClient();
  const { data } = await supabase.from("institutions").select("id, short_name, name").in("status", ["pilot", "active"]).order("short_name");
  return (data ?? []) as { id: string; short_name: string; name: string }[];
}

/** Staff moderation queue: offers in review first, then live ones. */
export async function listOffersForStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select(
      "id, title, conditions, discount_type, discount_value, status, status_reason, created_at, ends_at, merchants(id, display_name, status), services(name, regular_price), products(name, regular_price)",
    )
    .in("status", ["pending_review", "active", "paused"])
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(`Could not load offers (${error.code})`);
  type Row = {
    id: string;
    title: string | null;
    conditions: string;
    discount_type: DiscountType;
    discount_value: number;
    status: string;
    status_reason: string | null;
    created_at: string;
    ends_at: string | null;
    merchants: { id: string; display_name: string; status: string } | null;
    services: { name: string; regular_price: number } | null;
    products: { name: string; regular_price: number } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  return rows.sort((a, b) => Number(b.status === "pending_review") - Number(a.status === "pending_review"));
}

export type Deal = {
  offer_id: string;
  title: string;
  item_name: string;
  merchant_id: string;
  merchant_slug: string;
  merchant_name: string;
  category_slug: string;
  category_name: string;
  category_icon: string;
  regular_price: number;
  discount_amount: number;
  final_price: number;
  discount_type: DiscountType;
  discount_value: number;
  per_student_limit: number;
  per_student_period: LimitPeriod;
  is_favourite: boolean;
  branch_name: string | null;
  branch_area: string | null;
  opening_hours: string | null;
  distance_m: number | null;
  campus_name: string | null;
};

/** Live deals with the nearest branch and its distance from the student's campus. */
export async function listDeals(params: { query?: string; category?: string; merchantId?: string } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_deals", {
    p_query: params.query ?? null,
    p_category: params.category ?? null,
    p_merchant_id: params.merchantId ?? null,
    p_limit: 60,
  });
  if (error) throw new Error(`Could not load deals (${error.code ?? "unknown"})`);
  return (data ?? []) as Deal[];
}
