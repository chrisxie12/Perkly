import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { REPORT_PERIODS, type PlatformReport } from "@/features/admin/insights";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // Quote everything and neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** CSV of the platform report. admin_report() refuses anyone below Perqly support. */
export async function GET(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const days = REPORT_PERIODS.find((d) => String(d) === request.nextUrl.searchParams.get("days")) ?? 30;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_report", { p_days: days });
  if (error || !data)
    return NextResponse.json(
      { error: error?.message === "forbidden" ? "forbidden" : "report_failed" },
      { status: error?.message === "forbidden" ? 403 : 500 },
    );
  const r = data as PlatformReport;
  const lines = [
    ["section", "name", "redemptions", "students", "saved_ghs"],
    ["total", `last ${days} days`, r.totals.redemptions, r.totals.students, r.totals.saved],
    ...r.by_institution.map((x) => ["institution", x.name, x.redemptions, x.students, x.saved]),
    ...r.by_category.map((x) => ["category", x.name, x.redemptions, "", x.saved]),
    ...r.by_business.map((x) => ["business", x.name, x.redemptions, x.students, x.saved]),
    ...r.by_day.map((x) => ["day", x.day, x.redemptions, "", x.saved]),
  ];
  const csv = lines.map((l) => l.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="perqly-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
