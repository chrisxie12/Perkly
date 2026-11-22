import "server-only";
import { cache } from "react";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type FeatureSwitches = { friends: boolean; bookings: boolean; campus: boolean };

/** Everything off when unknown: the pilot shows deals and redemption only. */
export const PILOT_DEFAULTS: FeatureSwitches = { friends: false, bookings: false, campus: false };

/** Which optional features are switched on (super admins change these in Platform settings). */
export const getFeatureSwitches = cache(async (): Promise<FeatureSwitches> => {
  if (!hasSupabaseEnv()) return PILOT_DEFAULTS;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feature_switches");
  if (error || !data) return PILOT_DEFAULTS;
  const parsed = z.object({ friends: z.boolean(), bookings: z.boolean(), campus: z.boolean() }).safeParse(data);
  return parsed.success ? parsed.data : PILOT_DEFAULTS;
});
