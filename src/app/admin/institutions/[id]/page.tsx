import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, TriangleAlert } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { setCampusActive, setDomainActive, setPrimaryCampus } from "@/features/admin/actions";
import { ACCREDITATION_LABEL, CampusDetailsForm, DirectoryForm, LogoUploader } from "@/features/admin/components/directory-forms";
import { institutionLogoUrl } from "@/features/institutions/logo-url";
import { getPublicEnv, hasSupabaseEnv } from "@/lib/env";
import { RemoveReviewerButton } from "@/features/admin/components/remove-reviewer-button";
import { AddCampusForm, AddDomainForm, AppointForm } from "@/features/admin/components/inline-forms";
import { InstitutionForm } from "@/features/admin/components/institution-form";
import { getInstitutionDetail } from "@/features/admin/queries";
import { formatDate } from "@/features/students/components/status-card";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";

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

const CAMPUS_TYPE = { main: "Main campus", satellite: "Campus", city: "City campus", learning_centre: "Learning centre" } as const;

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function InstitutionSummary({
  institution,
}: {
  institution: {
    status: string;
    review_mode: string;
    review_delegated_at: string | null;
    academic_year_end_month: number | null;
    academic_year_end_day: number | null;
  };
}) {
  const rows = [
    ["Status", institution.status === "inactive" ? "Hidden from students" : institution.status === "pilot" ? "Pilot" : "Active"],
    [
      "Reviewed by",
      institution.review_mode === "delegated"
        ? `Perqly, agreement signed ${formatDate(institution.review_delegated_at)}`
        : "The institution's own reviewers",
    ],
    [
      "Academic year ends",
      institution.academic_year_end_month && institution.academic_year_end_day
        ? `${institution.academic_year_end_day} ${months.at(institution.academic_year_end_month - 1)}`
        : "Not set (verification lasts one year)",
    ],
  ];
  return (
    <dl className="divide-y divide-ink-200">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-sm font-medium text-ink-600">{label}</dt>
          <dd className="font-medium text-ink-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function InstitutionDetailPage({ params, searchParams }: PageProps<"/admin/institutions/[id]">) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, ctx] = await Promise.all([getInstitutionDetail(id), getUserContext()]);
  if (!detail) notFound();
  const canManage = Boolean(ctx && canManagePlatform(ctx));
  const { institution, domains, campuses, reviewers } = detail;
  const logoUrl = institutionLogoUrl(hasSupabaseEnv() ? getPublicEnv().NEXT_PUBLIC_SUPABASE_URL : null, institution.logo_path);
  const listedUnconfirmed = institution.status !== "inactive" && institution.accreditation_status !== "confirmed";

  return (
    <AreaShell area="admin">
      <Link href="/admin/institutions" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Institutions
      </Link>
      <PageTitle title={institution.name} description={`${institution.short_name} · ${institution.slug}`} />
      {!canManage && (
        <p className="mb-6 rounded-lg bg-ink-100 px-4 py-3 text-[0.9375rem] text-ink-700">
          You can view this institution. Only Perqly admins can change it.
        </p>
      )}
      {saved === "institution" && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          <BadgeCheck className="size-5" aria-hidden /> Saved.
        </p>
      )}

      {listedUnconfirmed && (
        <p role="note" className="mb-6 flex items-start gap-2 rounded-lg bg-orange-50 px-4 py-3 font-medium text-orange-900">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          Students can choose this institution, but its GTEC accreditation hasn&apos;t been recorded. Check it on gtec.edu.gh and record it
          below.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Section title="Details" description="Changes are logged. Status controls whether students can choose this institution.">
            {canManage ? <InstitutionForm institution={institution} /> : <InstitutionSummary institution={institution} />}
          </Section>

          <Section
            title="Directory and accreditation"
            description="What students see when choosing their school. Only record details from official sources."
          >
            {canManage ? (
              <DirectoryForm institution={institution} />
            ) : (
              <dl className="divide-y divide-ink-200">
                {[
                  [
                    "Type",
                    institution.institution_type === "public"
                      ? "Public"
                      : institution.institution_type === "private"
                        ? "Private"
                        : "Not set",
                  ],
                  ["GTEC", ACCREDITATION_LABEL[institution.accreditation_status]],
                  ["Website", institution.official_website ?? "Not set"],
                  ["Location", [institution.city, institution.region].filter(Boolean).join(", ") || "Not set"],
                ].map(([label, value]) => (
                  <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm font-medium text-ink-600">{label}</dt>
                    <dd className="font-medium break-all text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="text-sm text-ink-600">
              {institution.accreditation_checked_at ? `Accreditation recorded ${formatDate(institution.accreditation_checked_at)}. ` : ""}
              {institution.last_checked_at
                ? `Details last checked ${formatDate(institution.last_checked_at)}.`
                : "Details not checked yet."}
              {institution.info_source_url && (
                <>
                  {" "}
                  <a
                    href={institution.info_source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 underline"
                  >
                    Source <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </>
              )}
            </p>
          </Section>

          <Section title="Official logo" description="Shown to students when they pick their school. Never cropped or recoloured.">
            {canManage ? (
              <LogoUploader institution={institution} logoUrl={logoUrl} />
            ) : (
              <p className="text-[0.9375rem] text-ink-700">
                {institution.logo_status === "official" ? "Official logo on file." : "Logo pending."}
              </p>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            title="Reviewers"
            description={
              institution.review_mode === "delegated"
                ? "Perqly reviewers decide for this institution under the signed agreement. Institution reviewers and Perqly admins can decide too."
                : "These people, and Perqly admins, can approve or reject this institution's students."
            }
          >
            {reviewers.length === 0 ? (
              <Empty>No reviewers yet. Students can apply; Perqly admins decide until the institution appoints reviewers.</Empty>
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
                    {canManage && (
                      <RemoveReviewerButton institutionId={institution.id} reviewerId={reviewer.id} name={reviewer.full_name} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && <AppointForm institutionId={institution.id} />}
          </Section>

          <Section title="Campuses" description="Students pick a campus when they set up their profile. Hidden campuses aren't offered.">
            {campuses.length === 0 ? (
              <Empty>No campuses yet.</Empty>
            ) : (
              <ul className="divide-y divide-ink-200">
                {campuses.map((campus) => (
                  <li key={campus.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
                          {campus.name}
                          {campus.is_primary && <Badge variant="blue">Primary</Badge>}
                          {!campus.is_active && <Badge variant="outline">Hidden</Badge>}
                          {campus.info_status === "unverified" && <Badge variant="orange">Not confirmed</Badge>}
                        </span>
                        <span className="text-sm text-ink-600">
                          {[CAMPUS_TYPE[campus.campus_type], campus.address, campus.city].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      {canManage && !campus.is_primary && campus.is_active && (
                        <form action={setPrimaryCampus}>
                          <input type="hidden" name="institutionId" value={institution.id} />
                          <input type="hidden" name="campusId" value={campus.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Make primary
                          </Button>
                        </form>
                      )}
                      {canManage && (
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
                      )}
                    </div>
                    {canManage && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-sm font-semibold text-blue-700">Edit details</summary>
                        <CampusDetailsForm institutionId={institution.id} campus={campus} />
                      </details>
                    )}
                    {campus.source_url && (
                      <a
                        href={campus.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-sm text-ink-600 underline"
                      >
                        Source <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && <AddCampusForm institutionId={institution.id} />}
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
                    {canManage && (
                      <form action={setDomainActive}>
                        <input type="hidden" name="institutionId" value={institution.id} />
                        <input type="hidden" name="domain" value={domain.domain} />
                        <input type="hidden" name="active" value={domain.is_active ? "false" : "true"} />
                        <Button type="submit" variant="ghost" size="sm">
                          {domain.is_active ? "Turn off" : "Turn on"}
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && <AddDomainForm institutionId={institution.id} />}
          </Section>
        </div>
      </div>
    </AreaShell>
  );
}
