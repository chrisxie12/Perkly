import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { DisputeCard } from "@/features/disputes/components/dispute-card";
import { getMyDisputes } from "@/features/disputes/queries";

export const metadata: Metadata = { title: "Problem reports", robots: { index: false } };

export default async function StudentProblemsPage({ searchParams }: PageProps<"/student/problems">) {
  const sent = (await searchParams).sent === "1";
  const disputes = await getMyDisputes();
  return (
    <AreaShell area="student">
      <PageTitle title="Problem reports" description="Problems you reported about a deal or a booking. Perqly support replies here." />
      {sent && (
        <p role="status" className="mb-6 rounded-xl bg-green-50 px-4 py-3 font-medium text-green-800">
          Report sent. We&apos;ll reply here and send you a notification.
        </p>
      )}
      {disputes.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy aria-hidden />}
          title="No reports"
          description="If something goes wrong with a deal, open My deals and tap Report a problem next to it."
        />
      ) : (
        <div className="grid max-w-2xl gap-4">
          {disputes.map((d) => (
            <DisputeCard key={d.id} dispute={d} />
          ))}
        </div>
      )}
    </AreaShell>
  );
}
