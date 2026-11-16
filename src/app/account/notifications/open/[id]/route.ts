import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNotificationPath } from "@/lib/notifications/format";

/**
 * Opening a notification (from the inbox or a phone notification) marks it read,
 * then goes to what it's about.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/account/notifications/open/[id]">) {
  const { id } = await params;
  const fallback = new URL("/account/notifications", request.url);
  if (!/^[0-9a-f-]{36}$/.test(id) || !hasSupabaseEnv()) return NextResponse.redirect(fallback);
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("link").eq("id", id).maybeSingle();
  if (!data) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/account/notifications/open/${id}`)}`, request.url));
  await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  return NextResponse.redirect(new URL(safeNotificationPath((data as { link: string | null }).link), request.url));
}
