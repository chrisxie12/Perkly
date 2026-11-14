import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { getActiveMembership } from "@/features/merchants/queries";
import { money } from "@/features/offers/schemas";
import { PaymentForm } from "@/features/redemptions/components/payment-form";
import { getMerchantRedemptions } from "@/features/redemptions/queries";
import { PAYMENT_METHODS, redemptionErrorMessage } from "@/features/redemptions/schemas";
import { merchantNavFor } from "../merchant-nav";

export const metadata: Metadata = { title: "Redemptions", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });
const WEEK = 7 * 86_400_000;

export default async function MerchantRedemptionsPage({ searchParams }: PageProps<"/merchant/redemptions">) {
  const [membership, query] = await Promise.all([getActiveMembership(), searchParams]);
  if (!membership || membership.status !== "approved") redirect("/merchant");
  const rows = await getMerchantRedemptions(membership.merchantId);
  const live = rows.filter((r) => !r.voided_at);
  const total = live.reduce((sum, r) => sum + Number(r.discount_amount), 0);
  const error = typeof query.error === "string" ? query.error : undefined;
  // Rendered per request; the 7-day window matches record_payment's own check.
  const cutoff = new Date().getTime() - WEEK;

  return (
    <AreaShell area="Business" nav={merchantNavFor(membership)}>
      <PageTitle
        title="Redemptions"
        description={
          membership.role === "cashier"
            ? "Discounts confirmed at your branches."
            : "Every discount confirmed at your business. Payment notes are your own record; Perqly never handles payment."
        }
      />
      {(error || query.saved) && (
        <div
          role={error ? "alert" : "status"}
          className={`mb-6 rounded-xl p-4 font-medium text-ink-900 ring-1 ${error ? "bg-orange-50 ring-orange-200" : "bg-green-50 ring-green-200"}`}
        >
          {error ? redemptionErrorMessage(error) : "Payment note saved."}
        </div>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold text-ink-600">Redemptions</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-ink-900">{live.length}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-ink-600">Discounts given</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-ink-900">{money(total)}</p>
        </Card>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No redemptions yet"
          description="Confirmed discounts appear here once the student confirms too."
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {rows.map((r) => (
            <li key={r.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span>
                  <span className="block font-semibold text-ink-900">{r.item_name}</span>
                  <span className="block text-sm text-ink-600">
                    {r.transaction_ref}, {r.merchant_branches?.name}, {when.format(new Date(r.redeemed_at))}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold text-ink-900">Student pays {money(r.final_price)}</span>
                  <span className="block text-sm text-ink-600">Discount {money(r.discount_amount)}</span>
                </span>
              </div>
              {r.voided_at ? (
                <p className="text-sm font-semibold text-ink-600">Voided by Perqly support</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {r.payment_status && (
                    <span className="text-ink-700">
                      Payment recorded by the merchant: {r.payment_status === "paid" ? "paid" : "not paid"}
                      {r.payment_method ? `, ${PAYMENT_METHODS[r.payment_method]}` : ""}.
                    </span>
                  )}
                  {new Date(r.redeemed_at).getTime() > cutoff && (
                    <PaymentForm redemptionId={r.id} method={r.payment_method} status={r.payment_status} />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
