import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CircleDashed, ShieldAlert } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { getApplication, getDocumentLinks } from "@/features/institutions/queries";
import { DecisionForm } from "@/features/institutions/components/decision-form";
import { formatDate } from "@/features/students/components/status-card";
import { institutionNav } from "../../institution-nav";

export const metadata: Metadata = { title: "Review application", robots: { index: false } };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm font-medium text-ink-600">{label}</dt>
      <dd className="font-medium text-ink-900">{children}</dd>
    </div>
  );
}

export default async function ReviewPage({ params }: PageProps<"/institution/requests/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [ctx, application] = await Promise.all([getUserContext(), getApplication(id)]);
  if (!application) notFound();

  const isOwn = ctx?.userId === application.student_id;
  const docs = application.status === "submitted" && !isOwn ? await getDocumentLinks(id) : null;

  return (
    <AreaShell area="Institution reviewer" nav={institutionNav}>
      <Link href="/institution" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Back to queue
      </Link>
      <PageTitle
        title={application.full_name}
        description={`${application.institution_short_name} verification application, sent ${formatDate(application.submitted_at)}.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardTitle>Details</CardTitle>
            <dl className="mt-3 divide-y divide-ink-200">
              <Row label="Student ID number">{application.student_id_number ?? "Not given"}</Row>
              <Row label="Programme">{application.programme ?? "Not given"}</Row>
              <Row label="Level">{application.level ?? "Not given"}</Row>
              <Row label="Graduation year">{application.grad_year ?? "Not given"}</Row>
              <Row label="Institutional email">
                {application.institutional_email ? (
                  <span className="flex flex-col gap-1">
                    <span>{application.institutional_email}</span>
                    <span className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">
                        {application.institutional_email_confirmed ? (
                          <BadgeCheck className="size-3.5" aria-hidden />
                        ) : (
                          <CircleDashed className="size-3.5" aria-hidden />
                        )}
                        {application.institutional_email_confirmed ? "Confirmed by code" : "Not confirmed"}
                      </span>
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700">
                        {application.institutional_email_domain_listed ? "Domain on your institution's list" : "Domain not on your list"}
                      </span>
                    </span>
                    <span className="text-sm font-normal text-ink-600">
                      For information only. An email address doesn&apos;t prove enrolment.
                    </span>
                  </span>
                ) : (
                  "Not provided (optional)"
                )}
              </Row>
              {application.history.length > 0 && (
                <Row label="Earlier applications">
                  {application.history
                    .map((item) => `${item.status.replace("_", " ")}${item.decided_at ? ` (${formatDate(item.decided_at)})` : ""}`)
                    .join(", ")}
                </Row>
              )}
            </dl>
          </Card>

          {docs && (
            <Card>
              <CardTitle>Evidence</CardTitle>
              <p className="mt-1 text-sm text-ink-600">Links expire in 5 minutes. Your view has been logged.</p>
              {docs.deleted ? (
                <p className="mt-4 text-ink-700">These documents have been deleted under the 30-day rule.</p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {[
                    { label: "Student ID card", url: docs.idCard },
                    { label: "Selfie", url: docs.selfie },
                  ].map((doc) => (
                    <figure key={doc.label} className="overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200">
                      {doc.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, must not be cached or optimised
                        <img src={doc.url} alt={doc.label} referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-contain" />
                      ) : (
                        <div className="grid aspect-[4/3] place-items-center p-4 text-center text-sm text-ink-600">
                          Couldn&apos;t load this file.
                        </div>
                      )}
                      <figcaption className="px-3 py-2 text-sm font-medium text-ink-700">{doc.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <Card>
          <CardTitle className="mb-5">Your decision</CardTitle>
          {isOwn ? (
            <p className="flex items-start gap-2 text-ink-700">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-orange-700" aria-hidden /> This is your own application. Another reviewer
              must decide it.
            </p>
          ) : application.status === "submitted" ? (
            <DecisionForm applicationId={application.id} />
          ) : (
            <p className="text-ink-700">
              Already decided: <strong className="font-semibold">{application.status.replace("_", " ")}</strong>
              {application.decided_at ? ` on ${formatDate(application.decided_at)}` : ""}.
            </p>
          )}
        </Card>
      </div>
    </AreaShell>
  );
}
