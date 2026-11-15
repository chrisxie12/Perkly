/** Public URL of an uploaded institution logo (bucket institution-logos). */
export function institutionLogoUrl(supabaseUrl: string | null | undefined, path: string | null | undefined) {
  if (!supabaseUrl || !path) return null;
  if (!/^[0-9a-f-]{36}\/logo-\d+\.(svg|png|webp)$/.test(path)) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/institution-logos/${path}`;
}
