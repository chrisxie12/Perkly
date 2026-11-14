import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { MerchantProfileForm } from "@/features/merchants/components/merchant-forms";
import { getActiveMembership, getCategories, getMerchant } from "@/features/merchants/queries";
import { canManage, merchantNavFor } from "../merchant-nav";

export const metadata: Metadata = { title: "Business profile", robots: { index: false } };

export default async function MerchantProfilePage() {
  const membership = await getActiveMembership();
  if (!membership) redirect("/merchant");
  const [merchant, categories] = await Promise.all([getMerchant(membership.merchantId), getCategories()]);
  if (!merchant) redirect("/merchant");
  const readOnly = !canManage(membership) || merchant.status === "suspended";

  return (
    <AreaShell area="Business" nav={merchantNavFor(membership)}>
      <PageTitle
        title="Business profile"
        description={
          merchant.status === "approved"
            ? "Students see these details. Changes to a live business are logged."
            : "Students see these details once your business is live."
        }
      />
      <Card className="max-w-2xl">
        <MerchantProfileForm merchant={merchant} categories={categories} readOnly={readOnly} />
      </Card>
    </AreaShell>
  );
}
