import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Clock, ScanLine, TimerOff, X } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { limitLabel, money } from "@/features/offers/schemas";
import { cancelSession, confirmAsStudent, selectItem } from "@/features/redemptions/actions";
import { AutoRefresh } from "@/features/redemptions/components/auto-refresh";
import { LivePass } from "@/features/redemptions/components/live-pass";
import { getRedemptionSession } from "@/features/redemptions/queries";
import { REJECT_REASONS, redemptionErrorMessage } from "@/features/redemptions/schemas";
import { MerchantAvatar } from "@/features/students/app/bits";

export const metadata: Metadata = { title: "Redeem", robots: { index: false } };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl bg-white p-3 text-[0.9375rem] font-medium text-ink-900 ring-1 ring-orange-200">
      {text}
    </p>
  );
}

function CancelForm({ id, label, light }: { id: string; label: string; light?: boolean }) {
  return (
    <form action={cancelSession} className="mt-auto flex justify-center pt-3">
      <input type="hidden" name="sessionId" value={id} />
      <SubmitButton variant="ghost" className={light ? "text-white hover:bg-white/10" : undefined}>
        {label}
      </SubmitButton>
    </form>
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
  const place = `${s.merchant_name}, ${s.branch_name}`;
  const refresh = live ? <AutoRefresh filter={`id=eq.${s.id}`} /> : null;

  // 1. Pick what you bought ------------------------------------------------------------
  if (s.status === "open") {
    const first = s.offers.find((o) => o.uses_left > 0)?.offer_id;
    return (
      <AreaShell area="student" immersive>
        {refresh}
        <div className="flex min-h-dvh flex-col bg-ink-900/60">
          <div className="flex-1" />
          <form action={selectItem} className="pb-safe rounded-t-3xl bg-white px-5 pt-2.5 pb-6">
            <div className="mx-auto mb-3.5 h-1.5 w-10 rounded-full bg-ink-300" aria-hidden />
            <input type="hidden" name="sessionId" value={s.id} />
            <div className="mb-4 flex items-center gap-3">
              <MerchantAvatar name={s.merchant_name} category={null} />
              <div>
                <h1 className="font-display text-[1.375rem] leading-tight font-bold">You&apos;re at {s.merchant_name}</h1>
                <p className="text-[0.9375rem] text-ink-600">{s.branch_name} branch. Pick what you bought.</p>
              </div>
            </div>
            <ErrorNote text={errorText} />
            <fieldset className="my-4 space-y-2.5">
              <legend className="sr-only">Deals at this shop</legend>
              {s.offers.map((o) =>
                o.uses_left > 0 ? (
                  <label
                    key={o.offer_id}
                    className="flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-ink-200 p-3.5 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                  >
                    <input
                      type="radio"
                      name="offerId"
                      value={o.offer_id}
                      defaultChecked={o.offer_id === first}
                      className="size-5 accent-blue-500"
                    />
                    <span>
                      <b className="block">{o.title}</b>
                      <span className="text-sm text-ink-600">
                        {money(o.final_price)} instead of {money(o.regular_price)}. {limitLabel(o.per_student_limit, o.per_student_period)}.
                      </span>
                    </span>
                  </label>
                ) : (
                  <div
                    key={o.offer_id}
                    className="flex items-center gap-3.5 rounded-2xl border-2 border-ink-200 bg-ink-50 p-3.5 opacity-70"
                  >
                    <span className="size-5 rounded-full border-2 border-ink-300" aria-hidden />
                    <span>
                      <b className="block">{o.title}</b>
                      <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-orange-700">
                        <Clock className="size-3.5" aria-hidden /> Used{" "}
                        {limitLabel(o.per_student_limit, o.per_student_period).toLowerCase()}
                        {o.resets_at ? `. Resets ${when.format(new Date(o.resets_at))}` : ""}
                      </span>
                    </span>
                  </div>
                ),
              )}
            </fieldset>
            {first ? (
              <SubmitButton size="lg" className="w-full">
                Show my pass
              </SubmitButton>
            ) : (
              <p className="text-center text-ink-700">You&apos;ve used every deal here for now.</p>
            )}
          </form>
          <form action={cancelSession} className="pb-safe bg-white px-5 pb-4 text-center">
            <input type="hidden" name="sessionId" value={s.id} />
            <SubmitButton variant="ghost">Cancel</SubmitButton>
          </form>
        </div>
      </AreaShell>
    );
  }

  // 2. Live pass, waiting for the cashier, then for the student --------------------------
  if (s.status === "awaiting_merchant" || s.status === "awaiting_student") {
    return (
      <AreaShell area="student" immersive>
        {refresh}
        <LivePass
          firstName={s.first_name ?? "Student"}
          institution={s.institution}
          offerTitle={s.item_name ?? ""}
          place={place}
          passCode={s.status === "awaiting_merchant" ? s.pass_code : null}
          publicRef={s.public_ref}
          expiresAt={s.expires_at}
        >
          <ErrorNote text={errorText} />
          {s.status === "awaiting_merchant" ? (
            <>
              <div
                role="status"
                aria-live="polite"
                className="mt-3.5 flex items-center justify-center gap-2.5 rounded-xl bg-white/15 p-3 font-semibold backdrop-blur"
              >
                <span
                  className="size-4.5 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white motion-reduce:animate-none"
                  aria-hidden
                />
                Waiting for the cashier to confirm
              </div>
              <p className="mt-2 text-center text-sm opacity-85">
                You&apos;ll pay {money(s.final_price)} instead of {money(s.regular_price)}.
              </p>
              <CancelForm id={s.id} label="Cancel pass" light />
            </>
          ) : (
            <>
              <div className="mt-3.5 rounded-2xl bg-white p-4 text-ink-900">
                <p className="flex items-center gap-2 font-semibold text-emerald-700">
                  <CircleCheck className="size-5" aria-hidden /> The cashier confirmed
                </p>
                <p className="mt-1 text-[0.9375rem]">
                  Confirm you&apos;re paying <b>{money(s.final_price)}</b> for {s.item_name}. You save {money(s.discount_amount)}.
                </p>
                <form action={confirmAsStudent} className="mt-3">
                  <input type="hidden" name="sessionId" value={s.id} />
                  <SubmitButton size="lg" className="w-full">
                    Confirm
                  </SubmitButton>
                </form>
              </div>
              <CancelForm id={s.id} label="Cancel, I'm not buying this" light />
            </>
          )}
        </LivePass>
      </AreaShell>
    );
  }

  // 3. Results ---------------------------------------------------------------------------
  const tone = s.status === "completed" ? "bg-emerald-700" : s.status === "rejected" ? "bg-red-700" : "bg-slate-700";
  return (
    <AreaShell area="student" immersive>
      <div className={`pt-safe pb-safe flex min-h-dvh flex-col px-5 pb-5 text-white ${tone}`}>
        <div className="flex flex-col items-center pt-10 pb-5 text-center">
          <span className="grid size-26 place-items-center rounded-full bg-white">
            {s.status === "completed" ? (
              <CircleCheck className="size-14 text-emerald-700" aria-hidden />
            ) : s.status === "rejected" ? (
              <X className="size-14 text-red-700" aria-hidden />
            ) : (
              <TimerOff className="size-13 text-slate-700" aria-hidden />
            )}
          </span>
          <h1 className="mt-5 font-display text-[2rem] leading-tight font-extrabold tracking-tight">
            {s.status === "completed"
              ? "Discount redeemed"
              : s.status === "rejected"
                ? "Pass not accepted"
                : s.status === "cancelled"
                  ? "Pass cancelled"
                  : "Pass expired"}
          </h1>
          <p className="mt-1.5 max-w-[30ch] opacity-90">
            {s.status === "completed"
              ? `Pay ${s.merchant_name} the student price directly. Perqly doesn't take payments.`
              : s.status === "rejected"
                ? `${s.merchant_name} said: ${s.rejected_reason ? REJECT_REASONS[s.rejected_reason] : "no reason given"}${s.rejected_note ? ` (${s.rejected_note})` : ""}. Have a word with them, then try again.`
                : s.status === "cancelled"
                  ? "Nothing was recorded."
                  : "Passes don't last long, so nobody can reuse a screenshot. Scan again when you're at the counter."}
          </p>
        </div>
        {s.status === "completed" && s.final_price !== null && (
          <div className="rounded-3xl bg-white p-4.5 text-ink-900">
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-3 font-bold text-emerald-800">
              <span>You saved</span>
              <b className="font-display text-2xl tabular-nums">{money(s.discount_amount)}</b>
            </div>
            <dl className="mt-3 space-y-1.5 text-[0.9375rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-700">{s.item_name}</dt>
                <dd>{money(s.regular_price)}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>Amount to pay the shop</dt>
                <dd>{money(s.final_price)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-ink-600">
              {s.public_ref}
              {s.completed_at ? `, ${when.format(new Date(s.completed_at))}` : ""}
            </p>
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2.5 pt-6">
          {s.status === "completed" ? (
            <Link href="/student/history" className={`${buttonVariants({ size: "lg" })} w-full !bg-white !text-ink-900`}>
              Done
            </Link>
          ) : (
            <>
              <Link href="/student/scan" className={`${buttonVariants({ size: "lg" })} w-full !bg-white !text-ink-900`}>
                <ScanLine aria-hidden /> Scan again
              </Link>
              <Link href="/student" className="py-2 text-center font-semibold text-white/90">
                Back to deals
              </Link>
            </>
          )}
        </div>
      </div>
    </AreaShell>
  );
}
