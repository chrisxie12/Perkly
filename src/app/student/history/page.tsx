import type { Metadata } from "next";
import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { money } from "@/features/offers/schemas";
import { getMyHistory, getSavingsSummary } from "@/features/redemptions/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { MerchantAvatar } from "@/features/students/app/bits";
import { ShareSavings } from "@/features/students/app/share-savings";

export const metadata: Metadata = { title: "Your savings", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

export default async function SavingsPage() {
  const [summary, history, status] = await Promise.all([getSavingsSummary(), getMyHistory(), getMyStudentStatus()]);
  const max = Math.max(1, ...summary.by_month.map((m) => Number(m.saved)));
  const school = status.profile?.institution_short_name;
  const total = Number(summary.total_saved);

  return (
    <AreaShell area="student">
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <div className="flex items-center px-4 py-1 sm:px-0">
          <h1 className="flex-1 font-display text-xl font-bold">Your savings</h1>
          {total > 0 && <ShareSavings text={`I've saved ${money(total)} with Perqly${school ? ` as a ${school} student` : ""}.`} />}
        </div>
        <section className="mx-4 mt-1 rounded-3xl bg-ink-900 px-5 pt-5 pb-4 text-white sm:mx-0" aria-label="Total saved">
          <span className="text-sm text-white/70">
            Saved with Perqly
            {summary.first_at
              ? ` since ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(summary.first_at))}`
              : ""}
          </span>
          <p className="font-display text-5xl leading-tight font-extrabold tracking-tight tabular-nums">{money(total)}</p>
          {summary.by_month.length > 0 && (
            <div
              className="mt-4 flex h-28 items-end gap-3"
              role="img"
              aria-label={`Saved by month: ${summary.by_month.map((m) => `${monthName(m.month)} ${money(m.saved)}`).join(", ")}`}
            >
              {summary.by_month.map((m, i) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <em className="text-[0.6875rem] font-bold not-italic">{Number(m.saved) > 0 ? `₵${Math.round(Number(m.saved))}` : ""}</em>
                  <div
                    className={`w-full rounded-t-lg rounded-b ${i === summary.by_month.length - 1 ? "bg-[#F5B700]" : "bg-white/20"}`}
                    style={{ height: `${Math.max(6, (Number(m.saved) / max) * 70)}px` }}
                  />
                  <span className="text-xs font-semibold text-white/70">{monthName(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="mx-4 mt-3 grid grid-cols-3 gap-2.5 sm:mx-0">
          {[
            [String(summary.redemptions), summary.redemptions === 1 ? "Visit" : "Visits"],
            [String(summary.shops), summary.shops === 1 ? "Shop" : "Shops"],
            [
              summary.best ? `GH₵${Number(summary.best) % 1 ? Number(summary.best).toFixed(2) : Number(summary.best)}` : "None yet",
              "Best saving",
            ],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white p-3 ring-1 ring-ink-200/70">
              <b className="block font-display text-lg leading-tight sm:text-xl">{v}</b>
              <span className="text-xs font-semibold text-ink-600">{l}</span>
            </div>
          ))}
        </div>
        <h2 className="px-4 pt-6 pb-2 font-display text-lg font-bold sm:px-0">Recent</h2>
        {history.redemptions.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <PiggyBank className="size-7" aria-hidden />
            </span>
            <h3 className="font-display text-xl font-bold">No discounts yet</h3>
            <p className="mt-1 max-w-[30ch] text-[0.9375rem] text-ink-600">
              Scan the Perqly code at a shop after you&apos;re served, and what you save shows up here.
            </p>
            <Link href="/student" className={`${buttonVariants({ size: "sm" })} mt-4`}>
              Browse deals
            </Link>
          </div>
        ) : (
          <ul className="mx-4 mb-6 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70 sm:mx-0">
            {history.redemptions.map((r) => (
              <li key={r.redemption_id} className="flex items-center gap-3 border-t border-ink-200 px-3.5 py-3 first:border-0">
                <MerchantAvatar name={r.merchant_name} category={null} size="sm" />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[0.9375rem]">{r.item_name}</b>
                  <span className="text-[0.8125rem] text-ink-600">
                    {r.merchant_name}, {when.format(new Date(r.redeemed_at))}
                  </span>
                </div>
                {r.voided ? (
                  <span className="text-[0.8125rem] font-semibold text-ink-600">Cancelled by support</span>
                ) : (
                  <span className="font-bold text-emerald-700 tabular-nums">+{money(r.discount_amount)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AreaShell>
  );
}
