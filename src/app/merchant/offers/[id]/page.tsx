import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { OfferForm } from "@/features/offers/components/merchant-offer-forms";
import { getCatalogue, getListedInstitutions, getMerchantOffer } from "@/features/offers/queries";
import { getActiveMembership, getBranches } from "@/features/merchants/queries";
import { canManage, merchantNavFor } from "../../merchant-nav";

export const metadata: Metadata = { title: "Edit offer", robots: { index: false } };

export default async function EditOfferPage({ params }: PageProps<"/merchant/offers/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const [offer, catalogue, branches, schools] = await Promise.all([
    getMerchantOffer(membership.merchantId, id),
    getCatalogue(membership.merchantId),
    getBranches(membership.merchantId),
    getListedInstitutions(),
  ]);
  if (!offer) notFound();
  if (!["draft", "rejected", "paused"].includes(offer.status)) redirect("/merchant/offers");
  return (
    <AreaShell area="Business" nav={merchantNavFor(membership)}>
      <PageTitle
        title="Edit offer"
        description={
          offer.status === "paused"
            ? "Saving changes turns it back into a draft. Submit it again to go live."
            : "Change the offer, then submit it."
        }
      />
      <Card className="max-w-3xl">
        <OfferForm merchantId={membership.merchantId} catalogue={catalogue} branches={branches} schools={schools} offer={offer} />
      </Card>
    </AreaShell>
  );
}
