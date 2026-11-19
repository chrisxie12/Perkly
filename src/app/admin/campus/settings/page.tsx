import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { endAgreement, setCampusSwitch } from "@/features/campus/admin-actions";
import { getCampusOverview } from "@/features/campus/queries";
import { formatDay } from "@/features/campus/schemas";
import { ActionForm } from "@/features/campus/components/action-form";
import { AgreementForm } from "@/features/campus/components/campus-settings-forms";

export const metadata: Metadata = { title: "Campus switches and agreements", robots: { index: false, follow: false } };

export default async function CampusSettingsPage() {
  const [ctx, overview] = await Promise.all([getUserContext(), getCampusOverview()]);
  if (!overview) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly admins with two-factor see Campus switches and agreements." />
      </AreaShell>
    );
  }
  const superAdmin = ctx?.platformRole === "super_admin";
  const { switches, schools } = overview;
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Campus switches and agreements"
        description={
          superAdmin
            ? "Changes take effect straight away for every school and are written to the audit log."
            : "Only super admins change these. You can see the current state."
        }
      />
      <p className="mb-6">
        <Link href="/admin/campus/organisations" className="font-semibold text-blue-600">
          Manage organisations
        </Link>
      </p>

      <section aria-labelledby="switches" className="mb-10 max-w-3xl space-y-4">
        <h2 id="switches" className="font-display text-lg font-bold">
          Switches
        </h2>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-ink-200">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ink-900">Campus: {switches.posts ? "on" : "off"}</h3>
            <p className="text-sm text-ink-600">
              {switches.posts
                ? "Verified students see posts from their own school's live organisations."
                : "Students and organisers see “Campus isn't open yet”. Public links show nothing."}
            </p>
          </div>
          {superAdmin && (
            <ActionForm
              action={setCampusSwitch}
              fields={{ key: "campus.posts_enabled", on: switches.posts ? "0" : "1" }}
              label={switches.posts ? "Switch off" : "Switch on"}
              variant={switches.posts ? "secondary" : "primary"}
              confirm={
                switches.posts
                  ? "Switch Campus off? Students and organisers lose access straight away. Nothing is deleted."
                  : "Switch Campus on? Verified students of every listed school will see their school's live organisations and posts."
              }
            />
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-ink-200">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ink-900">Comments: {switches.comments ? "on" : "off"}</h3>
            <p className="text-sm text-ink-600">
              {switches.comments
                ? switches.posts
                  ? "Verified students can comment on posts. Organisers and Perqly support can hide comments."
                  : "On, but Campus is off, so nobody can comment yet."
                : "Nobody can comment. Comments already written stay hidden from view, not deleted."}
            </p>
          </div>
          {superAdmin && (
            <ActionForm
              action={setCampusSwitch}
              fields={{ key: "campus.comments_enabled", on: switches.comments ? "0" : "1" }}
              label={switches.comments ? "Switch off" : "Switch on"}
              confirm={switches.comments ? "Switch comments off?" : "Switch comments on for every school?"}
            />
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-white p-5 ring-1 ring-ink-200">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-ink-900">Phone and email notifications: {switches.push ? "on" : "off"}</h3>
            <p className="text-sm text-ink-600">
              {switches.push
                ? "New posts from followed organisations, emergency notices and event reminders also go to phones and inboxes, as each student's Campus setting allows."
                : "Campus notifications only appear in the app's notification list."}
            </p>
          </div>
          {superAdmin && (
            <ActionForm
              action={setCampusSwitch}
              fields={{ key: "campus.push_enabled", on: switches.push ? "0" : "1" }}
              label={switches.push ? "Switch off" : "Switch on"}
              confirm={
                switches.push
                  ? "Stop sending Campus notifications to phones and inboxes?"
                  : "Send Campus notifications to phones and inboxes? Students can turn them off in their settings."
              }
            />
          )}
        </div>
      </section>

      <section aria-labelledby="agreements" className="max-w-3xl space-y-4">
        <h2 id="agreements" className="font-display text-lg font-bold">
          School agreements
        </h2>
        <p className="text-sm text-ink-600">
          While a school&apos;s agreement is in force, its University administration organisation shows the University official badge and
          can post emergency notices. When it ends, the badge simply stops showing.
        </p>
        {schools.length === 0 ? (
          <p className="text-ink-600">No listed schools yet.</p>
        ) : (
          <ul className="space-y-3">
            {schools.map((s) => (
              <li key={s.institution_id} className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink-900">
                      {s.short_name}: {s.name}
                    </h3>
                    <p className="text-sm text-ink-600">
                      {s.signed_on
                        ? `${s.active ? "In force" : "Not in force"}. Signed ${formatDay(s.signed_on)}${
                            s.ends_on ? `, ends ${formatDay(s.ends_on)}` : ", no end date"
                          } by ${s.signed_by_name}. Copy: ${s.document_ref}.`
                        : "No agreement recorded."}{" "}
                      {s.organisations === 1 ? "1 organisation." : `${s.organisations} organisations.`}
                    </p>
                  </div>
                  {superAdmin && s.active && (
                    <ActionForm
                      action={endAgreement}
                      fields={{ institutionId: s.institution_id }}
                      label="End today"
                      confirm={`End ${s.short_name}'s agreement today? Its administration organisation loses the University official badge.`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {superAdmin && schools.length > 0 && (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
            <h3 className="mb-4 font-display text-lg font-bold">Record or update an agreement</h3>
            <AgreementForm schools={schools} />
          </div>
        )}
      </section>
    </AreaShell>
  );
}
