import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { getMerchantMetrics } from "@/features/admin/insights";
import { getActiveMembership } from "@/features/merchants/queries";
import { money } from "@/features/offers/schemas";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Analytics", robots: { index: false } };

export default async function MerchantAnalyticsPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership) || membership.status !== "approved") redirect("/merchant");
  const metrics = await getMerchantMetrics(membership.merchantId);

  return (
    <AreaShell area="merchant">
      <PageTitle title="Analytics" description="Completed student redemptions at your business. Voided redemptions are left out." />
      {!metrics ? (
        <p className="text-ink-700">Analytics couldn&apos;t load. Owners need two-step verification on. Refresh to try again.</p>
      ) : (
        <>
          <section aria-label="Last 30 days" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Redemptions, 30 days", `${metrics.redemptions_30d}`, `${metrics.redemptions_7d} in the last 7 days`],
              ["Students, 30 days", `${metrics.students_30d}`, "Different students who redeemed"],
              ["Discounts given", money(metrics.discounts_30d), "Last 30 days"],
              ["Student sales", money(metrics.student_sales_30d), "What students paid you, last 30 days"],
            ].map(([label, value, note]) => (
              <Card key={label}>
                <p className="text-sm font-semibold text-ink-600">{label}</p>
                <p className="mt-1 font-display text-3xl font-extrabold text-ink-900">{value}</p>
                <p className="mt-1 text-sm text-ink-600">{note}</p>
              </Card>
            ))}
          </section>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Card>
              <CardTitle>Most redeemed offers, 30 days</CardTitle>
              {metrics.top_offers.length === 0 ? (
                <p className="mt-2 text-ink-700">No redemptions in the last 30 days.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ink-200">
                  {metrics.top_offers.map((o) => (
                    <li key={o.offer_id} className="flex justify-between gap-3 py-2">
                      <span className="text-ink-900">{o.title}</span>
                      <span className="font-semibold text-ink-900">{o.redemptions}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle>By branch, 30 days</CardTitle>
              {metrics.by_branch.length === 0 ? (
                <p className="mt-2 text-ink-700">No redemptions in the last 30 days.</p>
              ) : (
                <ul className="mt-3 divide-y divide-ink-200">
                  {metrics.by_branch.map((b) => (
                    <li key={b.branch} className="flex justify-between gap-3 py-2">
                      <span className="text-ink-900">{b.branch}</span>
                      <span className="font-semibold text-ink-900">{b.redemptions}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-sm text-ink-600">
                {metrics.saves} student{metrics.saves === 1 ? " has" : "s have"} saved your business.
                {metrics.confirmed_not_completed_30d > 0
                  ? ` ${metrics.confirmed_not_completed_30d} confirmed at the counter but not finished by the student.`
                  : ""}
              </p>
            </Card>
          </div>
          <Link href="/merchant/redemptions" className="mt-6 inline-flex items-center gap-2 font-semibold text-blue-600">
            Every redemption <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </AreaShell>
  );
}
