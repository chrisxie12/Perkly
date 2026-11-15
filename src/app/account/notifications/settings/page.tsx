import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { NotificationSettingsForm, type CategorySetting } from "@/features/account/components/notification-settings-form";
import { PushToggle } from "@/features/account/components/push-toggle";
import { loginPath } from "@/lib/auth/paths";
import { areasFor } from "@/lib/auth/roles";
import { getUserContext } from "@/lib/auth/session";
import { hasSupabaseEnv } from "@/lib/env";
import { getVapidPublicKey } from "@/lib/notifications/vapid";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

const CATEGORY_TEXT: Record<string, { label: string; description: string }> = {
  verification: { label: "Your verification", description: "Approved, needs changes, ending soon, expired." },
  deals: { label: "New deals", description: "When a business you saved posts a new deal." },
  redemptions: { label: "Redemptions", description: "When a discount goes through or is cancelled." },
  business: { label: "Your business", description: "Approval, deals approved or taken down, team changes." },
  review: { label: "Things to review", description: "New students, businesses, deals and school requests." },
  account: { label: "Your account", description: "Roles you're given and school requests you sent." },
};

export default async function NotificationSettingsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect(loginPath("/account/notifications/settings"));
  const areas = areasFor(ctx);

  // Only the kinds of notification this person can actually get.
  const relevant = new Set(["account", "verification", "deals", "redemptions"]);
  if (areas.includes("merchant")) relevant.add("business");
  if (areas.includes("institution") || areas.includes("admin")) relevant.add("review");

  let prefs: { category: string; push: boolean; email: boolean }[] = [];
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_my_notification_preferences");
    prefs = (data ?? []) as typeof prefs;
  }
  const order = ["verification", "deals", "redemptions", "business", "review", "account"];
  const settings: CategorySetting[] = order
    .filter((c) => relevant.has(c))
    .map((c) => {
      const p = prefs.find((x) => x.category === c);
      return { category: c, ...CATEGORY_TEXT[c], push: p?.push ?? true, email: p?.email ?? c === "verification" };
    });

  return (
    <AreaShell area="account">
      <Link href="/account/notifications" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> Notifications
      </Link>
      <PageTitle title="Notification settings" description="Choose what reaches your phone and your inbox." />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardTitle>This device</CardTitle>
          <CardDescription>Phone notifications are set per device. Turn them on on each phone you use.</CardDescription>
          <div className="mt-5">
            <PushToggle vapidPublicKey={getVapidPublicKey()} />
          </div>
        </Card>
        <NotificationSettingsForm settings={settings} />
      </div>
    </AreaShell>
  );
}
