import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { getMyStudentStatus } from "@/features/students/queries";
import { withdrawVerificationApplication } from "@/features/students/actions";
import { REJECTION_REASONS, verificationView } from "@/features/students/status";
import { VerificationStatusCard, formatDate } from "@/features/students/components/status-card";
import { VerificationForm } from "@/features/students/components/verification-form";
import { studentNav } from "../student-nav";

export const metadata: Metadata = { title: "Student verification", robots: { index: false } };

export default async function VerifyPage() {
  const [ctx, status] = await Promise.all([getUserContext(), getMyStudentStatus()]);
  const view = verificationView(status);
  const profile = status.profile;
  const app = status.application;
  const school = profile?.institution_short_name ?? "your school";
  const canEdit = app && (app.status === "draft" || app.status === "resubmission_requested");

  return (
    <AreaShell area="Student" nav={studentNav}>
      <PageTitle
        title="Get verified"
        description={`${school}'s appointed reviewers confirm you're a student. You'll need your student ID number, a photo of your student ID card and a selfie.`}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <VerificationStatusCard status={status} showAction={view === "needs_profile"} />

        {view === "pending" && app && (
          <Card>
            <p className="leading-relaxed text-ink-700">
              Sent on {formatDate(app.submitted_at)} with student ID{" "}
              <strong className="font-semibold text-ink-900">{app.student_id_number}</strong>
              {app.institutional_email ? ` and institutional email ${app.institutional_email}` : ""}. You&apos;ll be notified when {school}{" "}
              decides.
            </p>
            <form action={withdrawVerificationApplication} className="mt-5">
              <input type="hidden" name="applicationId" value={app.id} />
              <Button type="submit" variant="secondary">
                Withdraw application
              </Button>
            </form>
          </Card>
        )}

        {view === "resubmit" && app?.reviewer_note && (
          <Card className="bg-orange-50 ring-orange-200 lg:col-start-2">
            <p className="text-sm font-semibold text-ink-700">Note from {school}&apos;s reviewer</p>
            <p className="mt-2 leading-relaxed text-ink-900">{app.reviewer_note}</p>
          </Card>
        )}

        {view === "rejected" && app && (
          <Card>
            <p className="leading-relaxed text-ink-700">{REJECTION_REASONS[app.decision_reason ?? "other"]}</p>
            {app.reviewer_note && <p className="mt-3 leading-relaxed text-ink-900">Reviewer&apos;s note: {app.reviewer_note}</p>}
            <p className="mt-3 text-ink-700">You can apply again with corrected details.</p>
          </Card>
        )}

        {ctx && profile && ["apply", "resubmit", "rejected", "expired"].includes(view) && (
          <Card className="lg:col-start-2">
            <VerificationForm
              userId={ctx.userId}
              applicationId={canEdit ? app.id : null}
              institutionShortName={profile.institution_short_name}
              initialStudentIdNumber={app?.student_id_number ?? null}
              idCardPath={canEdit ? app.id_card_path : null}
              selfiePath={canEdit ? app.selfie_path : null}
              institutionalEmail={profile.institutional_email}
              institutionalEmailConfirmed={profile.institutional_email_confirmed}
            />
          </Card>
        )}

        {view === "verified" && (
          <Card>
            <p className="leading-relaxed text-ink-700">
              You can book and redeem student discounts until {formatDate(profile?.verified_until)}.
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <Link href="/student">Back to home</Link>
            </Button>
          </Card>
        )}
      </div>
    </AreaShell>
  );
}
