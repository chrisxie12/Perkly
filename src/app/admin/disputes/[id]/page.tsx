import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { DisputeCard } from "@/features/disputes/components/dispute-card";
import { StatusForm } from "@/features/disputes/components/dispute-forms";
import { getDispute } from "@/features/disputes/queries";

export const metadata: Metadata = { title: "Problem report", robots: { index: false, follow: false } };

export default async function AdminDisputePage({ params }: PageProps<"/admin/disputes/[id]">) {
  const { id } = await params;
  const dispute = await getDispute(id);
  if (!dispute) notFound();
  return (
    <AreaShell area="admin">
      <Link href="/admin/disputes" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Problem reports
      </Link>
      <PageTitle
        title={`Report from ${dispute.opened_by_party === "student" ? "a student" : "a business"}`}
        description={`Opened by ${dispute.opened_by_name ?? "a deleted account"}${dispute.assigned_to_name ? `, handled by ${dispute.assigned_to_name}` : ""}.`}
      />
      <div className="grid max-w-3xl gap-6 lg:grid-cols-[1fr_18rem]">
        <DisputeCard dispute={dispute} staff />
        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
            <StatusForm disputeId={dispute.id} current={dispute.status} />
          </div>
          {dispute.redemption && !dispute.redemption.voided && (
            <p className="text-sm text-ink-700">
              To reverse the discount, void it on{" "}
              <Link href="/admin/redemptions" className="font-semibold text-blue-600">
                Redemptions
              </Link>{" "}
              ({dispute.redemption.transaction_ref}). Voids are audited separately.
            </p>
          )}
        </aside>
      </div>
    </AreaShell>
  );
}
