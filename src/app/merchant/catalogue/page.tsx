import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { CatalogueItemForm } from "@/features/offers/components/merchant-offer-forms";
import { getCatalogue } from "@/features/offers/queries";
import { money } from "@/features/offers/schemas";
import { getActiveMembership, getMerchant } from "@/features/merchants/queries";
import { canManage, merchantNavFor } from "../merchant-nav";

export const metadata: Metadata = { title: "Catalogue", robots: { index: false } };

export default async function CataloguePage() {
  const membership = await getActiveMembership();
  if (!membership) redirect("/merchant");
  if (!canManage(membership)) redirect("/merchant");
  const [merchant, items] = await Promise.all([getMerchant(membership.merchantId), getCatalogue(membership.merchantId)]);
  if (!merchant) redirect("/merchant");
  const readOnly = merchant.status === "suspended";

  return (
    <AreaShell area="Business" nav={merchantNavFor(membership)}>
      <PageTitle
        title="Catalogue"
        description="What you sell, at your regular prices. Every student offer is a discount on one of these items."
      />
      <div className="space-y-6">
        {items.map((item) => (
          <Card key={`${item.kind}-${item.id}`}>
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <CardTitle>{item.name}</CardTitle>
                  <span className="mt-1 block text-sm text-ink-600">
                    {item.kind === "service" ? "Service" : "Product"}, {money(item.regular_price)}
                    {item.duration_minutes ? `, about ${item.duration_minutes} min` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {!item.is_active && <Badge variant="outline">Unavailable</Badge>}
                  <span className="text-sm font-semibold text-blue-600">{readOnly ? "View" : "Edit"}</span>
                </span>
              </summary>
              <div className="mt-6 border-t border-ink-200 pt-6">
                <CatalogueItemForm merchantId={merchant.id} item={item} readOnly={readOnly} />
              </div>
            </details>
          </Card>
        ))}
        {!readOnly && (
          <Card>
            <CardTitle className="mb-5">{items.length === 0 ? "Add your first item" : "Add an item"}</CardTitle>
            <CatalogueItemForm merchantId={merchant.id} />
          </Card>
        )}
      </div>
    </AreaShell>
  );
}
