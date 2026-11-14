import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CheckCircle2, Circle, Clock3, ShieldAlert, Store } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { chooseMerchant, submitForReview } from "@/features/merchants/actions";
import { RegisterMerchantForm } from "@/features/merchants/components/merchant-forms";
import { getActiveMembership, getBranches, getCategories, getMerchant } from "@/features/merchants/queries";
import { MERCHANT_STATUS_LABEL, merchantErrorMessage } from "@/features/merchants/schemas";
import { getAgreementState } from "@/features/agreements/queries";
import { canManage } from "./merchant-nav";

export const metadata: Metadata = { title: "Your business", robots: { index: false } };

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-ink-400" aria-hidden />
      )}
      <span className={done ? "text-ink-700" : "font-medium text-ink-900"}>
        {children}
        <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
      </span>
    </li>
  );
}

export default async function MerchantHomePage({ searchParams }: PageProps<"/merchant">) {
  const [ctx, membership, query] = await Promise.all([getUserContext(), getActiveMembership(), searchParams]);

  if (!membership) {
    const categories = await getCategories();
    return (
      <AreaShell area="merchant">
        <PageTitle
          title="Register your business"
          description="Offer student prices to verified tertiary students near you. Joining is free during the pilot. Perqly reviews every business before students can see it."
        />
        <Card className="max-w-2xl">
          <RegisterMerchantForm categories={categories} />
        </Card>
      </AreaShell>
    );
  }

  const [merchant, branches, agreement] = await Promise.all([
    getMerchant(membership.merchantId),
    getBranches(membership.merchantId),
    getAgreementState(membership.merchantId),
  ]);
  const signed = Boolean(agreement.signature);
  if (!merchant) {
    return (
      <AreaShell area="merchant">
        <PageTitle
          title="We couldn't load your business"
          description="Refresh to try again. If it keeps happening, contact Perqly support."
        />
      </AreaShell>
    );
  }

  const isOwner = membership.role === "owner";
  const activeBranches = branches.filter((b) => b.is_active);
  const profileDone = Boolean(merchant.description && (merchant.phone || merchant.email));
  const canSubmit = isOwner && (merchant.status === "draft" || merchant.status === "rejected");
  const statusIcon = { draft: Store, pending_review: Clock3, approved: BadgeCheck, rejected: ShieldAlert, suspended: ShieldAlert }[
    merchant.status
  ];
  const StatusIcon = statusIcon;
  const errorCode = typeof query.error === "string" ? query.error : undefined;

  return (
    <AreaShell area="merchant">
      <PageTitle title={merchant.display_name} description={`Your role: ${membership.role}.`} />

      {query.registered && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          Business registered. Add a branch and your details, then send it for review.
        </p>
      )}
      {query.submitted && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          Sent for review. Perqly usually decides within two working days.
        </p>
      )}
      {errorCode && (
        <p role="alert" className="mb-6 rounded-lg bg-orange-50 px-4 py-3 font-medium text-ink-900 ring-1 ring-orange-200">
          {merchantErrorMessage(errorCode)}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <StatusIcon className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-600">Status</p>
              <h2 className="font-display text-xl font-bold tracking-tight">{MERCHANT_STATUS_LABEL[merchant.status]}</h2>
              <p className="mt-2 leading-relaxed text-ink-700">
                {
                  {
                    draft: "Students can't see your business yet. Finish the steps, then send it for review.",
                    pending_review: "Perqly is reviewing your business. You can keep editing your branches and team meanwhile.",
                    approved: "Your business is live. Verified students can find you and redeem your offers.",
                    rejected: "Perqly needs some changes before your business can go live.",
                    suspended: "Your business is hidden from students while Perqly looks into it.",
                  }[merchant.status]
                }
              </p>
              {merchant.status_reason && (merchant.status === "rejected" || merchant.status === "suspended") && (
                <p className="mt-3 rounded-lg bg-orange-50 px-4 py-3 text-ink-900">Perqly&apos;s note: {merchant.status_reason}</p>
              )}
            </div>
          </div>
        </Card>

        {(merchant.status === "draft" || merchant.status === "rejected") && (
          <Card>
            <CardTitle>Before review</CardTitle>
            <ol className="mt-4 space-y-3">
              <Step done={profileDone}>
                <Link href="/merchant/profile" className="underline underline-offset-2">
                  Describe your business and add a contact
                </Link>
              </Step>
              <Step done={activeBranches.length > 0}>
                <Link href="/merchant/branches" className="underline underline-offset-2">
                  Add at least one branch
                </Link>
              </Step>
              <Step done={signed}>
                <Link href="/merchant/agreement" className="underline underline-offset-2">
                  Sign the student discount agreement (owner)
                </Link>
              </Step>
            </ol>
            {canSubmit ? (
              <form action={submitForReview} className="mt-6">
                <input type="hidden" name="merchantId" value={merchant.id} />
                <SubmitButton disabled={activeBranches.length === 0 || !signed}>Send for review</SubmitButton>
                {(activeBranches.length === 0 || !signed) && (
                  <p className="mt-2 text-sm text-ink-600">
                    {activeBranches.length === 0 ? "Add a branch first." : "Sign the agreement first."}
                  </p>
                )}
              </form>
            ) : (
              <p className="mt-6 text-sm text-ink-600">Only the owner can send the business for review.</p>
            )}
          </Card>
        )}

        {merchant.status === "approved" && (
          <Card>
            <CardTitle>At the counter</CardTitle>
            <CardDescription>
              {canManage(membership)
                ? "Create student offers, print each branch's QR poster, and keep the counter screen open to confirm discounts."
                : "Keep the counter screen open. Students who scan your code appear there for you to confirm."}
            </CardDescription>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/merchant/counter" className={buttonVariants({})}>
                Open the counter
              </Link>
              {canManage(membership) && (
                <>
                  <Link href="/merchant/offers" className={buttonVariants({ variant: "secondary" })}>
                    Offers
                  </Link>
                  <Link href="/merchant/codes" className={buttonVariants({ variant: "secondary" })}>
                    QR codes
                  </Link>
                  <Link href="/merchant/analytics" className={buttonVariants({ variant: "secondary" })}>
                    Analytics
                  </Link>
                </>
              )}
            </div>
          </Card>
        )}

        {ctx && ctx.merchantRoles.length > 1 && (
          <Card>
            <CardTitle>Your businesses</CardTitle>
            <ul className="mt-4 space-y-2">
              {ctx.merchantRoles.map((m) => (
                <li key={m.merchantId} className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink-900">
                    {m.displayName} <Badge variant="outline">{MERCHANT_STATUS_LABEL[m.status]}</Badge>
                  </span>
                  {m.merchantId === membership.merchantId ? (
                    <span className="text-sm text-ink-600">Current</span>
                  ) : (
                    <form action={chooseMerchant}>
                      <input type="hidden" name="merchantId" value={m.merchantId} />
                      <Button type="submit" variant="ghost" size="sm">
                        Switch
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AreaShell>
  );
}
