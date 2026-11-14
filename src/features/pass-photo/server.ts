import "server-only";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "pass-photos";

/** A short-lived link to a pass photo. Storage rules decide who may get one. */
export async function signPassPhoto(path: string | null | undefined, seconds = 600) {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function getMyPassPhotoPath() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("avatar_path").eq("id", uid).maybeSingle();
  return (data?.avatar_path as string | null) ?? null;
}

/** Signed photo links for the passes on a counter, by session. */
export async function counterPhotos(merchantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("counter_pass_photos", { p_merchant_id: merchantId });
  const rows = (data ?? []) as { session_id: string; photo_path: string }[];
  if (rows.length === 0) return new Map<string, string>();
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(
    rows.map((r) => r.photo_path),
    300,
  );
  const byPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl as string]));
  return new Map(rows.filter((r) => byPath.has(r.photo_path)).map((r) => [r.session_id, byPath.get(r.photo_path)!]));
}
