import type { Metadata } from "next";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";
import { StaffRoleForm } from "@/features/admin/components/platform-forms";
import { getStaff } from "@/features/admin/insights";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Staff", robots: { index: false, follow: false } };

const ROLE_LABEL: Record<string, string> = { reviewer: "Reviewer", support: "Support", admin: "Admin", super_admin: "Super admin" };

export default async function StaffPage() {
  const ctx = await getUserContext();
  if (!ctx || !canManagePlatform(ctx)) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly admins see staff." />
      </AreaShell>
    );
  }
  const staff = await getStaff();
  const superAdmin = ctx.platformRole === "super_admin";
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Staff"
        description="Everyone with a Perqly staff role. Staff must use two-step verification; every change is in the audit log."
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {staff.map((s) => (
            <li key={s.user_id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <span>
                <span className="block font-semibold text-ink-900">
                  {s.full_name ?? "No name"}
                  {s.user_id === ctx.userId ? " (you)" : ""}
                </span>
                <span className="text-sm text-ink-600">
                  {s.email}, since {formatDate(s.since)}
                  {s.granted_by_name ? `, added by ${s.granted_by_name}` : ""}
                </span>
              </span>
              <Badge variant={s.role === "super_admin" ? "orange" : "outline"}>{ROLE_LABEL[s.role] ?? s.role}</Badge>
            </li>
          ))}
        </ul>
        <Card>
          <CardTitle className="mb-4">Give or change a role</CardTitle>
          {superAdmin ? <StaffRoleForm /> : <p className="text-ink-700">Only super admins change staff roles.</p>}
        </Card>
      </div>
    </AreaShell>
  );
}
