import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { getInstitutionOverview } from "@/features/institutions/queries";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Institution overview", robots: { index: false } };

export default async function InstitutionOverviewPage() {
  const rows = await getInstitutionOverview();
  return (
    <AreaShell area="institution">
      <PageTitle title="Overview" description="Where student verification stands at the institutions you review." />
      {rows.length === 0 ? (
        <p className="text-ink-700">
          You can&apos;t review any institution at the moment. If you were just appointed, sign out and in again.
        </p>
      ) : (
        <div className="space-y-8">
          {rows.map((r) => (
            <section key={r.institution_id} aria-labelledby={`inst-${r.institution_id}`}>
              <h2 id={`inst-${r.institution_id}`} className="mb-3 font-display text-xl font-bold">
                {r.name}
                {r.via === "delegated" ? " (reviewed by Perqly)" : ""}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    "Waiting for review",
                    r.waiting,
                    r.oldest_waiting_at ? `Oldest sent ${formatDate(r.oldest_waiting_at)}` : "Nothing waiting",
                  ],
                  ["Decided, 7 days", r.decided_7d, "Approvals, rejections and change requests"],
                  ["Verified students", r.verified, "Verification still in date"],
                  ["Expiring in 30 days", r.expiring_30d, "They'll need to verify again"],
                ].map(([label, value, note]) => (
                  <Card key={label as string}>
                    <p className="text-sm font-semibold text-ink-600">{label}</p>
                    <p className="mt-1 font-display text-3xl font-extrabold text-ink-900">{value}</p>
                    <p className="mt-1 text-sm text-ink-600">{note}</p>
                  </Card>
                ))}
              </div>
            </section>
          ))}
          <Card>
            <CardTitle>Next</CardTitle>
            <div className="mt-3 flex flex-wrap gap-6">
              <Link href="/institution/reviews" className="inline-flex items-center gap-2 font-semibold text-blue-600">
                Review applications <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/institution/students" className="inline-flex items-center gap-2 font-semibold text-blue-600">
                Verified students <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Card>
        </div>
      )}
    </AreaShell>
  );
}
