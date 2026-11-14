"use server";

import { revalidatePath } from "next/cache";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function savePassPhoto(path: string | null): Promise<{ ok: boolean; message?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, message: "This isn't available in this environment yet." };
  if (path !== null && !/^[0-9a-f-]{36}\/pass\.(webp|jpg)$/.test(path)) return { ok: false, message: "That photo couldn't be saved." };
  const supabase = await createClient();
  if (path === null) {
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (uid) await supabase.storage.from("pass-photos").remove([`${uid}/pass.webp`, `${uid}/pass.jpg`]);
  }
  const { error } = await supabase.rpc("set_pass_photo", { p_path: path });
  if (error)
    return {
      ok: false,
      message: error.message === "forbidden" ? "Suspended accounts can't change their photo." : "That photo couldn't be saved. Try again.",
    };
  revalidatePath("/student", "layout");
  return { ok: true };
}
