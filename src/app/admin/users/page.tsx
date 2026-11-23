import type { Metadata } from "next";
import { Search, Users } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { blockerLabel, deletionDaysLeft, deletionDueDate } from "@/features/account/deletion";
import { CompleteDeletionForm, DeclineDeletionForm, OpenDeletionRequestForm, SuspensionForm } from "@/features/admin/components/user-forms";
import { findUsers, getDeletionPreview, getOpenDeletionRequests, type DeletionPreview } from "@/features/admin/insights";
import { formatDate } from "@/features/students/components/status-card";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform, canSupport } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Users", robots: { index: false, follow: false } };

const DELETED_LABELS: Record<string, string> = {
  shop_chats: "shop chats",
  friend_chats: "friend chats",
  friends: "friends",
  ratings: "ratings",
  saved_businesses: "saved businesses",
  event_tickets: "unused event tickets",
  event_rsvps: "event RSVPs",
  campus_comments: "Campus comments",
  push_devices: "devices with notifications",
  files: "photos and documents",
};
const KEPT_LABELS: Record<string, string> = {
  redemptions: "discounts used",
  bookings: "bookings",
  campus_posts: "Campus posts (stay with their club)",
};

function summarise(counts: Record<string, number>, labels: Record<string, string>) {
  const parts = Object.entries(labels)
    .map(([key, label]) => [counts[key] ?? 0, label] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  return parts.length > 0 ? parts.join(", ") : "nothing";
}

function DeletionPreviewText({ preview }: { preview: DeletionPreview | null }) {
  if (!preview) return <p className="mt-2 text-sm text-ink-600">Turn on two-step verification to see what will be deleted.</p>;
  return (
    <div className="mt-2 space-y-1 text-sm text-ink-700">
      <p>
        <span className="font-semibold text-ink-900">Deletes:</span> their name, phone, student record and sign-in, plus{" "}
        {summarise(preview.deleted, DELETED_LABELS)}.
      </p>
      <p>
        <span className="font-semibold text-ink-900">Keeps without their name:</span> {summarise(preview.kept, KEPT_LABELS)}.
      </p>
      {preview.blockers.map((code) => (
        <p key={code} className="font-semibold text-orange-800">
          {blockerLabel(code)}
        </p>
      ))}
    </div>
  );
}

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
  const admin = canManagePlatform(ctx);
  const previews = admin ? await Promise.all(requests.map((r) => getDeletionPreview(r.id))) : [];
  const overdue = requests.filter((r) => deletionDaysLeft(r.created_at) <= 0).length;

  return (
    <AreaShell area="admin">
      <PageTitle title="Users" description="Find an account by email or name, suspend or restore it, and handle deletion requests." />
      {requests.length > 0 && admin && (
        <Card className="mb-8">
          <CardTitle>
            Deletion requests ({requests.length}){overdue > 0 ? `, ${overdue} overdue` : ""}
          </CardTitle>
          <p className="mt-1 text-sm text-ink-600">Each must be done within 30 days of the request. Oldest first.</p>
          <ul className="mt-4 space-y-5">
            {requests.map((r, i) => {
              const daysLeft = deletionDaysLeft(r.created_at);
              const preview = previews[i] ?? null;
              const blocked = Boolean(preview && preview.blockers.length > 0);
              return (
                <li key={r.id} className="rounded-xl bg-ink-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{r.profiles?.full_name ?? "Unnamed account"}</span>
                    {daysLeft <= 0 ? (
                      <Badge variant="orange">Overdue</Badge>
                    ) : (
                      <Badge variant={daysLeft <= 10 ? "orange" : "outline"}>
                        {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                      </Badge>
                    )}
                    {r.source === "email" && <Badge variant="outline">By email</Badge>}
                  </div>
                  <p className="text-sm text-ink-600">
                    Asked {formatDate(r.created_at)}, due {formatDate(deletionDueDate(r.created_at).toISOString())}. Account ID {r.user_id}
                  </p>
                  {r.note && <p className="mt-2 text-ink-700">“{r.note}”</p>}
                  <DeletionPreviewText preview={preview} />
                  <div className="mt-4 grid max-w-3xl gap-6 md:grid-cols-2">
                    {preview && !blocked && <CompleteDeletionForm requestId={r.id} />}
                    <DeclineDeletionForm requestId={r.id} />
                  </div>
                </li>
              );
            })}
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
              {admin && u.user_id !== ctx.userId && (
                <>
                  <details className="mt-3">
                    <summary className="cursor-pointer font-semibold text-blue-600">{u.is_suspended ? "Restore" : "Suspend"}</summary>
                    <div className="mt-3 max-w-md">
                      <SuspensionForm userId={u.user_id} suspended={u.is_suspended} />
                    </div>
                  </details>
                  {!requests.some((r) => r.user_id === u.user_id) && (
                    <details className="mt-3">
                      <summary className="cursor-pointer font-semibold text-blue-600">They emailed to ask for deletion</summary>
                      <div className="mt-3 max-w-md">
                        <OpenDeletionRequestForm userId={u.user_id} />
                      </div>
                    </details>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
