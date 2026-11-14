import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/states";
import { OfferModerationForm } from "@/features/offers/components/moderation-form";
import { listOffersForStaff } from "@/features/offers/queries";
import { OFFER_STATUS_LABEL, discountLabel, money } from "@/features/offers/schemas";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Offers", robots: { index: false, follow: false } };

export default async function AdminOffersPage() {
  const offers = await listOffersForStaff();
  const waiting = offers.filter((o) => o.status === "pending_review").length;
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Offers"
        description={
          waiting === 0
            ? "No offers are waiting for review. A business's first three offers come here before students see them."
            : `${waiting} waiting for review, listed first.`
        }
      />
      {offers.length === 0 ? (
        <EmptyState icon={<Tag />} title="No offers yet" description="Offers appear here when businesses submit them." />
      ) : (
        <ul className="space-y-4">
          {offers.map((o) => {
            const item = o.services ?? o.products;
            return (
              <li key={o.id} className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{o.title ?? item?.name ?? "Offer"}</span>
                  <Badge variant={o.status === "pending_review" ? "orange" : o.status === "active" ? "success" : "outline"}>
                    {OFFER_STATUS_LABEL[o.status as keyof typeof OFFER_STATUS_LABEL] ?? o.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-600">
                  {o.merchants ? (
                    <Link href={`/admin/merchants/${o.merchants.id}`} className="font-semibold text-blue-600 underline underline-offset-2">
                      {o.merchants.display_name}
                    </Link>
                  ) : (
                    "Unknown business"
                  )}
                  , {discountLabel(o.discount_type, o.discount_value)}
                  {item ? ` on ${item.name} (${money(item.regular_price)})` : ""}, created {formatDate(o.created_at)}
                  {o.ends_at ? `, ends ${formatDate(o.ends_at)}` : ""}
                </p>
                <p className="mt-3 text-ink-700">{o.conditions}</p>
                <details className="mt-4" open={o.status === "pending_review"}>
                  <summary className="cursor-pointer font-semibold text-blue-600">Decide</summary>
                  <div className="mt-3">
                    <OfferModerationForm offerId={o.id} status={o.status} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </AreaShell>
  );
}
