import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { changeOfferState, submitOffer } from "@/features/offers/actions";
import { getCatalogue, getMerchantOffers } from "@/features/offers/queries";
import { OFFER_STATUS_LABEL, discountLabel, limitLabel, offerErrorMessage } from "@/features/offers/schemas";
import { getActiveMembership, getMerchant } from "@/features/merchants/queries";
import { formatDate } from "@/features/students/components/status-card";
import { formatRunTimes } from "@/features/offers/run-times";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Offers", robots: { index: false } };

function StateButton({ offerId, action, label }: { offerId: string; action: "pause" | "resume" | "archive"; label: string }) {
  return (
    <form action={changeOfferState}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton variant="ghost" size="sm">
        {label}
      </SubmitButton>
    </form>
  );
}

export default async function MerchantOffersPage({ searchParams }: PageProps<"/merchant/offers">) {
  const [membership, query] = await Promise.all([getActiveMembership(), searchParams]);
  if (!membership || !canManage(membership)) redirect("/merchant");
  const [merchant, offers, catalogue] = await Promise.all([
    getMerchant(membership.merchantId),
    getMerchantOffers(membership.merchantId),
    getCatalogue(membership.merchantId),
  ]);
  if (!merchant) redirect("/merchant");
  const itemName = new Map(catalogue.map((c) => [c.id, c.name]));
  const live = merchant.status === "approved";
  const error = typeof query.error === "string" ? query.error : undefined;

  return (
    <AreaShell area="merchant">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle
          title="Offers"
          description={
            live
              ? "Your first three offers are checked by Perqly before they go live. After that, offers go live when you submit them."
              : "You can prepare offers now. They can go live once Perqly approves your business."
          }
        />
        {catalogue.length > 0 && merchant.status !== "suspended" && (
          <Link href="/merchant/offers/new" className={buttonVariants()}>
            <Plus aria-hidden /> New offer
          </Link>
        )}
      </div>
      {query.submitted && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          {query.submitted === "active" ? "Your offer is live." : "Sent to Perqly for a quick check."}
        </p>
      )}
      {query.saved && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          Saved as a draft. Submit it when you&apos;re ready.
        </p>
      )}
      {query.times && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          Days and times saved. Students see them straight away.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-orange-50 px-4 py-3 font-medium text-ink-900 ring-1 ring-orange-200">
          {offerErrorMessage(error)}
        </p>
      )}
      {catalogue.length === 0 ? (
        <EmptyState
          title="Add items first"
          description="Offers are discounts on items in your catalogue."
          action={
            <Link href="/merchant/catalogue" className={buttonVariants({ variant: "secondary" })}>
              Open catalogue
            </Link>
          }
        />
      ) : offers.length === 0 ? (
        <EmptyState title="No offers yet" description="Create a student discount on one of your items." />
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => {
            const name = offer.title ?? itemName.get(offer.service_id ?? offer.product_id ?? "") ?? "Offer";
            return (
              <Card key={offer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-bold text-ink-900">{name}</span>
                      <Badge variant={offer.status === "active" ? "success" : offer.status === "rejected" ? "orange" : "outline"}>
                        {OFFER_STATUS_LABEL[offer.status]}
                      </Badge>
                    </p>
                    <p className="mt-1 text-[0.9375rem] text-ink-700">
                      {discountLabel(offer.discount_type, offer.discount_value)}.{" "}
                      {limitLabel(offer.per_student_limit, offer.per_student_period)} per student.
                      {offer.total_cap
                        ? ` ${offer.redemption_count} of ${offer.total_cap} used.`
                        : ` Used ${offer.redemption_count} times.`}
                      {offer.ends_at ? ` Ends ${formatDate(offer.ends_at)}.` : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium text-ink-600">Runs: {formatRunTimes(offer)}</p>
                    {offer.status_reason && offer.status === "rejected" && (
                      <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-ink-900">
                        Perqly&apos;s note: {offer.status_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {["draft", "rejected", "paused"].includes(offer.status) && (
                      <Link href={`/merchant/offers/${offer.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Edit
                      </Link>
                    )}
                    {["draft", "rejected"].includes(offer.status) && live && (
                      <form action={submitOffer}>
                        <input type="hidden" name="offerId" value={offer.id} />
                        <SubmitButton size="sm">Submit</SubmitButton>
                      </form>
                    )}
                    {["active", "pending_review"].includes(offer.status) && (
                      <Link href={`/merchant/offers/${offer.id}/times`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Days and times
                      </Link>
                    )}
                    {offer.status === "active" && <StateButton offerId={offer.id} action="pause" label="Pause" />}
                    {offer.status === "paused" && <StateButton offerId={offer.id} action="resume" label="Resume" />}
                    {offer.status !== "archived" && <StateButton offerId={offer.id} action="archive" label="Archive" />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AreaShell>
  );
}
