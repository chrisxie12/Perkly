import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Flag, Store } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getPlatformMetrics, getRedemptionFlags } from "@/features/admin/insights";
import { listInstitutions } from "@/features/admin/queries";
import { money } from "@/features/offers/schemas";
import { listMerchantsForStaff } from "@/features/merchants/queries";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const [institutions, merchants, metrics, flags] = await Promise.all([
    listInstitutions(),
    listMerchantsForStaff(),
    getPlatformMetrics(),
    getRedemptionFlags(),
  ]);
  const waiting = merchants.filter((m) => m.status === "pending_review").length;
  const live = merchants.filter((m) => m.status === "approved").length;
  const open = institutions.filter((row) => row.status !== "inactive").length;
  const withoutReviewers = institutions.filter(
    (row) => row.status !== "inactive" && row.reviewers === 0 && row.review_mode === "institution",
  );

  return (
    <AreaShell area="admin">
      <PageTitle title="Perqly staff" description="How Perqly is doing, and what needs attention." />
      {metrics && (
        <section aria-label="Platform numbers" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "Verified students",
              `${metrics.students_verified}`,
              `of ${metrics.students} signed up. ${metrics.applications_waiting} applications waiting`,
            ],
            ["Live businesses", `${metrics.merchants_live}`, `${metrics.merchants_waiting} waiting for review`],
            ["Live offers", `${metrics.offers_live}`, `${metrics.offers_waiting} waiting for review`],
            [
              "Redemptions, 30 days",
              `${metrics.redemptions_30d}`,
              `${metrics.redemptions_7d} this week. Students saved ${money(metrics.saved_30d)}`,
            ],
          ].map(([label, value, note]) => (
            <Card key={label}>
              <p className="text-sm font-semibold text-ink-600">{label}</p>
              <p className="mt-1 font-display text-4xl font-extrabold text-ink-900">{value}</p>
              <p className="mt-1 text-sm text-ink-600">{note}</p>
            </Card>
          ))}
        </section>
      )}
      {metrics && metrics.by_institution.length > 0 && (
        <Card className="mb-8">
          <CardTitle>Redemptions by school, 30 days</CardTitle>
          <ul className="mt-3 divide-y divide-ink-200">
            {metrics.by_institution.map((row) => (
              <li key={row.institution} className="flex justify-between gap-3 py-2">
                <span className="font-medium text-ink-900">{row.institution}</span>
                <span className="text-ink-700">
                  {row.redemptions}, saved {money(row.saved)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {flags.length > 0 && (
        <Card className="mb-8">
          <Flag className="size-6 text-orange-500" aria-hidden />
          <CardTitle className="mt-4">Worth a look</CardTitle>
          <CardDescription>Patterns from the last 30 days. They are signals, not proof; check before acting.</CardDescription>
          <ul className="mt-3 divide-y divide-ink-200">
            {flags.map((f) => (
              <li key={`${f.kind}-${f.student_id}-${f.merchant_id}`} className="py-2 text-ink-700">
                <span className="font-semibold text-ink-900">{f.student_name ?? "A student"}</span> at {f.merchant_name}:{" "}
                {f.kind === "confirmed_not_completed"
                  ? `${f.occurrences} redemptions confirmed by the cashier but never finished by the student`
                  : `${f.occurrences} redemptions where the phone was far from the branch`}
                .{" "}
                <Link href={`/admin/audit?id=${f.student_id}`} className="font-semibold text-blue-600 underline underline-offset-2">
                  Audit trail
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <Building2 className="size-6 text-blue-500" aria-hidden />
          <CardTitle className="mt-4">Institutions</CardTitle>
          <CardDescription>
            {institutions.length} in total, {open} open to students.
            {withoutReviewers.length > 0 &&
              ` ${withoutReviewers.map((row) => row.short_name).join(", ")} ${withoutReviewers.length === 1 ? "has" : "have"} no reviewers yet, so students there can't be verified.`}
          </CardDescription>
          <Link href="/admin/institutions" className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-600">
            Manage institutions <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
        <Card>
          <Store className="size-6 text-blue-500" aria-hidden />
          <CardTitle className="mt-4">Businesses</CardTitle>
          <CardDescription>
            {live} live. {waiting === 0 ? "None waiting for review." : `${waiting} waiting for review.`}
          </CardDescription>
          <Link href="/admin/merchants" className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-600">
            Review businesses <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
      </div>
    </AreaShell>
  );
}
