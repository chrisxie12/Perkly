import "server-only";

import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { disputeRowSchema, disputeSchema, type Dispute, type DisputeRow } from "./schemas";

/** A student's own reports, or (with a business) the reports that business made. */
export async function getMyDisputes(merchantId?: string): Promise<Dispute[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_disputes", { p_merchant_id: merchantId ?? null });
  if (error) throw new Error(`my_disputes failed (${error.code ?? "unknown"})`);
  return z
    .array(disputeSchema)
    .catch([])
    .parse(data ?? []);
}

export async function listDisputes(status?: string): Promise<DisputeRow[] | null> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_disputes", { p_status: status ?? null });
  if (error) return null;
  return z
    .array(disputeRowSchema)
    .catch([])
    .parse(data ?? []);
}

export async function getDispute(id: string): Promise<Dispute | null> {
  if (!hasSupabaseEnv() || !z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dispute", { p_dispute_id: id });
  if (error || !data) return null;
  const parsed = disputeSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
