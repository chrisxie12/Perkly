import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/features/disputes/schemas";
import { listStudentReports } from "@/features/friends/queries";
import { REPORT_REASONS } from "@/features/friends/schemas";

export const metadata: Metadata = { title: "Student reports", robots: { index: false, follow: false } };

const FILTERS = ["open", "resolved", "dismissed"] as const;
const LABEL: Record<string, string> = { open: "Open", resolved: "Resolved", dismissed: "Dismissed" };
const REASON = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export default async function AdminStudentReportsPage({ searchParams }: PageProps<"/admin/student-reports">) {
  const raw = (await searchParams).status;
  const status = raw === "all" ? null : (FILTERS.find((f) => f === raw) ?? "open");
  const rows = await listStudentReports(status);
  return (
    <AreaShell area="admin">
      <PageTitle title="Student reports" description="Reports one student made about another in Friends. Newest first." />
      <nav aria-label="Filter" className="mb-6 flex flex-wrap gap-2">
        {[...FILTERS, "all" as const].map((f) => {
          const current = f === "all" ? status === null : f === status;
          return (
            <Link
              key={f}
              href={`/admin/student-reports?status=${f}`}
              aria-current={current ? "page" : undefined}
              className={cn("rounded-full px-4 py-2 font-semibold", current ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200")}
            >
              {f === "all" ? "All" : LABEL[f]}
            </Link>
          );
        })}
      </nav>
      {rows.length === 0 ? (
        <p className="text-ink-700">No reports here. Only Perqly support with two-factor can see student reports.</p>
      ) : (
        <ul className="grid max-w-3xl gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/student-reports/${r.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">{REASON[r.reason] ?? r.reason}</span>
                  <span className="text-sm font-semibold text-ink-700">{LABEL[r.status] ?? r.status}</span>
                </span>
                <span className="block text-sm text-ink-600">
                  About {r.reported_name ?? "a deleted account"} · from {r.reporter_name ?? "a deleted account"}
                  {r.has_chat ? " · with chat" : ""} · {formatWhen(r.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
