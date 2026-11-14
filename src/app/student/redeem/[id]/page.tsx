import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { discountLabel, limitLabel, money } from "@/features/offers/schemas";
import { cancelSession, confirmAsStudent, selectItem } from "@/features/redemptions/actions";
import { AutoRefresh } from "@/features/redemptions/components/auto-refresh";
import { LivePass } from "@/features/redemptions/components/live-pass";
import { getRedemptionSession, type RedemptionSession } from "@/features/redemptions/queries";
import { REJECT_REASONS, payLine, redemptionErrorMessage } from "@/features/redemptions/schemas";

export const metadata: Metadata = { title: "Redeem", robots: { index: false } };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const timeFormat = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

function Amounts({ s }: { s: RedemptionSession }) {
  return (
    <dl className="divide-y divide-ink-200">
      <div className="flex justify-between gap-4 py-3">
        <dt className="text-ink-700">{s.item_name}</dt>
        <dd className="font-medium text-ink-900">{money(s.regular_price)}</dd>
      </div>
      <div className="flex justify-between gap-4 py-3">
        <dt className="text-ink-700">
          Student discount{s.discount_type ? `, ${discountLabel(s.discount_type, s.discount_value ?? 0)}` : ""}
        </dt>
        <dd className="font-medium text-success">−{money(s.discount_amount)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 py-3">
        <dt className="font-semibold text-ink-900">Amount to pay the business</dt>
        <dd className="font-display text-3xl font-extrabold text-ink-900">{money(s.final_price)}</dd>
      </div>
    </dl>
  );
}

function CancelButton({ id, label = "Cancel" }: { id: string; label?: string }) {
  return (
    <form action={cancelSession}>
      <input type="hidden" name="sessionId" value={id} />
      <SubmitButton variant="ghost">{label}</SubmitButton>
    </form>
  );
}

function OfferChoices({ s }: { s: RedemptionSession }) {
  return (
    <ul className="space-y-3">
      {s.offers.map((o) => (
        <li key={o.offer_id} className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">{o.title}</p>
              <p className="text-sm text-ink-600">
                {discountLabel(o.discount_type, o.discount_value)}: {money(o.final_price)} instead of {money(o.regular_price)}
              </p>
              <p className="mt-1 text-sm text-ink-600">{o.conditions}</p>
            </div>
            {o.uses_left > 0 ? (
              <form action={selectItem}>
                <input type="hidden" name="sessionId" value={s.id} />
                <input type="hidden" name="offerId" value={o.offer_id} />
                <SubmitButton size="sm" variant={s.offer_id === o.offer_id ? "secondary" : "primary"}>
                  {s.offer_id === o.offer_id ? "Selected" : "I bought this"}
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm font-medium text-ink-700">
                Used: {limitLabel(o.per_student_limit, o.per_student_period).toLowerCase()}
                {o.resets_at ? `. Resets ${timeFormat.format(new Date(o.resets_at))}` : ""}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function RedeemPage({ params, searchParams }: PageProps<"/student/redeem/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await getRedemptionSession(id);
  if (!s) notFound();
  const error = str(query.error);
  const errorText = error
    ? redemptionErrorMessage(error, { limit: Number(query.limit) || undefined, period: str(query.period), resets_at: str(query.resets) })
    : null;
  const live = s.status === "open" || s.status === "awaiting_merchant" || s.status === "awaiting_student";

  return (
    <AreaShell area="student">
      {live && <AutoRefresh filter={`id=eq.${s.id}`} />}
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <p className="font-semibold text-blue-700">{s.branch_name}</p>
          <h1 className="font-display text-display-md font-extrabold">{s.merchant_name}</h1>
        </div>
        {errorText && (
          <div role="alert" className="rounded-xl bg-orange-50 p-4 font-medium text-ink-900 ring-1 ring-orange-200">
            {errorText}
          </div>
        )}

        {s.status === "open" && (
          <section aria-labelledby="choose" className="space-y-4">
            <h2 id="choose" className="font-display text-xl font-bold">
              What did you buy?
            </h2>
            <OfferChoices s={s} />
            <CancelButton id={s.id} />
          </section>
        )}

        {s.status === "awaiting_merchant" && (
          <>
            <LivePass
              firstName={s.first_name ?? "Student"}
              institution={s.institution}
              passCode={s.pass_code}
              publicRef={s.public_ref}
              expiresAt={s.expires_at}
            />
            <Card>
              <Amounts s={s} />
              <p className="mt-4 flex items-center gap-2 font-semibold text-ink-900" role="status">
                <Clock className="size-5 text-orange-500" aria-hidden /> Waiting for the cashier to confirm. Show them this screen.
              </p>
              <button type="button" disabled className="mt-4 w-full rounded-xl bg-ink-100 px-4 py-3 font-semibold text-ink-600">
                Waiting for the merchant to confirm
              </button>
            </Card>
            <details className="rounded-xl bg-white p-4 ring-1 ring-ink-200">
              <summary className="cursor-pointer font-semibold text-blue-600">Picked the wrong item?</summary>
              <div className="mt-4">
                <OfferChoices s={s} />
              </div>
            </details>
            <CancelButton id={s.id} />
          </>
        )}

        {s.status === "awaiting_student" && s.final_price !== null && s.item_name && (
          <>
            <LivePass
              firstName={s.first_name ?? "Student"}
              institution={s.institution}
              passCode={null}
              publicRef={s.public_ref}
              expiresAt={s.expires_at}
            />
            <Card>
              <p className="flex items-center gap-2 font-semibold text-success">
                <CheckCircle2 className="size-5" aria-hidden /> The cashier confirmed.
              </p>
              <Amounts s={s} />
              <p className="mt-2 font-semibold text-ink-900">{payLine(s.final_price, s.item_name)}</p>
              <form action={confirmAsStudent} className="mt-4">
                <input type="hidden" name="sessionId" value={s.id} />
                <SubmitButton size="lg" className="w-full">
                  Confirm
                </SubmitButton>
              </form>
            </Card>
            <CancelButton id={s.id} label="Cancel, I'm not buying this" />
          </>
        )}

        {s.status === "completed" && (
          <Card>
            <p className="flex items-center gap-2 font-display text-xl font-bold text-success">
              <CheckCircle2 className="size-6" aria-hidden /> Discount redeemed
            </p>
            <p className="mt-1 text-ink-700">Pay the business directly. Perqly doesn&apos;t take payments.</p>
            <div className="mt-4">
              <Amounts s={s} />
            </div>
            <p className="mt-3 text-sm text-ink-600">
              {s.public_ref}
              {s.completed_at ? `, ${timeFormat.format(new Date(s.completed_at))}` : ""}
            </p>
            <Link href="/student/history" className="mt-4 inline-block font-semibold text-blue-600 underline underline-offset-2">
              See your savings
            </Link>
          </Card>
        )}

        {s.status === "rejected" && (
          <Card>
            <p className="flex items-center gap-2 font-display text-xl font-bold text-ink-900">
              <XCircle className="size-6 text-orange-500" aria-hidden /> {s.merchant_name} declined this redemption
            </p>
            <p className="mt-2 text-ink-700">
              {s.rejected_reason ? REJECT_REASONS[s.rejected_reason] : "No reason given"}
              {s.rejected_note ? `: ${s.rejected_note}` : "."}
            </p>
            <p className="mt-3 text-sm text-ink-600">Think this is wrong? Email support with the reference {s.public_ref}.</p>
          </Card>
        )}

        {(s.status === "cancelled" || s.status === "expired") && (
          <Card>
            <CardTitle>{s.status === "cancelled" ? "Cancelled" : "This redemption timed out"}</CardTitle>
            <p className="mt-2 text-ink-700">
              {s.status === "cancelled" ? "Nothing was recorded." : redemptionErrorMessage("session_expired")}
            </p>
            <Link href="/student/scan" className="mt-4 inline-block font-semibold text-blue-600 underline underline-offset-2">
              Scan again
            </Link>
          </Card>
        )}
      </div>
    </AreaShell>
  );
}
