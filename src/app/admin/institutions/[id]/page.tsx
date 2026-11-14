import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { removeReviewer, setCampusActive, setDomainActive } from "@/features/admin/actions";
import { AddCampusForm, AddDomainForm, AppointForm } from "@/features/admin/components/inline-forms";
import { InstitutionForm } from "@/features/admin/components/institution-form";
import { getInstitutionDetail } from "@/features/admin/queries";
import { formatDate } from "@/features/students/components/status-card";
import { adminNav } from "../../admin-nav";

export const metadata: Metadata = { title: "Institution", robots: { index: false, follow: false } };

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <div className="mt-5 space-y-5">{children}</div>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-ink-50 px-4 py-3 text-[0.9375rem] text-ink-600">{children}</p>;
}

export default async function InstitutionDetailPage({ params, searchParams }: PageProps<"/admin/institutions/[id]">) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getInstitutionDetail(id);
  if (!detail) notFound();
  const { institution, domains, campuses, reviewers } = detail;

  return (
    <AreaShell area="Perqly staff" nav={adminNav}>
      <Link href="/admin/institutions" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Institutions
      </Link>
      <PageTitle title={institution.name} description={`${institution.short_name} · ${institution.slug}`} />
      {saved === "institution" && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          <BadgeCheck className="size-5" aria-hidden /> Saved.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Section title="Details" description="Changes are logged. Status controls whether students can choose this institution.">
          <InstitutionForm institution={institution} />
        </Section>

        <div className="space-y-6">
          <Section
            title="Reviewers"
            description={
              institution.review_mode === "delegated"
                ? "Perqly reviewers decide for this institution under the signed agreement. Institution reviewers can still decide too."
                : "Only these people can approve or reject this institution's students."
            }
          >
            {reviewers.length === 0 ? (
              <Empty>No reviewers yet. Students can apply, but nobody can decide.</Empty>
            ) : (
              <ul className="divide-y divide-ink-200">
                {reviewers.map((reviewer) => (
                  <li key={reviewer.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-900">{reviewer.full_name}</span>
                      <span className="text-sm text-ink-600">Since {formatDate(reviewer.created_at)}</span>
                    </span>
                    <Badge variant={reviewer.role === "admin" ? "blue" : "outline"}>
                      {reviewer.role === "admin" ? "Institution admin" : "Reviewer"}
                    </Badge>
                    <form action={removeReviewer}>
                      <input type="hidden" name="institutionId" value={institution.id} />
                      <input type="hidden" name="reviewerId" value={reviewer.id} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${reviewer.full_name}`}>
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <AppointForm institutionId={institution.id} />
          </Section>

          <Section title="Campuses" description="Students pick a campus when they set up their profile. Hidden campuses aren't offered.">
            {campuses.length === 0 ? (
              <Empty>No campuses yet.</Empty>
            ) : (
              <ul className="divide-y divide-ink-200">
                {campuses.map((campus) => (
                  <li key={campus.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-900">{campus.name}</span>
                      <span className="text-sm text-ink-600">{campus.digital_address ?? "No GhanaPost address"}</span>
                    </span>
                    {!campus.is_active && <Badge variant="outline">Hidden</Badge>}
                    <form action={setCampusActive}>
                      <input type="hidden" name="institutionId" value={institution.id} />
                      <input type="hidden" name="campusId" value={campus.id} />
                      <input type="hidden" name="name" value={campus.name} />
                      <input type="hidden" name="digitalAddress" value={campus.digital_address ?? ""} />
                      <input type="hidden" name="latitude" value={campus.latitude ?? ""} />
                      <input type="hidden" name="longitude" value={campus.longitude ?? ""} />
                      <input type="hidden" name="active" value={campus.is_active ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {campus.is_active ? "Hide" : "Show"}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <AddCampusForm institutionId={institution.id} />
          </Section>

          <Section
            title="Student email domains"
            description="Used to label institutional emails for reviewers. A matching domain doesn't verify anyone on its own."
          >
            {domains.length === 0 ? (
              <Empty>No domains yet.</Empty>
            ) : (
              <ul className="divide-y divide-ink-200">
                {domains.map((domain) => (
                  <li key={domain.id} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 font-semibold break-all text-ink-900">{domain.domain}</span>
                    {!domain.is_active && <Badge variant="outline">Off</Badge>}
                    <form action={setDomainActive}>
                      <input type="hidden" name="institutionId" value={institution.id} />
                      <input type="hidden" name="domain" value={domain.domain} />
                      <input type="hidden" name="active" value={domain.is_active ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {domain.is_active ? "Turn off" : "Turn on"}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <AddDomainForm institutionId={institution.id} />
          </Section>
        </div>
      </div>
    </AreaShell>
  );
}
