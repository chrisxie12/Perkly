import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { OfferForm } from "@/features/offers/components/merchant-offer-forms";
import { getCatalogue, getListedInstitutions } from "@/features/offers/queries";
import { getActiveMembership, getBranches } from "@/features/merchants/queries";
import { canManage } from "../../merchant-nav";

export const metadata: Metadata = { title: "New offer", robots: { index: false } };

export default async function NewOfferPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const [catalogue, branches, schools] = await Promise.all([
    getCatalogue(membership.merchantId),
    getBranches(membership.merchantId),
    getListedInstitutions(),
  ]);
  if (catalogue.length === 0) redirect("/merchant/catalogue");
  return (
    <AreaShell area="merchant">
      <PageTitle title="New offer" description="Pick an item, set the student discount and the conditions." />
      <Card className="max-w-3xl">
        <OfferForm merchantId={membership.merchantId} catalogue={catalogue} branches={branches} schools={schools} />
      </Card>
    </AreaShell>
  );
}
