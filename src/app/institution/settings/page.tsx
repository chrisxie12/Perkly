import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getInstitutionSettings, getReviewableInstitutions } from "@/features/institutions/queries";

export const metadata: Metadata = { title: "Institution settings", robots: { index: false } };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function InstitutionSettingsPage({ searchParams }: PageProps<"/institution/settings">) {
  const [params, reviewable] = await Promise.all([searchParams, getReviewableInstitutions()]);
  const chosen = reviewable.find((r) => r.institution_id === params.school) ?? reviewable[0];
  const settings = chosen ? await getInstitutionSettings(chosen.institution_id) : null;
  const inst = settings?.institution;

  return (
    <AreaShell area="institution">
      <PageTitle
        title="Settings"
        description="How your institution is set up on Perqly. To change any of this, email Perqly support; Perqly staff make the change and it is logged."
      />
      {reviewable.length > 1 && (
        <nav aria-label="Institution" className="mb-6 flex flex-wrap gap-2">
          {reviewable.map((r) => (
            <Link
              key={r.institution_id}
              href={`/institution/settings?school=${r.institution_id}`}
              aria-current={r.institution_id === chosen?.institution_id ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold ring-1",
                r.institution_id === chosen?.institution_id ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200",
              )}
            >
              {r.short_name}
            </Link>
          ))}
        </nav>
      )}
      {!inst ? (
        <p className="text-ink-700">You can&apos;t review any institution at the moment.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardTitle>{inst.name}</CardTitle>
            <dl className="mt-4 divide-y divide-ink-200">
              {[
                ["Short name", inst.short_name],
                [
                  "Status on Perqly",
                  inst.status === "pilot" ? "Pilot" : inst.status === "active" ? "Open to students" : "Closed to students",
                ],
                [
                  "Who reviews students",
                  inst.review_mode === "delegated" ? "Perqly staff, on the institution's behalf" : "The institution's own reviewers",
                ],
                [
                  "Verification lasts until",
                  inst.academic_year_end_month
                    ? `${inst.academic_year_end_day ?? 1} ${MONTHS[inst.academic_year_end_month - 1]} each year`
                    : "Not set",
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-3">
                  <dt className="text-ink-700">{label}</dt>
                  <dd className="text-right font-medium text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardTitle>Email domains</CardTitle>
              <p className="mt-1 text-sm text-ink-600">
                Students can confirm a school email at these domains. It helps reviewers but never verifies a student on its own.
              </p>
              {settings.domains.length === 0 ? (
                <p className="mt-3 text-ink-700">None set.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {settings.domains.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-ink-900">{d.domain}</span>
                      {!d.is_active && <Badge variant="outline">Off</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle>Campuses</CardTitle>
              {settings.campuses.length === 0 ? (
                <p className="mt-3 text-ink-700">None set.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {settings.campuses.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span className="text-ink-900">
                        {c.name}
                        {c.digital_address ? <span className="text-sm text-ink-600"> ({c.digital_address})</span> : null}
                      </span>
                      {!c.is_active && <Badge variant="outline">Off</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </AreaShell>
  );
}
