import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { listInstitutions } from "@/features/admin/queries";
import { adminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const institutions = await listInstitutions();
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
        <Card className="bg-ink-50 shadow-none">
          <CardTitle>Coming in later steps</CardTitle>
          <CardDescription>
            Merchant approval, offer moderation, disputes and the audit log arrive with the merchant and redemption features.
          </CardDescription>
        </Card>
      </div>
    </AreaShell>
  );
}
