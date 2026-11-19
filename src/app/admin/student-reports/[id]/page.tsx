import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/features/disputes/schemas";
import { StudentReportStatusForm } from "@/features/friends/components/friend-forms";
import { getStudentReport } from "@/features/friends/queries";
import { REPORT_REASONS } from "@/features/friends/schemas";

export const metadata: Metadata = { title: "Student report", robots: { index: false, follow: false } };

const REASON = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export default async function AdminStudentReportPage({ params }: PageProps<"/admin/student-reports/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await getStudentReport(id);
  if (!r) notFound();
  return (
    <AreaShell area="admin">
      <Link
        href="/admin/student-reports"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-700 hover:text-ink-900"
      >
        <ChevronLeft className="size-4" aria-hidden /> Student reports
      </Link>
      <PageTitle title={REASON[r.reason] ?? r.reason} description={`Reported ${formatWhen(r.created_at)}`} />
      <div className="grid max-w-3xl gap-5">
        <dl className="grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-ink-200 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-ink-600">About</dt>
            <dd className="font-semibold text-ink-900">{r.reported_name ?? "A deleted account"}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-600">From</dt>
            <dd className="font-semibold text-ink-900">{r.reporter_name ?? "A deleted account"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-semibold text-ink-600">What they said</dt>
            <dd className="whitespace-pre-wrap text-ink-900">{r.note ?? "No details given."}</dd>
          </div>
        </dl>

        {r.messages.length > 0 && (
          <section aria-labelledby="msgs-h" className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
            <h2 id="msgs-h" className="font-display text-lg font-bold">
              Last {r.messages.length} messages in their chat
            </h2>
            <ol className="mt-3 flex flex-col gap-1.5">
              {r.messages.map((m, i) => (
                <li
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-[0.9375rem] whitespace-pre-wrap",
                    m.from_reported ? "self-start bg-red-50 text-ink-900" : "self-end bg-ink-100 text-ink-900",
                  )}
                >
                  <span className="block text-xs font-semibold text-ink-600">
                    {m.from_reported ? (r.reported_name ?? "Reported student") : (r.reporter_name ?? "Reporter")} · {formatWhen(m.at)}
                  </span>
                  {m.body}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-labelledby="act-h" className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
          <h2 id="act-h" className="mb-3 font-display text-lg font-bold">
            Decision
          </h2>
          {r.staff_note && <p className="mb-3 text-sm text-ink-700">Last note: {r.staff_note}</p>}
          <StudentReportStatusForm reportId={r.id} status={r.status} />
          <p className="mt-4 text-sm text-ink-600">
            To suspend an account, open it under Users. Suspended students can&apos;t use Friends or redeem deals.
          </p>
        </section>
      </div>
    </AreaShell>
  );
}
