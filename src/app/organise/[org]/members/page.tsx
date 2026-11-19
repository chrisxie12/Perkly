import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getCampusEnabled, getMembersForManager, getOrganisationForEditor } from "@/features/campus/queries";
import { removeOrganisationMember, setOrganisationMember } from "@/features/campus/actions";
import { CampusClosed, NotManaging } from "@/features/campus/components/campus-closed";
import { ActionForm } from "@/features/campus/components/action-form";
import { MemberForm } from "@/features/campus/components/member-forms";

export const metadata: Metadata = { title: "Members", robots: { index: false } };

const ROLE = { owner: "Owner", admin: "Admin", editor: "Editor" } as Record<string, string>;
const STAFF_RUN = ["faculty", "department", "administration"];

export default async function MembersPage({ params }: PageProps<"/organise/[org]/members">) {
  const enabled = await getCampusEnabled();
  if (!enabled.posts) return <CampusClosed area="organise" />;
  const org = await getOrganisationForEditor((await params).org);
  if (!org || !(org.my_role === "owner" || org.my_role === "admin")) return <NotManaging />;
  const members = (await getMembersForManager(org.id)) ?? [];
  const staffRun = STAFF_RUN.includes(org.kind);
  return (
    <AreaShell area="organise">
      <Link href={`/organise/${org.id}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> {org.name}
      </Link>
      <PageTitle
        title="Members"
        description="Owners and admins manage the page and members. Editors write and publish posts. Representatives' names show only to verified students of your school."
      />
      <ul className="mb-8 max-w-2xl divide-y divide-ink-200 rounded-2xl bg-white ring-1 ring-ink-200">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink-900">{m.name ?? "Member"}</span>
              <span className="block text-sm text-ink-600">
                {ROLE[m.role] ?? m.role}
                {m.title ? ` · ${m.title}` : ""}
              </span>
            </span>
            {!staffRun && (org.my_role === "owner" || m.role !== "owner") && (
              <ActionForm
                action={removeOrganisationMember}
                fields={{ organisationId: org.id, userId: m.user_id }}
                label="Remove"
                confirm={`Remove ${m.name ?? "this member"} from ${org.name}?`}
              />
            )}
          </li>
        ))}
      </ul>
      {staffRun ? (
        <p className="max-w-2xl rounded-xl bg-blue-50 p-4 text-ink-900">
          Perqly manages members of this organisation. Contact Perqly support to add or remove someone.
        </p>
      ) : (
        <section className="max-w-2xl" aria-labelledby="add">
          <h2 id="add" className="mb-3 font-display text-lg font-bold">
            Add a member
          </h2>
          <MemberForm
            organisationId={org.id}
            action={setOrganisationMember}
            roles={org.my_role === "owner" ? ["editor", "admin", "owner"] : ["editor", "admin"]}
            emailHint="They must be a verified student at your school."
          />
        </section>
      )}
    </AreaShell>
  );
}
