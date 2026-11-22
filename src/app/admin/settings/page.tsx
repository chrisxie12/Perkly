import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getUserContext } from "@/lib/auth/session";
import { canManagePlatform } from "@/lib/auth/roles";
import { ActionForm } from "@/features/campus/components/action-form";
import { getFeatureSwitches } from "@/features/platform/switches";
import { setFeatureSwitch } from "@/features/platform/actions";
import { SettingForm } from "@/features/admin/components/platform-forms";
import { getPlatformSettings } from "@/features/admin/insights";
import { formatDate } from "@/features/students/components/status-card";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { BillingSettingsForm } from "@/features/billing/components/admin-billing-forms";
import { formatGhs } from "@/features/billing/queries";
import { createClient } from "@/lib/supabase/server";

async function getBillingSettings() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_get_billing_settings");
  return (data ?? null) as { enabled: boolean; monthly_fee_pesewas: number; trial_days: number; grace_days: number } | null;
}

export const metadata: Metadata = { title: "Platform settings", robots: { index: false, follow: false } };

const LABELS: Record<string, string> = {
  "redemption.select_window_seconds": "Seconds a student has to pick an item after scanning",
  "redemption.confirm_window_seconds": "Seconds to confirm after picking an item",
  "redemption.max_sessions_per_hour": "Redemptions a student can start per hour",
  "redemption.max_selects_per_session": "Times a student can change item in one redemption",
  "redemption.merchant_actions_per_minute": "Confirms or declines per cashier per minute",
  "redemption.payment_records_per_hour": "Payment notes per staff member per hour",
  "redemption.payment_record_days": "Days a business can record how a student paid",
  "redemption.near_metres": "Metres from a branch that count as near",
  "qr.max_scans_per_minute": "Scans per student per minute",
  "qr.max_short_code_attempts_per_10_min": "Typed codes per student per 10 minutes",
  "qr.max_reissues_per_day": "New QR codes per branch per day",
  "booking.max_open_per_student": "Open bookings per student (bookings aren't built yet)",
  "verification.otp_max_per_hour": "School-email codes per student per hour",
  "verification.document_retention_days": "Days verification photos are kept after a decision",
  "campus.posts_per_org_per_day": "Campus posts each organisation can publish per day",
  "campus.comments_per_student_per_hour": "Campus comments each student can write per hour",
  "campus.reports_per_user_per_day": "Campus reports each person can send per day",
};

export default async function SettingsPage() {
  const ctx = await getUserContext();
  if (!ctx || !canManagePlatform(ctx)) {
    return (
      <AreaShell area="admin">
        <PageTitle title="Not available" description="Only Perqly admins see platform settings." />
      </AreaShell>
    );
  }
  const [settings, billing, switches] = await Promise.all([getPlatformSettings(), getBillingSettings(), getFeatureSwitches()]);
  const pilot = [
    {
      key: "pilot.friends_enabled",
      name: "Friends",
      on: switches.friends,
      onText: "Verified students can find classmates, send friend requests and chat with friends.",
      offText: "Hidden from students: no Friends page, no friend chats in Chats. Nothing is deleted.",
    },
    {
      key: "pilot.bookings_enabled",
      name: "Bookings",
      on: switches.bookings,
      onText: "Students can book times at businesses that set booking hours.",
      offText: "Hidden from students and businesses. Nothing is deleted.",
    },
  ];
  const superAdmin = ctx.platformRole === "super_admin";
  return (
    <AreaShell area="admin">
      <PageTitle
        title="Settings"
        description={
          superAdmin
            ? "Limits and time windows. Changes take effect immediately and are logged."
            : "Limits and time windows. Only super admins change them."
        }
      />
      <p className="mb-6 text-sm text-ink-600">
        Campus is switched on and off, and school agreements are recorded, on{" "}
        <Link href="/admin/campus/settings" className="font-semibold text-blue-600">
          Campus switches and agreements
        </Link>
        .
      </p>
      <Card className="mb-6">
        <CardTitle>Pilot features</CardTitle>
        <CardDescription>Off keeps the GCTU pilot to deals and redemption. Campus has its own switch on the Campus page.</CardDescription>
        <div className="mt-4 space-y-3">
          {pilot.map((p) => (
            <div key={p.key} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-ink-50 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-900">
                  {p.name}: {p.on ? "on" : "off"}
                </p>
                <p className="text-sm text-ink-600">{p.on ? p.onText : p.offText}</p>
              </div>
              {superAdmin && (
                <ActionForm
                  action={setFeatureSwitch}
                  fields={{ key: p.key, on: p.on ? "0" : "1" }}
                  label={p.on ? "Switch off" : "Switch on"}
                  variant={p.on ? "secondary" : "primary"}
                  confirm={`Switch ${p.name} ${p.on ? "off" : "on"}? It changes for everyone straight away.`}
                />
              )}
            </div>
          ))}
        </div>
      </Card>
      {billing && (
        <Card className="mb-6">
          <CardTitle>Business billing</CardTitle>
          <CardDescription>
            {billing.enabled
              ? `On: ${formatGhs(billing.monthly_fee_pesewas)} a month, first ${billing.trial_days} days free, deals pause ${billing.grace_days} days after a missed payment.`
              : "Off: businesses use Perqly free (the pilot, D9)."}
          </CardDescription>
          {superAdmin && (
            <div className="mt-5">
              <BillingSettingsForm
                enabled={billing.enabled}
                feeGhs={billing.monthly_fee_pesewas / 100}
                trialDays={billing.trial_days}
                graceDays={billing.grace_days}
              />
            </div>
          )}
        </Card>
      )}
      <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
        {settings.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <span className="min-w-0">
              <span className="block font-semibold text-ink-900">{LABELS[s.key] ?? s.key}</span>
              <span className="font-mono text-xs text-ink-600">
                {s.key}, changed {formatDate(s.updated_at)}
              </span>
            </span>
            {superAdmin ? (
              <SettingForm settingKey={s.key} value={s.value} />
            ) : (
              <span className="font-display text-xl font-bold text-ink-900">{s.value}</span>
            )}
          </li>
        ))}
      </ul>
    </AreaShell>
  );
}
