import type { Metadata } from "next";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { administeredInstitutions } from "@/lib/auth/roles";
import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AppointForm } from "@/features/admin/components/inline-forms";
import { RemoveReviewerButton } from "@/features/admin/components/remove-reviewer-button";
import { formatDate } from "@/features/students/components/status-card";
import { institutionNavFor } from "../institution-nav";

export const metadata: Metadata = { title: "Reviewers", robots: { index: false } };

type ReviewerRow = { reviewer_id: string; user_id: string; full_name: string; role: "reviewer" | "admin"; created_at: string };

export default async function InstitutionReviewersPage() {
  const ctx = await getUserContext();
  const institutions = ctx ? administeredInstitutions(ctx) : [];

  if (!ctx || institutions.length === 0) {
    return (
      <AreaShell area="Institution reviewer" nav={institutionNavFor(ctx)}>
        <PageTitle title="Reviewers" description="Only institution admins can manage reviewers. Ask your institution admin or Perqly." />
      </AreaShell>
    );
  }

  const supabase = await createClient();
  const lists = await Promise.all(
    institutions.map(async (institution) => {
      const { data, error } = await supabase.rpc("get_institution_reviewers", { p_institution_id: institution.institutionId });
      return { institution, rows: (data ?? []) as ReviewerRow[], failed: Boolean(error) };
    }),
  );

  return (
    <AreaShell area="Institution reviewer" nav={institutionNavFor(ctx)}>
      <PageTitle
        title="Reviewers"
        description="The people who approve or reject your students. Appoint someone by the email they use for Perqly, and remove them when they leave."
      />
      <div className="space-y-6">
        {lists.map(({ institution, rows, failed }) => (
          <Card key={institution.institutionId}>
            <CardTitle>{institution.shortName}</CardTitle>
            <CardDescription>
              {rows.length === 1 ? "1 person" : `${rows.length} people`} can review {institution.shortName} students.
            </CardDescription>
            {failed ? (
              <p className="mt-5 rounded-lg bg-orange-50 px-4 py-3 text-ink-900">Couldn&apos;t load reviewers. Refresh to try again.</p>
            ) : (
              <ul className="mt-5 divide-y divide-ink-200">
                {rows.map((row) => (
                  <li key={row.reviewer_id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-900">
                        {row.full_name}
                        {row.user_id === ctx.userId && <span className="ml-2 text-sm font-medium text-ink-600">You</span>}
                      </span>
                      <span className="text-sm text-ink-600">Since {formatDate(row.created_at)}</span>
                    </span>
                    <Badge variant={row.role === "admin" ? "blue" : "outline"}>
                      {row.role === "admin" ? "Institution admin" : "Reviewer"}
                    </Badge>
                    {row.role === "reviewer" && (
                      <RemoveReviewerButton institutionId={institution.institutionId} reviewerId={row.reviewer_id} name={row.full_name} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 border-t border-ink-200 pt-6">
              <AppointForm institutionId={institution.institutionId} allowAdmin={false} />
            </div>
          </Card>
        ))}
      </div>
    </AreaShell>
  );
}
