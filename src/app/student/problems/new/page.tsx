import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { OpenDisputeForm } from "@/features/disputes/components/dispute-forms";

export const metadata: Metadata = { title: "Report a problem", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewStudentProblemPage({ searchParams }: PageProps<"/student/problems/new">) {
  const sp = await searchParams;
  const redemptionId = typeof sp.redemption === "string" && UUID.test(sp.redemption) ? sp.redemption : undefined;
  const bookingId = !redemptionId && typeof sp.booking === "string" && UUID.test(sp.booking) ? sp.booking : undefined;
  const back = bookingId ? "/student/bookings" : "/student/history";
  return (
    <AreaShell area="student">
      <Link href={back} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Back
      </Link>
      <PageTitle title="Report a problem" description="Tell Perqly support what happened. The shop isn't shown your report." />
      <div className="max-w-2xl">
        {redemptionId || bookingId ? (
          <OpenDisputeForm area="student" redemptionId={redemptionId} bookingId={bookingId} />
        ) : (
          <p className="text-ink-700">Open My deals or My bookings, and tap Report a problem next to the one that went wrong.</p>
        )}
      </div>
    </AreaShell>
  );
}
