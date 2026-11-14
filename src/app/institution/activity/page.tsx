import type { Metadata } from "next";
import { History } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { getUserContext } from "@/lib/auth/session";
import { getDecided } from "@/features/institutions/queries";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Decisions", robots: { index: false } };

const labels: Record<string, string> = { approved: "Approved", rejected: "Rejected", resubmission_requested: "Changes requested" };

export default async function ActivityPage() {
  const [ctx, decided] = await Promise.all([getUserContext(), getDecided()]);
  return (
    <AreaShell area="institution">
      <PageTitle title="Decisions" description="The latest verification decisions at your institution." />
      {decided.length === 0 ? (
        <EmptyState icon={<History />} title="No decisions yet" description="Approvals, rejections and change requests appear here." />
      ) : (
        <>
          <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70 sm:hidden">
            {decided.map((row) => (
              <li key={row.id} className="p-4">
                <p className="font-semibold text-ink-900">{row.full_name}</p>
                <p className="text-sm text-ink-700">
                  {labels[row.status] ?? row.status}, {formatDate(row.decided_at)}, by{" "}
                  {row.decided_by === ctx?.userId ? "you" : "another reviewer"}
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70 sm:block">
            <table className="w-full text-left text-[0.9375rem]">
              <thead className="border-b border-ink-200 text-sm text-ink-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Student
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Decision
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Date
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {decided.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 font-medium text-ink-900">{row.full_name}</td>
                    <td className="px-5 py-3">{labels[row.status] ?? row.status}</td>
                    <td className="px-5 py-3">{formatDate(row.decided_at)}</td>
                    <td className="px-5 py-3">{row.decided_by === ctx?.userId ? "You" : "Another reviewer"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AreaShell>
  );
}
