import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Store } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { listInstitutions } from "@/features/admin/queries";
import { listMerchantsForStaff } from "@/features/merchants/queries";
import { adminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const [institutions, merchants] = await Promise.all([listInstitutions(), listMerchantsForStaff()]);
  const waiting = merchants.filter((m) => m.status === "pending_review").length;
  const live = merchants.filter((m) => m.status === "approved").length;
  const open = institutions.filter((row) => row.status !== "inactive").length;
  const withoutReviewers = institutions.filter(
    (row) => row.status !== "inactive" && row.reviewers === 0 && row.review_mode === "institution",
  );

  return (
    <AreaShell area="Perqly staff" nav={adminNav}>
      <PageTitle title="Perqly staff" description="Set up institutions and the people who verify their students." />
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
