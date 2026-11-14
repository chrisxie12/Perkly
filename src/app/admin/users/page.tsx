import type { Metadata } from "next";
import { Search, Users } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { DeletionForm, SuspensionForm } from "@/features/admin/components/user-forms";
import { findUsers, getOpenDeletionRequests } from "@/features/admin/insights";
import { formatDate } from "@/features/students/components/status-card";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform, canSupport } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Users", robots: { index: false, follow: false } };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const params = await searchParams;
  const ctx = await getUserContext();
  if (!ctx || !canSupport(ctx)) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly support and admins can look up accounts." />
      </AreaShell>
    );
  }
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const [users, requests] = await Promise.all([q.length >= 3 ? findUsers(q) : Promise.resolve([]), getOpenDeletionRequests()]);

  return (
    <AreaShell area="admin">
      <PageTitle title="Users" description="Find an account by email or name, suspend or restore it, and handle deletion requests." />
      {requests.length > 0 && canManagePlatform(ctx) && (
        <Card className="mb-8">
          <CardTitle>Deletion requests ({requests.length})</CardTitle>
          <p className="mt-1 text-sm text-ink-600">Follow docs/ACCOUNT_DELETION_RUNBOOK.md, then record the outcome here.</p>
          <ul className="mt-4 space-y-5">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl bg-ink-50 p-4">
                <p className="font-semibold text-ink-900">{r.profiles?.full_name ?? "Unnamed account"}</p>
                <p className="text-sm text-ink-600">
                  Asked {formatDate(r.created_at)}. Account ID {r.user_id}
                </p>
                {r.note && <p className="mt-2 text-ink-700">“{r.note}”</p>}
                <div className="mt-3 max-w-md">
                  <DeletionForm requestId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <form role="search" className="mb-6 flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">
          Email or name
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Email or name" className="flex-1" />
        <Button type="submit" variant="secondary" size="lg" aria-label="Search">
          <Search aria-hidden />
        </Button>
      </form>
      {q.length > 0 && q.length < 3 ? (
        <p className="text-ink-700">Type at least 3 characters.</p>
      ) : q && users.length === 0 ? (
        <EmptyState icon={<Users />} title="No matching accounts" description="Try the full email address." />
      ) : (
        <ul className="space-y-4">
          {users.map((u) => (
            <li key={u.user_id} className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-900">{u.full_name ?? "No name"}</span>
                {u.is_suspended && <Badge variant="orange">Suspended</Badge>}
                {u.platform_role && <Badge variant="outline">Perqly {u.platform_role.replace("_", " ")}</Badge>}
              </div>
              <p className="text-sm text-ink-600">
                {u.email}, joined {formatDate(u.created_at)}
                {u.institution ? `. ${u.institution} student, ${u.verification_status}` : ""}
                {u.business_roles > 0 ? `. Works for ${u.business_roles} business${u.business_roles === 1 ? "" : "es"}` : ""}
                {u.redemptions > 0 ? `. ${u.redemptions} redemption${u.redemptions === 1 ? "" : "s"}` : ""}
              </p>
              {u.is_suspended && u.suspended_reason && <p className="mt-2 text-ink-700">Reason: {u.suspended_reason}</p>}
              {canManagePlatform(ctx) && u.user_id !== ctx.userId && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-semibold text-blue-600">{u.is_suspended ? "Restore" : "Suspend"}</summary>
                  <div className="mt-3 max-w-md">
                    <SuspensionForm userId={u.user_id} suspended={u.is_suspended} />
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
