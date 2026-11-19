import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { getActiveMembership } from "@/features/merchants/queries";
import { DisputeCard } from "@/features/disputes/components/dispute-card";
import { getMyDisputes } from "@/features/disputes/queries";

export const metadata: Metadata = { title: "Problem reports", robots: { index: false } };

export default async function MerchantProblemsPage({ searchParams }: PageProps<"/merchant/problems">) {
  const membership = await getActiveMembership();
  if (!membership) redirect("/merchant");
  const sent = (await searchParams).sent === "1";
  const disputes = await getMyDisputes(membership.merchantId);
  return (
    <AreaShell area="merchant">
      <PageTitle title="Problem reports" description="Problems your business reported to Perqly support about a redemption or a booking." />
      {sent && (
        <p role="status" className="mb-6 rounded-xl bg-green-50 px-4 py-3 font-medium text-green-800">
          Report sent. Perqly support will reply here.
        </p>
      )}
      {disputes.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy aria-hidden />}
          title="No reports"
          description="To report a problem with a redemption, open Redemptions and use Report a problem next to it."
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
