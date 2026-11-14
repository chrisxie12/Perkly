import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { getActiveMembership, getMerchant } from "@/features/merchants/queries";
import { getAgreementState } from "@/features/agreements/queries";
import { AgreementText } from "@/features/agreements/components/agreement-text";
import { PrintAgreementButton } from "@/features/agreements/components/print-button";
import { SignAgreementForm } from "@/features/agreements/components/sign-form";

export const metadata: Metadata = { title: "Agreement", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Accra" });

export default async function AgreementPage() {
  const [ctx, membership] = await Promise.all([getUserContext(), getActiveMembership()]);
  if (!membership) redirect("/merchant");
  const [merchant, state] = await Promise.all([getMerchant(membership.merchantId), getAgreementState(membership.merchantId)]);
  if (!merchant || !state.current) redirect("/merchant");
  const { current, signature } = state;
  const isOwner = membership.role === "owner";

  return (
    <AreaShell area="merchant">
      <PageTitle
        title={current.title}
        description={`Version ${current.version}. ${signature ? "Signed for your business." : "The owner signs this once before Perqly reviews your business or your offers."}`}
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <Card className="print:shadow-none print:ring-0">
          <AgreementText body={current.body} />
          {signature && (
            <div className="mt-8 border-t border-ink-200 pt-5 text-ink-900">
              <p className="font-semibold">Signed electronically</p>
              <p>
                {signature.signer_name}, {signature.signer_role}, for {signature.business_legal_name}
              </p>
              <p className="text-sm text-ink-600">
                {when.format(new Date(signature.signed_at))}. Version {signature.version}. Text fingerprint{" "}
                {signature.body_sha256.slice(0, 16)}
              </p>
            </div>
          )}
        </Card>
        <Card className="print:hidden">
          {signature ? (
            <>
              <p className="flex items-center gap-2 font-display text-lg font-bold text-success">
                <CheckCircle2 className="size-5" aria-hidden /> Signed
              </p>
              <p className="mt-2 text-ink-700">
                {signature.signer_name} signed on {when.format(new Date(signature.signed_at))}. If Perqly changes the agreement, the owner
                is asked to sign the new version.
              </p>
              <div className="mt-4">
                <PrintAgreementButton />
              </div>
            </>
          ) : isOwner ? (
            <>
              <CardTitle className="mb-4">Sign</CardTitle>
              {ctx?.aal !== "aal2" ? (
                <p className="text-ink-700">Turn on two-step verification to sign. Sign out and back in, then follow the prompt.</p>
              ) : (
                <SignAgreementForm
                  merchantId={merchant.id}
                  version={current.version}
                  legalName={merchant.legal_name ?? merchant.display_name}
                  signerName={ctx?.fullName ?? ""}
                />
              )}
            </>
          ) : (
            <p className="text-ink-700">Only the business owner can sign. Ask them to sign in and open this page.</p>
          )}
        </Card>
      </div>
    </AreaShell>
  );
}
