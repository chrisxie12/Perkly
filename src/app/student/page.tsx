import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, QrCode } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { money } from "@/features/offers/schemas";
import { getMyHistory, getMyLiveSession } from "@/features/redemptions/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { VerificationStatusCard } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeZone: "Africa/Accra" });

export default async function StudentHomePage() {
  const [ctx, status, live, history] = await Promise.all([getUserContext(), getMyStudentStatus(), getMyLiveSession(), getMyHistory()]);
  const verified = verificationView(status) === "verified";
  const recent = history.redemptions.filter((r) => !r.voided).slice(0, 3);

  return (
    <AreaShell area="student">
      <PageTitle
        title={ctx?.firstName ? `Hi, ${ctx.firstName}.` : "Welcome"}
        description="Student prices near campus. Pay the business directly; Perqly never takes payment."
      />

      {live && (
        <Link
          href={`/student/redeem/${live}`}
          className="mb-6 flex items-center justify-between gap-3 rounded-xl bg-blue-600 p-5 font-semibold text-white"
        >
          You have a redemption in progress. Continue it <ArrowRight className="size-5 shrink-0" aria-hidden />
        </Link>
      )}

      {!verified && (
        <div className="mb-6">
          <VerificationStatusCard status={status} />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold text-ink-600">You&apos;ve saved</p>
          <p className="mt-1 font-display text-xl font-extrabold text-success sm:text-4xl">{money(history.savings?.total_saved ?? 0)}</p>
          <p className="mt-1 text-ink-700">
            {history.savings?.redemption_count
              ? `Across ${history.savings.redemption_count} discount${history.savings.redemption_count === 1 ? "" : "s"}.`
              : "Your savings show up here after your first discount."}
          </p>
          <Link href="/student/history" className="mt-4 inline-flex items-center gap-2 font-semibold text-blue-600">
            See your savings <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
        <Card>
          <CardTitle>At the counter</CardTitle>
          <p className="mt-2 text-ink-700">
            {verified
              ? "After you're served, scan the shop's Perqly code and pick what you bought."
              : "You can browse offers now. Redeeming opens once your school verifies you."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {verified && (
              <Link href="/student/scan" className={buttonVariants({})}>
                <QrCode aria-hidden /> Scan to redeem
              </Link>
            )}
            <Link href="/student/explore" className={buttonVariants({ variant: "secondary" })}>
              <Compass aria-hidden /> Explore offers
            </Link>
          </div>
        </Card>
      </div>

      {recent.length > 0 && (
        <section aria-labelledby="recent" className="mt-8">
          <h2 id="recent" className="mb-3 font-display text-xl font-bold">
            Recent
          </h2>
          <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
            {recent.map((r) => (
              <li key={r.redemption_id} className="flex items-baseline justify-between gap-3 p-4">
                <span>
                  <span className="block font-semibold text-ink-900">{r.item_name}</span>
                  <span className="text-sm text-ink-600">
                    {r.merchant_name}, {when.format(new Date(r.redeemed_at))}
                  </span>
                </span>
                <span className="font-semibold text-success">Saved {money(r.discount_amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AreaShell>
  );
}
