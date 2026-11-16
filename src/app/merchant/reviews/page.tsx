import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getActiveMembership } from "@/features/merchants/queries";
import { getRatings } from "@/features/offers/queries";
import { RatingSummary, ReviewList } from "@/features/reviews/components/review-list";
import { listMerchantReviews } from "@/features/reviews/queries";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

export default async function MerchantReviewsPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const [reviews, ratings] = await Promise.all([listMerchantReviews(membership.merchantId, 100), getRatings([membership.merchantId])]);
  const score = ratings.get(membership.merchantId);
  return (
    <AreaShell area="merchant">
      <PageTitle title="Reviews" description="Ratings from students after a discount went through at your business." />
      <div className="grid max-w-2xl gap-5">
        <div className="rounded-3xl bg-white p-5 ring-1 ring-ink-200/70">
          <RatingSummary rating={score?.rating ?? null} reviews={score?.reviews ?? 0} />
        </div>
        <ReviewList reviews={reviews} />
        <p className="text-sm text-ink-600">
          Only students who redeemed a deal here can rate you, once each. If a review breaks the rules, message Perqly support.
        </p>
      </div>
    </AreaShell>
  );
}
