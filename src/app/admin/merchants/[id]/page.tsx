import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { canManagePlatform } from "@/lib/auth/roles";
import { getUserContext } from "@/lib/auth/session";
import { MerchantDecisionForm } from "@/features/merchants/components/decision-form";
import { getBranches, getCategories, getMerchant, getTeam } from "@/features/merchants/queries";
import { MERCHANT_STATUS_LABEL } from "@/features/merchants/schemas";
import { formatDate } from "@/features/students/components/status-card";
import { getAgreementState } from "@/features/agreements/queries";
import { ManualPaymentForm } from "@/features/billing/components/admin-billing-forms";
import { formatGhs, getMerchantBilling } from "@/features/billing/queries";

export const metadata: Metadata = { title: "Business", robots: { index: false, follow: false } };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm font-medium text-ink-600">{label}</dt>
      <dd className="font-medium break-words text-ink-900">{children}</dd>
    </div>
  );
}

export default async function AdminMerchantPage({ params }: PageProps<"/admin/merchants/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [merchant, ctx] = await Promise.all([getMerchant(id), getUserContext()]);
  if (!merchant) notFound();
  const [branches, team, categories, agreement, billing] = await Promise.all([
    getBranches(id),
    getTeam(id),
    getCategories(),
    getAgreementState(id),
    getMerchantBilling(id),
  ]);
  const category = categories.find((c) => c.id === merchant.category_id)?.name ?? "Unknown";

  return (
    <AreaShell area="admin">
      <Link href="/admin/merchants" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Businesses
      </Link>
      <PageTitle
        title={merchant.display_name}
        description={`${MERCHANT_STATUS_LABEL[merchant.status]}, registered ${formatDate(merchant.created_at)}`}
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="mt-3 divide-y divide-ink-200">
              <Row label="Category">{category}</Row>
              <Row label="Registered name">{merchant.legal_name ?? "Not given"}</Row>
              <Row label="About">{merchant.description ?? "Not given"}</Row>
              <Row label="Phone">{merchant.phone ?? "Not given"}</Row>
              <Row label="Email">{merchant.email ?? "Not given"}</Row>
              <Row label="Website">{merchant.website ?? "Not given"}</Row>
              {merchant.status_reason && <Row label="Last note">{merchant.status_reason}</Row>}
            </dl>
          </Card>
          <Card>
            <CardTitle>Agreement</CardTitle>
            {agreement.signature ? (
              <p className="mt-2 text-ink-700">
                Version {agreement.signature.version} signed by {agreement.signature.signer_name} ({agreement.signature.signer_role}) for{" "}
                {agreement.signature.business_legal_name} on {formatDate(agreement.signature.signed_at)}.
              </p>
            ) : (
              <p className="mt-2 text-ink-700">
                Not signed{agreement.current ? ` (current version ${agreement.current.version})` : ""}. The business can&apos;t be submitted
                or add offers until the owner signs.
              </p>
            )}
          </Card>
          <Card>
            <CardTitle>Branches</CardTitle>
            {branches.length === 0 ? (
              <p className="mt-3 text-ink-700">No branches yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-200">
                {branches.map((b) => (
                  <li key={b.id} className="py-3">
                    <span className="font-semibold text-ink-900">{b.name}</span> {!b.is_active && <Badge variant="outline">Closed</Badge>}
                    <span className="block text-sm text-ink-600">
                      {[b.address_line, b.area, b.city, b.digital_address].filter(Boolean).join(", ")}
                      {b.latitude !== null ? ` (${b.latitude}, ${b.longitude})` : ", no map location"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Team</CardTitle>
            {team === null ? (
              <p className="mt-3 text-ink-700">Support staff with two-factor can see the team.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-200">
                {team.map((member) => (
                  <li key={member.member_id} className="flex items-center justify-between py-3">
                    <span className="font-medium text-ink-900">{member.full_name}</span>
                    <Badge variant="outline">{member.role}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle className="mb-4">Decision</CardTitle>
            {ctx && canManagePlatform(ctx) ? (
              <MerchantDecisionForm merchantId={merchant.id} status={merchant.status} />
            ) : (
              <p className="text-ink-700">Only Perqly admins can approve, reject or suspend businesses.</p>
            )}
          </Card>
          {billing && (
            <Card>
              <CardTitle className="mb-2">Billing</CardTitle>
              <p className="text-ink-700">
                {
                  {
                    off: "Billing is off: free during the pilot.",
                    none: "Starts when the business is approved.",
                    trial: `Free month until ${formatDate(billing.trial_ends_at)}.`,
                    active: `Paid until ${formatDate(billing.paid_until)}.`,
                    due: `Payment due. Deals pause on ${formatDate(billing.hold_on)}.`,
                    on_hold: "On hold: deals paused until payment.",
                  }[billing.state]
                }
              </p>
              {billing.payments.filter((p) => p.status === "success").length > 0 && (
                <ul className="mt-3 divide-y divide-ink-200 text-sm">
                  {billing.payments
                    .filter((p) => p.status === "success")
                    .slice(0, 5)
                    .map((p) => (
                      <li key={p.reference} className="flex justify-between gap-3 py-2">
                        <span>
                          {formatGhs(p.amount_pesewas)} for {p.months} month{p.months === 1 ? "" : "s"}
                        </span>
                        <span className="text-ink-600">
                          {p.method === "manual" ? "Recorded" : "Paystack"}, {formatDate(p.paid_at)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              {ctx && canManagePlatform(ctx) && merchant.status === "approved" && (
                <details className="mt-4">
                  <summary className="cursor-pointer font-semibold text-blue-700">Record a payment made another way</summary>
                  <div className="mt-4">
                    <ManualPaymentForm merchantId={merchant.id} feeGhs={billing.monthly_fee_pesewas / 100} />
                  </div>
                </details>
              )}
            </Card>
          )}
        </div>
      </div>
    </AreaShell>
  );
}
