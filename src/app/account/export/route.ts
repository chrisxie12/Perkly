import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Personal data export: everything export_my_data() returns for the signed-in user. */
export async function GET(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.redirect(new URL("/login?next=%2Faccount", request.url), 303);
  const { data, error } = await supabase.rpc("export_my_data");
  if (error || !data) return NextResponse.json({ error: "export_failed" }, { status: 500 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="perqly-data-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
