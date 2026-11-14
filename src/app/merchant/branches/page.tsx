import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { BranchForm } from "@/features/merchants/components/merchant-forms";
import { getActiveMembership, getBranches, getBranchHours, getMerchant } from "@/features/merchants/queries";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Branches", robots: { index: false } };

export default async function MerchantBranchesPage({ searchParams }: PageProps<"/merchant/branches">) {
  const [membership, query] = await Promise.all([getActiveMembership(), searchParams]);
  if (!membership) redirect("/merchant");
  const [merchant, branches] = await Promise.all([getMerchant(membership.merchantId), getBranches(membership.merchantId)]);
  if (!merchant) redirect("/merchant");
  const hours = await getBranchHours(branches.map((b) => b.id));
  const readOnly = !canManage(membership) || merchant.status === "suspended";

  return (
    <AreaShell area="merchant">
      <PageTitle
        title="Branches"
        description="Each branch gets its own QR code for the counter. Closed branches are hidden from students."
      />
      {query.added && (
        <p role="status" className="mb-6 rounded-lg bg-green-50 px-4 py-3 font-medium text-success">
          Branch added.
        </p>
      )}
      <div className="space-y-6">
        {branches.map((branch) => (
          <Card key={branch.id}>
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <CardTitle>{branch.name}</CardTitle>
                  <span className="mt-1 block text-sm text-ink-600">
                    {[branch.address_line, branch.area, branch.city].filter(Boolean).join(", ")}
                  </span>
                  <span className="block text-sm text-ink-600">{branch.opening_hours ?? "No opening hours set"}</span>
                </span>
                <span className="flex items-center gap-2">
                  {!branch.is_active && <Badge variant="outline">Closed</Badge>}
                  <span className="text-sm font-semibold text-blue-600">{readOnly ? "View" : "Edit"}</span>
                </span>
              </summary>
              <div className="mt-6 border-t border-ink-200 pt-6">
                <BranchForm merchantId={merchant.id} branch={branch} hours={hours.get(branch.id)} readOnly={readOnly} />
              </div>
            </details>
          </Card>
        ))}
        {!readOnly && (
          <Card>
            <CardTitle className="mb-5">{branches.length === 0 ? "Add your first branch" : "Add a branch"}</CardTitle>
            <BranchForm merchantId={merchant.id} />
          </Card>
        )}
      </div>
    </AreaShell>
  );
}
