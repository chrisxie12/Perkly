import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { listInstitutions } from "@/features/admin/queries";
import { adminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Institutions", robots: { index: false, follow: false } };

const statusBadge = {
  active: { label: "Active", variant: "success" },
  pilot: { label: "Pilot", variant: "blue" },
  inactive: { label: "Hidden", variant: "outline" },
} as const;

export default async function InstitutionsPage() {
  const institutions = await listInstitutions();

  return (
    <AreaShell area="Perqly staff" nav={adminNav}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Institutions" description="Students can only choose institutions marked Pilot or Active." />
        <Link href="/admin/institutions/new" className={buttonVariants()}>
          <Plus aria-hidden /> Add institution
        </Link>
      </div>
      {institutions.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No institutions yet" description="Add the first one to open Perqly to its students." />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {institutions.map((row) => {
            const badge = statusBadge[row.status];
            return (
              <li key={row.id}>
                <Link href={`/admin/institutions/${row.id}`} className="flex items-center gap-4 p-5 hover:bg-ink-50">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900">{row.name}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </span>
                    <span className="mt-1 block text-sm text-ink-600">
                      {row.short_name}, {row.review_mode === "delegated" ? "reviewed by Perqly" : "reviewed by the institution"},{" "}
                      {row.reviewers === 1 ? "1 reviewer" : `${row.reviewers} reviewers`}
                    </span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-blue-500" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AreaShell>
  );
}
