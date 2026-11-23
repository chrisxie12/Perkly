import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";

export type Review = {
  id: string;
  author: string;
  rating: number;
  comment: string | null;
  created_at: string;
  hidden: boolean;
  /** The viewer wrote it. */
  mine?: boolean;
};
export type MyReview = { can_review: boolean; rating: number | null; comment: string | null; hidden: boolean };

export async function listMerchantReviews(merchantId: string, limit = 30): Promise<Review[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_merchant_reviews", { p_merchant_id: merchantId, p_limit: limit });
  return (data ?? []) as Review[];
}

export async function getMyReview(merchantId: string): Promise<MyReview | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_review", { p_merchant_id: merchantId });
  return (data as MyReview | null) ?? null;
}
