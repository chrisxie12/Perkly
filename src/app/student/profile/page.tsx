import type { Metadata } from "next";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { isInstitutionalEmailConfirmationEnabled } from "@/lib/env.server";
import { getMyStudentStatus, getSchoolOptions } from "@/features/students/queries";
import { schoolLockReason } from "@/features/students/status";
import { StudentProfileForm } from "@/features/students/components/profile-form";
import { InstitutionalEmailCard } from "@/features/students/components/institutional-email-card";
import { studentNav } from "../student-nav";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default async function StudentProfilePage() {
  const [status, options] = await Promise.all([getMyStudentStatus(), getSchoolOptions()]);
  const profile = status.profile;
  const lockReason = schoolLockReason(status);

  return (
    <AreaShell area="Student" nav={studentNav}>
      <PageTitle title="Your profile" description="Your school details are used for your verification application." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-6">School details</CardTitle>
          {options.institutions.length === 0 ? (
            <p className="text-ink-700">No schools are open on Perqly yet.</p>
          ) : (
            <StudentProfileForm
              institutions={options.institutions}
              campuses={options.campuses}
              lockReason={lockReason}
              currentYear={new Date().getFullYear()}
              initial={{
                institutionId: profile?.institution_id,
                campusId: profile?.campus_id,
                programme: profile?.programme,
                level: profile?.level,
                gradYear: profile?.grad_year,
              }}
            />
          )}
        </Card>
        {profile ? (
          <InstitutionalEmailCard
            email={profile.institutional_email}
            confirmed={profile.institutional_email_confirmed}
            confirmationEnabled={isInstitutionalEmailConfirmationEnabled()}
          />
        ) : (
          <Card>
            <CardTitle>Institutional email (optional)</CardTitle>
            <p className="mt-2 text-ink-600">Save your school details first. Then you can add a school email if you have one.</p>
          </Card>
        )}
      </div>
    </AreaShell>
  );
}
