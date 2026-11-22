import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { getMerchantOffer } from "@/features/offers/queries";
import { OfferTimesForm } from "@/features/offers/components/offer-times-form";
import { getActiveMembership } from "@/features/merchants/queries";
import { canManage } from "../../../merchant-nav";

export const metadata: Metadata = { title: "Days and times", robots: { index: false } };

/** Change when a deal runs without taking it offline. */
export default async function OfferTimesPage({ params }: PageProps<"/merchant/offers/[id]/times">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const offer = await getMerchantOffer(membership.merchantId, id);
  if (!offer || offer.status === "archived") notFound();
  return (
    <AreaShell area="merchant">
      <Link href="/merchant/offers" className="mb-4 inline-block text-sm font-semibold text-blue-700">
        Back to offers
      </Link>
      <PageTitle
        title="Days and times"
        description="Choose when students can use this deal. The change applies at once, and the deal stays live."
      />
      <Card className="max-w-3xl">
        <OfferTimesForm offer={offer} />
      </Card>
    </AreaShell>
  );
}
