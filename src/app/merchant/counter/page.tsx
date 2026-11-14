import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScanLine } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Badge } from "@/components/ui/badge";
import { Label, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { getActiveMembership } from "@/features/merchants/queries";
import { discountLabel, money } from "@/features/offers/schemas";
import { confirmAtCounter, rejectAtCounter } from "@/features/redemptions/actions";
import { AutoRefresh } from "@/features/redemptions/components/auto-refresh";
import { getCounterSessions } from "@/features/redemptions/queries";
import { REJECT_REASONS, redemptionErrorMessage } from "@/features/redemptions/schemas";
import { merchantNavFor } from "../merchant-nav";

export const metadata: Metadata = { title: "Counter", robots: { index: false } };

const time = new Intl.DateTimeFormat("en-GH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Accra" });

export default async function CounterPage({ searchParams }: PageProps<"/merchant/counter">) {
  const [membership, query] = await Promise.all([getActiveMembership(), searchParams]);
  if (!membership || membership.status !== "approved") redirect("/merchant");
  const sessions = await getCounterSessions(membership.merchantId);
  const waiting = sessions.filter((s) => s.status === "awaiting_merchant");
  const others = sessions.filter((s) => s.status !== "awaiting_merchant");
  const error = typeof query.error === "string" ? query.error : undefined;
  const done =
    query.done === "confirmed"
      ? "Confirmed. The student now confirms on their phone."
      : query.done === "declined"
        ? "Declined. The student sees your reason."
        : null;

  return (
    <AreaShell area="Business" nav={merchantNavFor(membership)}>
      <AutoRefresh />
      <PageTitle
        title="Counter"
        description="Students who scanned your code appear here. Compare the name and pass code with their screen, then confirm."
      />
      {(error || done) && (
        <div
          role={error ? "alert" : "status"}
          className={`mb-6 rounded-xl p-4 font-medium text-ink-900 ring-1 ${error ? "bg-orange-50 ring-orange-200" : "bg-green-50 ring-green-200"}`}
        >
          {error ? redemptionErrorMessage(error) : done}
        </div>
      )}
      {waiting.length === 0 ? (
        <EmptyState
          icon={<ScanLine />}
          title="No one waiting"
          description="When a student scans your Perqly code and picks what they bought, they appear here. This page updates by itself."
        />
      ) : (
        <ul className="space-y-4">
          {waiting.map((s) => (
            <li key={s.session_id} className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-display text-2xl font-extrabold text-ink-900">{s.student_first_name}</p>
                  <p className="text-ink-700">
                    {s.institution}, {s.branch_name}
                  </p>
                  {s.location_signal === "far" && <Badge variant="orange">Phone reports it&apos;s far from this branch</Badge>}
                </div>
                <div className="rounded-xl bg-ink-100 px-4 py-2 text-center">
                  <p className="text-xs font-semibold text-ink-600">Pass code</p>
                  <p className="font-display text-3xl font-extrabold tracking-widest text-ink-900 tabular-nums">{s.pass_code}</p>
                </div>
              </div>
              <dl className="mt-4 grid gap-2 text-ink-700 sm:grid-cols-3">
                <div>
                  <dt className="text-sm">Item</dt>
                  <dd className="font-semibold text-ink-900">{s.item_name}</dd>
                </div>
                <div>
                  <dt className="text-sm">Regular price, discount</dt>
                  <dd className="font-semibold text-ink-900">
                    {money(s.regular_price)}, −{money(s.discount_amount)}
                    {s.discount_type ? ` (${discountLabel(s.discount_type, s.discount_value ?? 0)})` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm">Student pays you</dt>
                  <dd className="font-display text-2xl font-extrabold text-ink-900">{money(s.final_price)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-ink-600">
                {s.public_ref}, times out at {time.format(new Date(s.expires_at))}
              </p>
              <div className="mt-4 flex flex-wrap items-start gap-3">
                <form action={confirmAtCounter}>
                  <input type="hidden" name="sessionId" value={s.session_id} />
                  <input type="hidden" name="expectedFinalPrice" value={String(s.final_price)} />
                  <SubmitButton>Confirm discount</SubmitButton>
                </form>
                <details className="min-w-64 flex-1">
                  <summary className="cursor-pointer py-2 font-semibold text-blue-600">Decline</summary>
                  <form action={rejectAtCounter} className="mt-2 space-y-3">
                    <input type="hidden" name="sessionId" value={s.session_id} />
                    <fieldset className="space-y-2">
                      <legend className="sr-only">Reason</legend>
                      {Object.entries(REJECT_REASONS).map(([value, label]) => (
                        <label key={value} className="flex items-center gap-3 text-ink-900">
                          <input type="radio" name="reason" value={value} required className="size-4 accent-blue-500" /> {label}
                        </label>
                      ))}
                    </fieldset>
                    <div>
                      <Label htmlFor={`note-${s.session_id}`}>Note (needed for “Something else”)</Label>
                      <Textarea id={`note-${s.session_id}`} name="note" maxLength={300} />
                    </div>
                    <SubmitButton variant="secondary" size="sm">
                      Decline redemption
                    </SubmitButton>
                  </form>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <section aria-labelledby="recent" className="mt-10">
          <h2 id="recent" className="mb-3 font-display text-xl font-bold">
            Confirmed, waiting for the student
          </h2>
          <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white ring-1 ring-ink-200/70">
            {others.map((s) => (
              <li key={s.session_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-semibold text-ink-900">{s.item_name}</span>
                  <span className="block text-sm text-ink-600">
                    {s.public_ref}, {s.branch_name}
                    {s.confirmed_by_me ? ", confirmed by you" : ""}
                  </span>
                </span>
                <Badge variant={s.status === "expired" ? "outline" : "orange"}>
                  {s.status === "expired" ? "Confirmed, student didn't finish" : "Student confirming"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AreaShell>
  );
}
