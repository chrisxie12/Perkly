import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { adminAppointMember, setOrganisationStatus } from "@/features/campus/actions";
import { getAdminOrganisations, getCampusEnabled, getListedInstitutions } from "@/features/campus/queries";
import { orgKindLabel } from "@/features/campus/schemas";
import { ActionForm } from "@/features/campus/components/action-form";
import { CreateOrganisationForm } from "@/features/campus/components/admin-forms";
import { MemberForm } from "@/features/campus/components/member-forms";
import { OrganisationBadge } from "@/features/campus/components/organisation-badge";

export const metadata: Metadata = { title: "Campus organisations" };

const STATUS = { draft: "Draft", verified: "Verified", suspended: "Suspended", archived: "Archived" } as Record<string, string>;
const ROLE = { owner: "Owner", admin: "Admin", editor: "Editor" } as Record<string, string>;

export default async function AdminCampusOrganisationsPage() {
  const [enabled, orgs, institutions] = await Promise.all([getCampusEnabled(), getAdminOrganisations(), getListedInstitutions()]);
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Campus organisations"
        description={
          enabled.posts
            ? "Campus is switched on. Students see verified organisations of their own school."
            : "Campus is switched off: students see nothing yet. You can prepare organisations now."
        }
      />
      <p className="mb-6">
        <Link href="/admin/campus/settings" className="font-semibold text-blue-600">
          Campus switches and school agreements
        </Link>
      </p>
      <section className="mb-10 max-w-3xl rounded-2xl bg-white p-5 ring-1 ring-ink-200" aria-labelledby="new-org">
        <h2 id="new-org" className="mb-4 font-display text-lg font-bold">
          New organisation
        </h2>
        <CreateOrganisationForm institutions={institutions} />
      </section>
      {orgs.length === 0 ? (
        <p className="text-ink-600">No organisations yet.</p>
      ) : (
        <ul className="space-y-4">
          {orgs.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white p-5 ring-1 ring-ink-200">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-bold">{o.name}</h3>
                  <p className="text-sm text-ink-600">
                    {o.school} · {orgKindLabel(o.kind)} · {STATUS[o.status] ?? o.status} · /{o.slug}
                  </p>
                  <OrganisationBadge badge={o.badge} className="mt-2" />
                  {o.status !== "archived" && o.owners === 0 && (
                    <p className="mt-2 text-sm font-semibold text-ink-900">No owner: appoint one below.</p>
                  )}
                </div>
                {o.status !== "archived" && (
                  <div className="flex flex-wrap gap-2">
                    {o.status !== "verified" && (
                      <ActionForm
                        action={setOrganisationStatus}
                        fields={{ organisationId: o.id, status: "verified" }}
                        label="Verify"
                        variant="primary"
                      />
                    )}
                    {o.status === "verified" && (
                      <ActionForm action={setOrganisationStatus} fields={{ organisationId: o.id, status: "suspended" }} label="Suspend" />
                    )}
                    <ActionForm
                      action={setOrganisationStatus}
                      fields={{ organisationId: o.id, status: "archived" }}
                      label="Archive"
                      confirm={`Archive ${o.name}? Its posts are removed for good and members lose access.`}
                    />
                  </div>
                )}
              </div>
              {o.members.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {o.members.map((m) => (
                    <li key={m.user_id} className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
                      <span className="font-medium text-ink-900">{m.name ?? "Member"}</span> · {ROLE[m.role] ?? m.role}
                      {m.title ? ` · ${m.title}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {o.status !== "archived" && (
                <details className="mt-4">
                  <summary className="cursor-pointer font-semibold text-blue-600">Appoint a member</summary>
                  <div className="mt-3">
                    <MemberForm
                      organisationId={o.id}
                      action={adminAppointMember}
                      roles={["owner", "admin", "editor"]}
                      emailHint={
                        ["faculty", "department", "administration"].includes(o.kind)
                          ? "Any Perqly account that isn't suspended."
                          : "A verified student of this school."
                      }
                    />
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
