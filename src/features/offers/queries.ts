import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv, hasSupabaseEnv } from "@/lib/env";
import { shopPhotoUrl } from "@/features/merchants/shop";
import type { DiscountType, LimitPeriod } from "./schemas";
import { EVERY_DAY, type RunTimes } from "./run-times";

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
  category_slug: string;
  category_icon: string;
  price_range: string | null;
  whatsapp: string | null;
  socials: Record<string, string>;
  payment_methods: string[];
  amenities: string[];
  /** ISO weekday in Accra, 1 = Monday. */
  today: number;
  is_favourite: boolean;
  photos: { id: string; path: string; caption: string | null }[];
  branches: {
    id: string;
    name: string;
    address: string;
    area: string | null;
    digital_address: string | null;
    landmark: string | null;
    maps_url: string | null;
    opening_hours: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    distance_m: number | null;
    campus_name: string | null;
    has_hours: boolean;
    open_now: boolean;
    open_until: string | null;
    opens_next: string | null;
    hours: { weekday: number; opens: string; closes: string }[];
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
  run_days: number[] | null;
  run_from: string | null;
  run_until: string | null;
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
  "id, service_id, product_id, title, description, conditions, discount_type, discount_value, starts_at, ends_at, run_days, run_from, run_until, status, status_reason, per_student_limit, per_student_period, total_cap, redemption_count, offer_branches(branch_id), offer_institutions(institution_id)";

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
  branch_id: string | null;
  branch_name: string | null;
  branch_area: string | null;
  opening_hours: string | null;
  distance_m: number | null;
  campus_name: string | null;
  has_hours: boolean | null;
  open_now: boolean | null;
  open_until: string | null;
  opens_next: string | null;
  cover_url?: string | null;
  /** Average student rating of the shop, when it has any. */
  rating?: number | null;
  reviews?: number;
  published_at?: string | null;
  /** When the student price runs. Missing or null = every day. */
  run_days?: number[] | null;
  run_from?: string | null;
  run_until?: string | null;
  /** False when the deal has set times and isn't on right now. */
  running_now?: boolean;
};

export const DEAL_SORTS = ["top", "new", "hot"] as const;
export type DealSort = (typeof DEAL_SORTS)[number];

/** Share of the normal price the student saves, 0 to 1. */
export function savingShare(d: Pick<Deal, "discount_amount" | "regular_price">) {
  return Number(d.regular_price) > 0 ? Number(d.discount_amount) / Number(d.regular_price) : 0;
}

/** Deals in the chosen order; the default is the server's order, nearest branch first. */
export function sortDeals(deals: Deal[], sort: DealSort | null) {
  const list = [...deals];
  switch (sort) {
    case "top":
      return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0));
    case "new":
      return list.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    case "hot":
      return list.sort((a, b) => savingShare(b) - savingShare(a));
    default:
      return list;
  }
}

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
  const deals = (data ?? []) as Deal[];
  const merchantIds = deals.map((d) => d.merchant_id);
  const [covers, ratings, dates, times] = await Promise.all([
    getCoverPhotos(merchantIds),
    getRatings(merchantIds),
    getPublishedDates(deals.map((d) => d.offer_id)),
    getRunTimes(deals.map((d) => d.offer_id)),
  ]);
  return deals.map((d) => ({
    ...d,
    cover_url: covers.get(d.merchant_id) ?? null,
    rating: ratings.get(d.merchant_id)?.rating ?? null,
    reviews: ratings.get(d.merchant_id)?.reviews ?? 0,
    published_at: dates.get(d.offer_id) ?? null,
    ...(times.get(d.offer_id) ?? { ...EVERY_DAY, running_now: true }),
  }));
}

/** When each live deal runs, by offer id. Deals not in the map run every day. */
export async function getRunTimes(offerIds: string[]) {
  const map = new Map<string, RunTimes & { running_now: boolean }>();
  if (offerIds.length === 0 || !hasSupabaseEnv()) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("offer_run_times", { p_offer_ids: offerIds });
  for (const row of (data ?? []) as (RunTimes & { offer_id: string; running_now: boolean })[])
    map.set(row.offer_id, { run_days: row.run_days, run_from: row.run_from, run_until: row.run_until, running_now: row.running_now });
  return map;
}

/** Average rating and count per business, for businesses with at least one visible rating. */
export async function getRatings(merchantIds: string[]) {
  const ids = [...new Set(merchantIds)];
  const map = new Map<string, { rating: number; reviews: number }>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("merchant_ratings", { p_merchant_ids: ids });
  for (const row of (data ?? []) as { merchant_id: string; rating: number; reviews: number }[])
    map.set(row.merchant_id, { rating: Number(row.rating), reviews: row.reviews });
  return map;
}

async function getPublishedDates(offerIds: string[]) {
  const map = new Map<string, string>();
  if (offerIds.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("offer_published_dates", { p_offer_ids: offerIds });
  for (const row of (data ?? []) as { offer_id: string; published_at: string }[]) map.set(row.offer_id, row.published_at);
  return map;
}

/** Public URL of each listed business's cover photo (first in its gallery), by business id. */
export async function getCoverPhotos(merchantIds: string[]) {
  const ids = [...new Set(merchantIds)];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.rpc("merchant_cover_photos", { p_merchant_ids: ids });
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  for (const row of (data ?? []) as { merchant_id: string; path: string }[]) map.set(row.merchant_id, shopPhotoUrl(base, row.path));
  return map;
}
