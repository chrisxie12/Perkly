import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PushToggle } from "@/features/account/components/push-toggle";
import { getVapidPublicKey } from "@/lib/notifications/vapid";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { loginPath } from "@/lib/auth/paths";
import { getUserContext } from "@/lib/auth/session";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { markNotificationsRead } from "@/features/account/actions";
import { getNotifications } from "@/features/redemptions/queries";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

export default async function NotificationsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect(loginPath("/account/notifications"));
  const items = await getNotifications();
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <AreaShell area="account">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Notifications" description={unread === 0 ? "You're up to date." : `${unread} new.`} />
        <div className="flex flex-wrap gap-2">
          {unread > 0 && (
            <form action={markNotificationsRead}>
              <SubmitButton variant="secondary" size="sm">
                Mark all as read
              </SubmitButton>
            </form>
          )}
          <Link href="/account/notifications/settings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Settings aria-hidden /> Settings
          </Link>
        </div>
      </div>
      <div className="mb-6 empty:hidden">
        <PushToggle vapidPublicKey={getVapidPublicKey()} compact />
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="No notifications yet"
          description="Verification updates, new deals from businesses you saved, redemptions and account changes show up here."
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {items.map((n) => {
            const body = (
              <span className="block p-5">
                <span className="flex items-center gap-2 font-semibold text-ink-900">
                  {!n.read_at && <span className="size-2 rounded-full bg-orange-500" aria-label="New" />}
                  {n.title}
                </span>
                {n.body && <span className="mt-1 block text-ink-700">{n.body}</span>}
                <span className="mt-1 block text-sm text-ink-600">{when.format(new Date(n.created_at))}</span>
              </span>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link href={n.link} className="block hover:bg-ink-50">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AreaShell>
  );
}
