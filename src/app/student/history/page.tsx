import type { Metadata } from "next";
import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { money } from "@/features/offers/schemas";
import { getMyHistory } from "@/features/redemptions/queries";
import { studentNav } from "../student-nav";

export const metadata: Metadata = { title: "Your savings", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

export default async function HistoryPage() {
  const { redemptions, savings } = await getMyHistory();
  return (
    <AreaShell area="Student" nav={studentNav}>
      <PageTitle
        title="Your savings"
        description="Every discount you've redeemed. Perqly records the discount; you pay the business directly."
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold text-ink-600">Saved so far</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-success">{money(savings?.total_saved ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-ink-600">Discounts redeemed</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-ink-900">{savings?.redemption_count ?? 0}</p>
        </Card>
      </div>
      {redemptions.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title="No redemptions yet"
          description="Scan the Perqly code at a business after you're served, and your savings show up here."
          action={
            <Link href="/student" className="font-semibold text-blue-600 underline underline-offset-2">
              Find an offer
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {redemptions.map((r) => (
            <li key={r.redemption_id} className="flex flex-wrap items-baseline justify-between gap-3 p-5">
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">{r.item_name}</span>
                <span className="block text-sm text-ink-600">
                  {r.merchant_name}, {r.branch_name}. {when.format(new Date(r.redeemed_at))}. {r.transaction_ref}
                </span>
              </span>
              <span className="text-right">
                {r.voided ? (
                  <span className="font-semibold text-ink-600">Cancelled by Perqly support</span>
                ) : (
                  <>
                    <span className="block font-semibold text-success">Saved {money(r.discount_amount)}</span>
                    <span className="block text-sm text-ink-600">Student price {money(r.final_price)}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
