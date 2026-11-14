import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getUserContext } from "@/lib/auth/session";
import { canSupport } from "@/lib/auth/roles";
import { getPlatformReport, REPORT_PERIODS, type ReportRow } from "@/features/admin/insights";
import { money } from "@/features/offers/schemas";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };

function Table({ title, rows, showStudents = true }: { title: string; rows: ReportRow[]; showStudents?: boolean }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {rows.length === 0 ? (
        <p className="mt-2 text-ink-700">No redemptions in this period.</p>
      ) : (
        <table className="mt-3 w-full text-left text-sm sm:text-[0.9375rem]">
          <thead className="text-sm text-ink-600">
            <tr>
              <th scope="col" className="py-2 font-semibold">
                Name
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-semibold">
                Used
              </th>
              {showStudents && (
                <th scope="col" className="hidden py-2 pl-3 text-right font-semibold sm:table-cell">
                  Students
                </th>
              )}
              <th scope="col" className="py-2 pl-3 text-right font-semibold">
                Saved
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="py-2 text-ink-900">{r.name}</td>
                <td className="py-2 pl-3 text-right text-ink-900">{r.redemptions}</td>
                {showStudents && <td className="hidden py-2 pl-3 text-right text-ink-700 sm:table-cell">{r.students}</td>}
                <td className="py-2 pl-3 text-right whitespace-nowrap text-ink-700">{money(r.saved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const [params, ctx] = await Promise.all([searchParams, getUserContext()]);
  const days = REPORT_PERIODS.find((d) => String(d) === params.days) ?? 30;
  if (!ctx || !canSupport(ctx)) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly support and admins see reports." />
      </AreaShell>
    );
  }
  const report = await getPlatformReport(days);
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Reports"
        description="Completed redemptions, without voided ones. Amounts are what students saved and paid businesses directly."
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Period" className="flex gap-2">
          {REPORT_PERIODS.map((d) => (
            <Link
              key={d}
              href={`/admin/reports?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold ring-1",
                d === days ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200",
              )}
            >
              {d === 365 ? "1 year" : `${d} days`}
            </Link>
          ))}
        </nav>
        <a href={`/admin/reports/export?days=${days}`} className={buttonVariants({ variant: "secondary" })} download>
          <Download aria-hidden /> Download CSV
        </a>
      </div>
      <section aria-label="Totals" className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          ["Redemptions", `${report.totals.redemptions}`, `${report.voided} voided`],
          ["Students who redeemed", `${report.totals.students}`, `${report.new_students_verified} newly verified`],
          ["Businesses with redemptions", `${report.totals.businesses}`, `${report.new_businesses} newly approved`],
          ["Students saved", money(report.totals.saved), `They paid ${money(report.totals.student_sales)} at student prices`],
        ].map(([label, value, note]) => (
          <Card key={label}>
            <p className="text-sm font-semibold text-ink-600">{label}</p>
            <p className="mt-1 font-display text-xl font-extrabold text-ink-900 sm:text-3xl">{value}</p>
            <p className="mt-1 text-sm text-ink-600">{note}</p>
          </Card>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Table title="By institution" rows={report.by_institution} />
        <Table title="By category" rows={report.by_category} showStudents={false} />
        <div className="lg:col-span-2">
          <Table title="By business (top 50)" rows={report.by_business} />
        </div>
      </div>
    </AreaShell>
  );
}
