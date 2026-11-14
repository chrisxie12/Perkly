import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { AddTeamMemberForm } from "@/features/merchants/components/merchant-forms";
import { RemoveMemberButton } from "@/features/merchants/components/remove-member-button";
import { getActiveMembership, getBranches, getTeam } from "@/features/merchants/queries";
import { canManage, merchantNavFor } from "../merchant-nav";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

const ROLE_LABEL = { owner: "Owner", manager: "Manager", cashier: "Cashier" } as const;

export default async function MerchantTeamPage() {
  const [ctx, membership] = await Promise.all([getUserContext(), getActiveMembership()]);
  if (!membership) redirect("/merchant");
  if (!canManage(membership)) {
    return (
      <AreaShell area="Business" nav={merchantNavFor(membership)}>
        <PageTitle title="Team" description="Only owners and managers can see and change the team." />
      </AreaShell>
    );
  }
  const [team, branches] = await Promise.all([getTeam(membership.merchantId), getBranches(membership.merchantId)]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const isOwner = membership.role === "owner";

  return (
    <AreaShell area="Business" nav={merchantNavFor(membership)}>
      <PageTitle title="Team" description="People who can act for your business. Each person signs in with their own Perqly account." />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardTitle>Members</CardTitle>
          {team === null ? (
            <p className="mt-4 text-ink-700">Couldn&apos;t load the team. Refresh to try again.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-200">
              {team.map((member) => {
                const removable = member.role !== "owner" && (isOwner || member.role === "cashier") && member.user_id !== ctx?.userId;
                return (
                  <li key={member.member_id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink-900">
                        {member.full_name}
                        {member.user_id === ctx?.userId && <span className="ml-2 text-sm font-medium text-ink-600">You</span>}
                      </span>
                      {member.role === "cashier" && (
                        <span className="text-sm text-ink-600">
                          {member.branch_ids.map((id) => branchName.get(id) ?? "Removed branch").join(", ")}
                        </span>
                      )}
                    </span>
                    <Badge variant={member.role === "owner" ? "blue" : "outline"}>{ROLE_LABEL[member.role]}</Badge>
                    {removable && <RemoveMemberButton memberId={member.member_id} name={member.full_name} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-5">Add someone</CardTitle>
          {branches.length === 0 ? (
            <p className="text-ink-700">Add a branch first, so cashiers have somewhere to work.</p>
          ) : (
            <AddTeamMemberForm merchantId={membership.merchantId} branches={branches.filter((b) => b.is_active)} canAddManager={isOwner} />
          )}
        </Card>
      </div>
    </AreaShell>
  );
}
