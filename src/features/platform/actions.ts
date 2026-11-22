"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/features/auth/types";

const NAMES = { "pilot.friends_enabled": "Friends", "pilot.bookings_enabled": "Bookings" } as const;

/** Switch Friends or Bookings on or off. Super admins only; the database checks and logs it. */
export async function setFeatureSwitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ key: z.enum(["pilot.friends_enabled", "pilot.bookings_enabled"]), on: z.enum(["1", "0"]) })
    .safeParse({ key: formData.get("key"), on: formData.get("on") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  if (!hasSupabaseEnv()) return { status: "error", message: "This isn't available in this environment yet." };
  const on = parsed.data.on === "1";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_feature_switch", { p_key: parsed.data.key, p_on: on });
  if (error)
    return {
      status: "error",
      message: error.message.includes("forbidden")
        ? "Only super admins with two-step verification can do that."
        : "That didn't save. Try again.",
    };
  for (const area of ["/admin", "/student", "/merchant"]) revalidatePath(area, "layout");
  return { status: "success", message: `${NAMES[parsed.data.key]} switched ${on ? "on" : "off"}.` };
}
