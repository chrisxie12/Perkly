import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, Clock, Gift, PauseCircle, Wallet } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PayButton } from "@/features/billing/components/pay-button";
import { formatGhs, getMerchantBilling, type MerchantBilling } from "@/features/billing/queries";
import { getActiveMembership } from "@/features/merchants/queries";
import { formatDate } from "@/features/students/components/status-card";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Billing", robots: { index: false } };

const RETURN_MESSAGE: Record<string, { tone: "good" | "wait" | "bad"; text: string }> = {
  confirmed: { tone: "good", text: "Payment received. Thank you!" },
  pending: {
    tone: "wait",
    text: "Your payment is still processing. This page updates once Paystack confirms it, usually within a few minutes.",
  },
  failed: { tone: "bad", text: "The payment didn't go through, so nothing was charged. You can try again." },
  mismatch: { tone: "bad", text: "The amount paid didn't match the fee. Contact Perqly and we'll sort it out." },
  unavailable: { tone: "wait", text: "We couldn't check the payment just now. If you were charged, it will show here shortly." },
};

function Status({ billing }: { billing: MerchantBilling }) {
  const fee = formatGhs(billing.monthly_fee_pesewas);
  switch (billing.state) {
    case "off":
      return (
        <StatusLine icon={<Gift />} title="Free during the pilot" tone="good">
          Perqly doesn&apos;t charge businesses yet. We&apos;ll tell you well before that changes, and your first month will still be free.
        </StatusLine>
      );
    case "none":
      return (
        <StatusLine icon={<Clock />} title="Not started" tone="wait">
          Billing starts once your business is approved, beginning with a free month.
        </StatusLine>
      );
    case "trial":
      return (
        <StatusLine icon={<Gift />} title={`Free month until ${formatDate(billing.trial_ends_at!)}`} tone="good">
          After that, Perqly is {fee} a month. You can pay any time before then.
        </StatusLine>
      );
    case "active":
      return (
        <StatusLine icon={<CircleCheck />} title={`Paid until ${formatDate(billing.paid_until!)}`} tone="good">
          Your deals stay live. Paying again adds another month from that date.
        </StatusLine>
      );
    case "due":
      return (
        <StatusLine icon={<Clock />} title="Payment due" tone="wait">
          Pay {fee} by {billing.hold_on ? formatDate(billing.hold_on) : "soon"} to keep your deals live for students.
        </StatusLine>
      );
    case "on_hold":
      return (
        <StatusLine icon={<PauseCircle />} title="Your deals are paused" tone="bad">
          Students can&apos;t see your deals until you pay {fee}. They come back straight away after payment.
        </StatusLine>
      );
  }
}

function StatusLine({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "good" | "wait" | "bad";
  children: React.ReactNode;
}) {
  const colour = { good: "bg-green-50 text-green-800", wait: "bg-orange-50 text-orange-900", bad: "bg-red-50 text-red-800" }[tone];
  return (
    <div className="flex items-start gap-4">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl [&>svg]:size-6 ${colour}`} aria-hidden>
        {icon}
      </span>
      <div>
        <p className="font-display text-xl font-bold text-ink-900">{title}</p>
        <p className="mt-1 text-ink-700">{children}</p>
      </div>
    </div>
  );
}

export default async function MerchantBillingPage({ searchParams }: PageProps<"/merchant/billing">) {
  const membership = await getActiveMembership();
  if (!membership) redirect("/merchant");
  if (!canManage(membership)) {
    return (
      <AreaShell area="merchant">
        <PageTitle title="Billing" description="Only owners and managers can see and pay for Perqly." />
      </AreaShell>
    );
  }
  const [{ payment }, billing] = await Promise.all([searchParams, getMerchantBilling(membership.merchantId)]);
  const notice = typeof payment === "string" ? RETURN_MESSAGE[payment] : undefined;
  const canPay = billing && billing.enabled && billing.state !== "none";
  const paid = billing?.payments.filter((p) => p.status === "success") ?? [];

  return (
    <AreaShell area="merchant">
      <PageTitle title="Billing" description="Your Perqly subscription: one monthly fee, no cut of your sales." />
      {notice && (
        <p
          role="status"
          className={`mb-6 rounded-xl px-4 py-3 font-medium ${
            notice.tone === "good"
              ? "bg-green-50 text-green-800"
              : notice.tone === "bad"
                ? "bg-red-50 text-red-800"
                : "bg-orange-50 text-orange-900"
          }`}
        >
          {notice.text}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-start">
        <Card>
          {billing ? <Status billing={billing} /> : <p className="text-ink-700">Couldn&apos;t load billing. Refresh to try again.</p>}
          {canPay && (
            <div className="mt-6 border-t border-ink-200 pt-6">
              <PayButton
                merchantId={membership.merchantId}
                label={
                  billing.state === "active"
                    ? `Pay ${formatGhs(billing.monthly_fee_pesewas)} for another month`
                    : `Pay ${formatGhs(billing.monthly_fee_pesewas)} now`
                }
              />
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Wallet className="size-5 text-blue-600" aria-hidden /> Payments
            </span>
          </CardTitle>
          {paid.length === 0 ? (
            <p className="mt-3 text-ink-700">No payments yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-200">
              {paid.map((p) => (
                <li key={p.reference} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink-900">{formatGhs(p.amount_pesewas)}</span>
                    <span className="text-sm text-ink-600">
                      {p.period_start && p.period_end
                        ? `${formatDate(p.period_start)} to ${formatDate(p.period_end)}`
                        : formatDate(p.created_at)}
                    </span>
                  </span>
                  <Badge variant="outline">
                    {p.method === "manual"
                      ? "Recorded by Perqly"
                      : p.channel === "mobile_money"
                        ? "Mobile money"
                        : p.channel === "card"
                          ? "Card"
                          : "Paystack"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AreaShell>
  );
}
