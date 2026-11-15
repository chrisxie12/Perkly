/**
 * URL of an institution's logo.
 * - "bundled/<file>": an official logo shipped with the app (public/institution-logos).
 * - "<institution id>/logo-<ms>.<ext>": uploaded by an admin to the institution-logos bucket.
 */
export function institutionLogoUrl(supabaseUrl: string | null | undefined, path: string | null | undefined) {
  if (!path) return null;
  const bundled = /^bundled\/([a-z0-9-]+\.(?:svg|png|webp))$/.exec(path);
  if (bundled) return `/institution-logos/${bundled[1]}`;
  if (!supabaseUrl) return null;
  if (!/^[0-9a-f-]{36}\/logo-\d+\.(svg|png|webp)$/.test(path)) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/institution-logos/${path}`;
}
